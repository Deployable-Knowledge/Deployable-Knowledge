import { Tensor, type InferenceSession } from 'onnxruntime-node';
import {
	computeLogMelFrames,
	countFbankFrames,
	FBANK_HOP,
	MEL_BINS,
	normalizeFbank
} from './fbank';
import { CHUNK_SAMPLES, FRAMES_PER_CHUNK, LOCAL_SPEAKERS, STEP_SAMPLES } from './segmentation';

export const EMBEDDING_DIMENSION = 192;

const EMBEDDING_INPUT = 'feats';
const EMBEDDING_OUTPUT = 'emb';
const MIN_EMBEDDING_SAMPLES = 640;
const MIN_EMBEDDING_FRAMES = countFbankFrames(MIN_EMBEDDING_SAMPLES);
const MIN_CLEAN_FRAMES = Math.ceil((FRAMES_PER_CHUNK * MIN_EMBEDDING_SAMPLES) / CHUNK_SAMPLES);
const PROGRESS_INTERVAL = 16;

const FBANK_FRAMES_PER_CHUNK = countFbankFrames(CHUNK_SAMPLES);
const FBANK_FRAMES_PER_STEP = STEP_SAMPLES / FBANK_HOP;
const FBANK_FRAMES_KEPT = FBANK_FRAMES_PER_CHUNK - FBANK_FRAMES_PER_STEP;

const maskScale = Math.fround(FRAMES_PER_CHUNK / CHUNK_SAMPLES);
const frameOfSample = Int32Array.from({ length: CHUNK_SAMPLES }, (_, sample) =>
	Math.min(FRAMES_PER_CHUNK - 1, Math.floor(Math.fround(sample * maskScale)))
);
const samplesPerMaskFrame = new Int32Array(FRAMES_PER_CHUNK);
for (const frame of frameOfSample) samplesPerMaskFrame[frame]++;
const maskFrameOfFbankFrame = Int32Array.from(
	{ length: FBANK_FRAMES_PER_CHUNK },
	(_, frame) => frameOfSample[Math.min(frame * FBANK_HOP, CHUNK_SAMPLES - 1)]
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

// Chunks advance by a whole number of fbank hops, so each chunk reuses the previous chunk's
// log-mel frames and computes only the frames that entered the window.
function advanceLogMelWindow(samples: Float32Array, chunk: number, logMel: Float64Array): void {
	if (chunk === 0) {
		computeLogMelFrames(samples, 0, FBANK_FRAMES_PER_CHUNK, logMel);
		return;
	}
	logMel.copyWithin(0, FBANK_FRAMES_PER_STEP * MEL_BINS);
	computeLogMelFrames(
		samples,
		chunk * FBANK_FRAMES_PER_STEP + FBANK_FRAMES_KEPT,
		FBANK_FRAMES_PER_STEP,
		logMel.subarray(FBANK_FRAMES_KEPT * MEL_BINS)
	);
}

function selectMaskedFrames(
	logMel: Float64Array,
	mask: Uint8Array,
	selected: Float64Array
): number {
	let frameCount = 0;
	for (let frame = 0; frame < FBANK_FRAMES_PER_CHUNK; frame++) {
		if (!mask[maskFrameOfFbankFrame[frame]]) continue;
		selected.set(logMel.subarray(frame * MEL_BINS, (frame + 1) * MEL_BINS), frameCount * MEL_BINS);
		frameCount++;
	}
	return frameCount;
}

async function embedFeatures(
	session: InferenceSession,
	features: Float32Array,
	frameCount: number,
	target: Float64Array
): Promise<void> {
	const output = await session.run({
		[EMBEDDING_INPUT]: new Tensor('float32', features, [1, frameCount, MEL_BINS])
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
	const logMel = new Float64Array(FBANK_FRAMES_PER_CHUNK * MEL_BINS);
	const selected = new Float64Array(FBANK_FRAMES_PER_CHUNK * MEL_BINS);
	const features = new Float32Array(FBANK_FRAMES_PER_CHUNK * MEL_BINS);

	for (let chunk = 0; chunk < chunkCount; chunk++) {
		advanceLogMelWindow(samples, chunk, logMel);

		for (let speaker = 0; speaker < LOCAL_SPEAKERS; speaker++) {
			const mask = speakerMask(activity, chunk * FRAMES_PER_CHUNK * LOCAL_SPEAKERS, speaker);
			let sampleCount = 0;
			for (let frame = 0; frame < FRAMES_PER_CHUNK; frame++) {
				if (mask[frame]) sampleCount += samplesPerMaskFrame[frame];
			}
			if (sampleCount < MIN_EMBEDDING_SAMPLES) continue;

			const frameCount = selectMaskedFrames(logMel, mask, selected);
			if (frameCount < MIN_EMBEDDING_FRAMES) continue;

			const start = (chunk * LOCAL_SPEAKERS + speaker) * EMBEDDING_DIMENSION;
			await embedFeatures(
				session,
				normalizeFbank(selected, frameCount, features),
				frameCount,
				embeddings.subarray(start, start + EMBEDDING_DIMENSION)
			);
		}

		if ((chunk + 1) % PROGRESS_INTERVAL === 0 || chunk === chunkCount - 1) {
			onProgress?.((chunk + 1) / chunkCount);
		}
	}

	return embeddings;
}
