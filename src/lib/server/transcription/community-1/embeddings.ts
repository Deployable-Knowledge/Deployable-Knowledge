/*
 * Community-1 speaker embeddings (`SpeakerDiarization.get_embeddings` with exclude_overlap).
 *
 * The public ONNX export ends in unweighted statistics pooling, while Community-1 pools the
 * ResNet frame features with the local speaker's segmentation mask as weights
 * (`resnet(fbank, weights=mask)`). The ResNet frame features are exposed as an extra graph output
 * and the weighted pooling plus the final `seg_1` projection run here.
 */

import { InferenceSession, Tensor } from 'onnxruntime-node';
import { computeFbank, countFbankFrames, MEL_BINS } from './fbank';
import { findFloatInitializer, withExtraFloatOutput } from './onnx-graph';
import { EMBEDDING_DIMENSION } from './plda';
import { CHUNK_SAMPLES, copyChunk, FRAMES_PER_CHUNK, LOCAL_SPEAKERS } from './segmentation';

const FRAME_FEATURES_OUTPUT = '/resnet/pool/Reshape_output_0';
const PROJECTION_WEIGHT = 'resnet.seg_1.weight';
const PROJECTION_BIAS = 'resnet.seg_1.bias';
const EMBEDDING_BATCH = 16;

/** `min_num_samples` of the Community-1 embedding model, measured in pyannote.audio 4.0.7. */
const MIN_EMBEDDING_SAMPLES = 400;
const MIN_CLEAN_FRAMES = Math.ceil((FRAMES_PER_CHUNK * MIN_EMBEDDING_SAMPLES) / CHUNK_SAMPLES);

const FBANK_FRAMES = countFbankFrames(CHUNK_SAMPLES);

export interface EmbeddingModel {
	session: InferenceSession;
	/** `seg_1` weight, `(256 × statsDimension)`. */
	weight: Float32Array;
	bias: Float32Array;
	statsDimension: number;
}

export async function createEmbeddingModel(modelBytes: Uint8Array): Promise<EmbeddingModel> {
	const weight = findFloatInitializer(modelBytes, PROJECTION_WEIGHT);
	const bias = findFloatInitializer(modelBytes, PROJECTION_BIAS);

	if (weight.dims.length !== 2 || weight.dims[0] !== EMBEDDING_DIMENSION) {
		throw new Error(`Unexpected ${PROJECTION_WEIGHT} shape ${weight.dims.join('x')}.`);
	}
	if (bias.dims.join('x') !== String(EMBEDDING_DIMENSION)) {
		throw new Error(`Unexpected ${PROJECTION_BIAS} shape ${bias.dims.join('x')}.`);
	}

	const session = await InferenceSession.create(
		withExtraFloatOutput(modelBytes, FRAME_FEATURES_OUTPUT)
	);
	return { session, weight: weight.data, bias: bias.data, statsDimension: weight.dims[1] };
}

/** ResNet frame features, `(batch × channels × frames)`, plus the model's own unweighted embedding. */
export async function runFrameFeatures(
	model: EmbeddingModel,
	fbank: Float32Array,
	batch: number
): Promise<{ features: Float32Array; channels: number; frames: number; embedding: Float32Array }> {
	const output = await model.session.run(
		{ fbank: new Tensor('float32', fbank, [batch, fbank.length / batch / MEL_BINS, MEL_BINS]) },
		[FRAME_FEATURES_OUTPUT, 'embedding']
	);
	const features = output[FRAME_FEATURES_OUTPUT];
	const [outputBatch, channels, frames] = features.dims;

	if (outputBatch !== batch || channels * 2 !== model.statsDimension) {
		throw new Error(`Unexpected embedding frame features shape ${features.dims.join('x')}.`);
	}

	return {
		features: features.data as Float32Array,
		channels,
		frames,
		embedding: output.embedding.data as Float32Array
	};
}

/**
 * Weighted mean/std pooling (`pyannote.audio.models.blocks.pooling._pool`) followed by `seg_1`.
 * `mask` is at segmentation-frame resolution and is resampled by nearest neighbour, as
 * `F.interpolate(mode="nearest")`.
 */
export function poolEmbedding(
	model: EmbeddingModel,
	features: Float32Array,
	channels: number,
	frames: number,
	mask: Float32Array,
	target: Float64Array
): void {
	const weights = new Float64Array(frames);
	const scale = mask.length / frames;
	let v1 = 1e-8;
	let v2 = 0;

	for (let frame = 0; frame < frames; frame++) {
		weights[frame] = mask[Math.min(mask.length - 1, Math.floor(frame * scale))];
		v1 += weights[frame];
		v2 += weights[frame] ** 2;
	}

	const stats = new Float64Array(2 * channels);
	for (let channel = 0; channel < channels; channel++) {
		const row = channel * frames;
		let mean = 0;
		for (let frame = 0; frame < frames; frame++) mean += features[row + frame] * weights[frame];
		mean /= v1;

		let variance = 0;
		for (let frame = 0; frame < frames; frame++) {
			variance += (features[row + frame] - mean) ** 2 * weights[frame];
		}
		variance /= v1 - v2 / v1 + 1e-8;

		stats[channel] = mean;
		stats[channels + channel] = Math.sqrt(variance);
	}

	for (let output = 0; output < EMBEDDING_DIMENSION; output++) {
		const row = output * model.statsDimension;
		let sum = model.bias[output];
		for (let input = 0; input < model.statsDimension; input++)
			sum += model.weight[row + input] * stats[input];
		target[output] = sum;
	}
}

/**
 * Chooses the mask used for local speaker `speaker` of a chunk: its non-overlapped frames when
 * there are enough of them, otherwise all of its frames.
 */
function speakerMask(activity: Uint8Array, chunkOffset: number, speaker: number): Float32Array {
	const full = new Float32Array(FRAMES_PER_CHUNK);
	const clean = new Float32Array(FRAMES_PER_CHUNK);
	let cleanFrames = 0;

	for (let frame = 0; frame < FRAMES_PER_CHUNK; frame++) {
		const base = chunkOffset + frame * LOCAL_SPEAKERS;
		let active = 0;
		for (let local = 0; local < LOCAL_SPEAKERS; local++) active += activity[base + local];

		full[frame] = activity[base + speaker];
		if (active < 2) {
			clean[frame] = full[frame];
			cleanFrames += clean[frame];
		}
	}

	return cleanFrames > MIN_CLEAN_FRAMES ? clean : full;
}

/** Embeddings for every (chunk, local speaker) pair, `(chunks × 3 × 256)`. */
export async function extractEmbeddings(
	model: EmbeddingModel,
	samples: Float32Array,
	activity: Uint8Array,
	chunkCount: number
): Promise<Float64Array> {
	const embeddings = new Float64Array(chunkCount * LOCAL_SPEAKERS * EMBEDDING_DIMENSION);
	const waveform = new Float32Array(CHUNK_SAMPLES);
	const chunkFbankSize = FBANK_FRAMES * MEL_BINS;

	for (let first = 0; first < chunkCount; first += EMBEDDING_BATCH) {
		const batch = Math.min(EMBEDDING_BATCH, chunkCount - first);
		const fbank = new Float32Array(batch * chunkFbankSize);

		for (let offset = 0; offset < batch; offset++) {
			copyChunk(samples, first + offset, waveform);
			computeFbank(
				waveform,
				fbank.subarray(offset * chunkFbankSize, (offset + 1) * chunkFbankSize)
			);
		}

		const { features, channels, frames } = await runFrameFeatures(model, fbank, batch);
		const chunkFeatureSize = channels * frames;

		for (let offset = 0; offset < batch; offset++) {
			const chunk = first + offset;
			const chunkFeatures = features.subarray(
				offset * chunkFeatureSize,
				(offset + 1) * chunkFeatureSize
			);

			for (let speaker = 0; speaker < LOCAL_SPEAKERS; speaker++) {
				const mask = speakerMask(activity, chunk * FRAMES_PER_CHUNK * LOCAL_SPEAKERS, speaker);
				const start = (chunk * LOCAL_SPEAKERS + speaker) * EMBEDDING_DIMENSION;
				poolEmbedding(
					model,
					chunkFeatures,
					channels,
					frames,
					mask,
					embeddings.subarray(start, start + EMBEDDING_DIMENSION)
				);
			}
		}
	}

	return embeddings;
}
