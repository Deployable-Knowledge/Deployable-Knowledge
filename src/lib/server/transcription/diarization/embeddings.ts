import { Tensor, type InferenceSession } from 'onnxruntime-node';
import { computeFbank, countFbankFrames, MEL_BINS } from './fbank';
import { CHUNK_SAMPLES, copyChunk, FRAMES_PER_CHUNK, LOCAL_SPEAKERS } from './segmentation';

export const EMBEDDING_DIMENSION = 192;

const EMBEDDING_INPUT = 'feats';
const EMBEDDING_OUTPUT = 'emb';
const MIN_EMBEDDING_SAMPLES = 640;
const MIN_CLEAN_FRAMES = Math.ceil((FRAMES_PER_CHUNK * MIN_EMBEDDING_SAMPLES) / CHUNK_SAMPLES);
const PROGRESS_INTERVAL = 16;

const maskScale = Math.fround(FRAMES_PER_CHUNK / CHUNK_SAMPLES);
const frameOfSample = Int32Array.from({ length: CHUNK_SAMPLES }, (_, sample) =>
	Math.min(FRAMES_PER_CHUNK - 1, Math.floor(Math.fround(sample * maskScale)))
);

function speakerMask(activity: Uint8Array, chunkOffset: number, speaker: number): Uint8Array {
	const full = new Uint8Array(FRAMES_PER_CHUNK);
	const clean = new Uint8Array(FRAMES_PER_CHUNK);
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

async function embedSignal(
	session: InferenceSession,
	signal: Float32Array,
	target: Float64Array
): Promise<void> {
	const output = await session.run({
		[EMBEDDING_INPUT]: new Tensor('float32', computeFbank(signal), [
			1,
			countFbankFrames(signal.length),
			MEL_BINS
		])
	});
	const embedding = output[EMBEDDING_OUTPUT];
	if (embedding.data.length !== EMBEDDING_DIMENSION) {
		throw new Error(`Unexpected speaker embedding shape ${embedding.dims.join('x')}.`);
	}
	target.set(embedding.data as Float32Array);
}

export async function extractEmbeddings(
	session: InferenceSession,
	samples: Float32Array,
	activity: Uint8Array,
	chunkCount: number,
	onProgress?: (fraction: number) => void
): Promise<Float64Array> {
	const embeddings = new Float64Array(chunkCount * LOCAL_SPEAKERS * EMBEDDING_DIMENSION).fill(NaN);
	const waveform = new Float32Array(CHUNK_SAMPLES);
	const signal = new Float32Array(CHUNK_SAMPLES);

	for (let chunk = 0; chunk < chunkCount; chunk++) {
		copyChunk(samples, chunk, waveform);

		for (let speaker = 0; speaker < LOCAL_SPEAKERS; speaker++) {
			const mask = speakerMask(activity, chunk * FRAMES_PER_CHUNK * LOCAL_SPEAKERS, speaker);
			let length = 0;
			for (let sample = 0; sample < CHUNK_SAMPLES; sample++) {
				if (mask[frameOfSample[sample]]) signal[length++] = waveform[sample];
			}
			if (length < MIN_EMBEDDING_SAMPLES) continue;

			const start = (chunk * LOCAL_SPEAKERS + speaker) * EMBEDDING_DIMENSION;
			await embedSignal(
				session,
				signal.subarray(0, length),
				embeddings.subarray(start, start + EMBEDDING_DIMENSION)
			);
		}

		if ((chunk + 1) % PROGRESS_INTERVAL === 0 || chunk === chunkCount - 1) {
			onProgress?.((chunk + 1) / chunkCount);
		}
	}

	return embeddings;
}
