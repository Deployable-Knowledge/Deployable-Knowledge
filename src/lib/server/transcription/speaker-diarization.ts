import {
	AutoFeatureExtractor,
	AutoModel,
	ModelRegistry,
	type ProgressCallback,
	type Tensor
} from '@huggingface/transformers';
import type { TranscriptSegment } from './transcription-model';
import { INFERENCE_THREADS } from '#lib/server/utils/inference-threads';
import { TRANSFORMERS_CACHE_DIR } from '#lib/server/utils/transformers-env';

export const SPEAKER_EMBEDDING_MODEL = 'onnx-community/wespeaker-voxceleb-resnet34-LM';

const SAMPLES_PER_MS = 16;
const MAX_EMBED_MS = 10_000;
const MIN_EMBED_MS = 500;
const MIN_CLUSTER_MS = 1500;
const MAX_CLUSTER_SEGMENTS = 500;
const MIN_CLUSTER_SIMILARITY = 0.45;
const MIN_SPEAKER_MS = 40_000;

type FeatureExtractor = Awaited<ReturnType<typeof AutoFeatureExtractor.from_pretrained>>;

type EmbeddingModel = Awaited<ReturnType<typeof AutoModel.from_pretrained>>;

type SpeakerRuntime = {
	extractor: FeatureExtractor;
	model: EmbeddingModel;
};

type SegmentEmbedding = {
	index: number;
	durationMs: number;
	vector: Float32Array;
};

let runtimePromise: Promise<SpeakerRuntime> | undefined;

async function loadRuntime(progress_callback?: ProgressCallback): Promise<SpeakerRuntime> {
	const options = { cache_dir: TRANSFORMERS_CACHE_DIR, progress_callback };

	const [extractor, model] = await Promise.all([
		AutoFeatureExtractor.from_pretrained(SPEAKER_EMBEDDING_MODEL, options),
		AutoModel.from_pretrained(SPEAKER_EMBEDDING_MODEL, {
			...options,
			session_options: { intraOpNumThreads: INFERENCE_THREADS, interOpNumThreads: 1 }
		})
	]);
	return { extractor, model };
}

export function isSpeakerModelInstalled(): Promise<boolean> {
	return ModelRegistry.is_cached(SPEAKER_EMBEDDING_MODEL, { cache_dir: TRANSFORMERS_CACHE_DIR });
}

export async function installSpeakerModel(progress_callback: ProgressCallback): Promise<void> {
	const { model } = await loadRuntime(progress_callback);
	await model.dispose();
}

function getRuntime(): Promise<SpeakerRuntime> {
	runtimePromise ??= loadRuntime().catch((error) => {
		runtimePromise = undefined;
		throw error;
	});
	return runtimePromise;
}

function dot(a: Float32Array, b: Float32Array): number {
	let sum = 0;
	for (let index = 0; index < a.length; index += 1) sum += a[index] * b[index];
	return sum;
}

function normalize(vector: Float32Array): Float32Array {
	const norm = Math.sqrt(dot(vector, vector)) || 1;
	return vector.map((value) => value / norm);
}

async function embedSpeech(runtime: SpeakerRuntime, speech: Float32Array): Promise<Float32Array> {
	const inputs = await runtime.extractor(speech);
	let embedding: Tensor | undefined;

	try {
		embedding = (await runtime.model(inputs)).last_hidden_state;

		if (!(embedding?.data instanceof Float32Array)) {
			throw new Error('Speaker model returned a non-float32 embedding');
		}

		return normalize(embedding.data);
	} finally {
		embedding?.dispose();
		inputs.input_features.dispose();
	}
}

async function embedSegments(
	audio: Float32Array,
	segments: TranscriptSegment[]
): Promise<SegmentEmbedding[]> {
	const runtime = await getRuntime();
	const embeddings: SegmentEmbedding[] = [];

	for (const [index, segment] of segments.entries()) {
		const durationMs = segment.endMs - segment.startMs;
		if (durationMs < MIN_EMBED_MS) continue;

		const cropMs = Math.max(0, durationMs - MAX_EMBED_MS) / 2;
		const start = Math.round((segment.startMs + cropMs) * SAMPLES_PER_MS);
		const end = Math.min(audio.length, Math.round((segment.endMs - cropMs) * SAMPLES_PER_MS));
		if (end - start < MIN_EMBED_MS * SAMPLES_PER_MS) continue;

		const vector = await embedSpeech(runtime, audio.subarray(start, end));
		embeddings.push({ index, durationMs, vector });
	}

	return embeddings;
}

function clusterEmbeddings(vectors: Float32Array[]): number[] {
	const count = vectors.length;
	const similarities = new Float64Array(count * count);
	const sizes = new Array<number>(count).fill(1);
	const active = new Array<boolean>(count).fill(true);
	const labels = vectors.map((_, index) => index);

	for (let i = 0; i < count; i += 1) {
		for (let j = i + 1; j < count; j += 1) {
			const similarity = dot(vectors[i], vectors[j]);
			similarities[i * count + j] = similarity;
			similarities[j * count + i] = similarity;
		}
	}

	for (;;) {
		let closest = -Infinity;
		let into = -1;
		let from = -1;

		for (let i = 0; i < count; i += 1) {
			if (!active[i]) continue;
			for (let j = i + 1; j < count; j += 1) {
				if (active[j] && similarities[i * count + j] > closest) {
					closest = similarities[i * count + j];
					into = i;
					from = j;
				}
			}
		}

		if (closest < MIN_CLUSTER_SIMILARITY) return labels;

		const total = sizes[into] + sizes[from];
		for (let k = 0; k < count; k += 1) {
			if (!active[k] || k === into || k === from) continue;

			const similarity =
				(sizes[into] * similarities[k * count + into] +
					sizes[from] * similarities[k * count + from]) /
				total;
			similarities[k * count + into] = similarity;
			similarities[into * count + k] = similarity;
		}

		sizes[into] = total;
		active[from] = false;
		for (let k = 0; k < count; k += 1) {
			if (labels[k] === from) labels[k] = into;
		}
	}
}

function speechMs(embeddings: SegmentEmbedding[]): number {
	return embeddings.reduce((total, { durationMs }) => total + durationMs, 0);
}

function speakerCentroids(embeddings: SegmentEmbedding[]): Float32Array[] {
	const candidates = embeddings.filter(({ durationMs }) => durationMs >= MIN_CLUSTER_MS);
	if (candidates.length < 2) return [];

	const sampleCount = Math.min(candidates.length, MAX_CLUSTER_SEGMENTS);
	const step = candidates.length / sampleCount;
	const sampled = Array.from(
		{ length: sampleCount },
		(_, index) => candidates[Math.floor(index * step)]
	);

	const clusters = new Map<number, SegmentEmbedding[]>();
	clusterEmbeddings(sampled.map(({ vector }) => vector)).forEach((label, index) => {
		const members = clusters.get(label);
		if (members) members.push(sampled[index]);
		else clusters.set(label, [sampled[index]]);
	});

	const minSpeakerMs = Math.min(MIN_SPEAKER_MS / step, 0.1 * speechMs(sampled));

	return [...clusters.values()]
		.filter((members) => speechMs(members) >= minSpeakerMs)
		.map((members) => {
			const sum = new Float32Array(members[0].vector.length);
			for (const { vector } of members) {
				for (let index = 0; index < sum.length; index += 1) sum[index] += vector[index];
			}
			return normalize(sum);
		});
}

function nearestCentroid(vector: Float32Array, centroids: Float32Array[]): number {
	let best = 0;
	for (let index = 1; index < centroids.length; index += 1) {
		if (dot(vector, centroids[index]) > dot(vector, centroids[best])) best = index;
	}
	return best;
}

export async function labelSpeakers(
	audio: Float32Array,
	segments: TranscriptSegment[]
): Promise<TranscriptSegment[]> {
	if (segments.length < 2) return segments;

	const embeddings = await embedSegments(audio, segments);
	const centroids = speakerCentroids(embeddings);
	if (centroids.length < 2) return segments;

	const clusterBySegment = new Map(
		embeddings.map(({ index, vector }) => [index, nearestCentroid(vector, centroids)])
	);

	let cluster = clusterBySegment.get(embeddings[0].index) ?? 0;
	const speakerByCluster = new Map<number, number>();

	const labelled = segments.map((segment, index) => {
		cluster = clusterBySegment.get(index) ?? cluster;

		let speaker = speakerByCluster.get(cluster);
		if (speaker === undefined) {
			speaker = speakerByCluster.size + 1;
			speakerByCluster.set(cluster, speaker);
		}
		return { ...segment, speaker };
	});

	return speakerByCluster.size < 2 ? segments : labelled;
}
