/*
 * Sliding-window speaker segmentation, as pyannote's `Inference.slide` with the Community-1
 * powerset model: 10 s windows every 1 s, 589 output frames per window, 3 local speakers.
 */

import { Tensor, type InferenceSession } from 'onnxruntime-node';
import type { SlidingWindow } from './rounding';

export const SAMPLE_RATE = 16_000;
export const CHUNK_SAMPLES = 10 * SAMPLE_RATE;
export const STEP_SAMPLES = SAMPLE_RATE;
export const FRAMES_PER_CHUNK = 589;
export const LOCAL_SPEAKERS = 3;

/** Chunk grid in seconds. */
export const CHUNK_WINDOW: SlidingWindow = { start: 0, duration: 10, step: 1 };

/** Output frame grid of the segmentation model (its receptive field). */
export const FRAME_WINDOW: SlidingWindow = { start: 0, duration: 0.0619375, step: 0.016875 };

const POWERSET_CLASSES = 7;
const SEGMENTATION_BATCH = 32;

/** Local speakers active in each powerset class: {}, {0}, {1}, {2}, {0,1}, {0,2}, {1,2}. */
const POWERSET_MAPPING: readonly (readonly number[])[] = [
	[0, 0, 0],
	[1, 0, 0],
	[0, 1, 0],
	[0, 0, 1],
	[1, 1, 0],
	[1, 0, 1],
	[0, 1, 1]
];

export function countChunks(sampleCount: number): number {
	const fullChunks =
		sampleCount >= CHUNK_SAMPLES ? Math.floor((sampleCount - CHUNK_SAMPLES) / STEP_SAMPLES) + 1 : 0;
	const hasLastChunk =
		sampleCount < CHUNK_SAMPLES || (sampleCount - CHUNK_SAMPLES) % STEP_SAMPLES > 0;

	return fullChunks + (hasLastChunk ? 1 : 0);
}

/** Copies chunk `index` into `target`, zero-padding past the end of the audio. */
export function copyChunk(samples: Float32Array, index: number, target: Float32Array): void {
	const start = index * STEP_SAMPLES;
	const available = samples.subarray(start, Math.min(samples.length, start + CHUNK_SAMPLES));
	target.set(available);
	target.fill(0, available.length);
}

/** Raw powerset log-probabilities, `(chunks × 589 × 7)`. */
export async function runSegmentation(
	session: InferenceSession,
	samples: Float32Array
): Promise<{ chunkCount: number; scores: Float32Array }> {
	const chunkCount = countChunks(samples.length);
	const scores = new Float32Array(chunkCount * FRAMES_PER_CHUNK * POWERSET_CLASSES);

	for (let first = 0; first < chunkCount; first += SEGMENTATION_BATCH) {
		const batch = Math.min(SEGMENTATION_BATCH, chunkCount - first);
		const input = new Float32Array(batch * CHUNK_SAMPLES);

		for (let offset = 0; offset < batch; offset++) {
			copyChunk(
				samples,
				first + offset,
				input.subarray(offset * CHUNK_SAMPLES, (offset + 1) * CHUNK_SAMPLES)
			);
		}

		const output = await session.run({
			waveform: new Tensor('float32', input, [batch, 1, CHUNK_SAMPLES])
		});
		const batchScores = output.scores;

		if (batchScores.dims.join('x') !== `${batch}x${FRAMES_PER_CHUNK}x${POWERSET_CLASSES}`) {
			throw new Error(`Unexpected segmentation output shape ${batchScores.dims.join('x')}.`);
		}

		scores.set(batchScores.data as Float32Array, first * FRAMES_PER_CHUNK * POWERSET_CLASSES);
	}

	return { chunkCount, scores };
}

/** Hard powerset decoding to local-speaker activity, `(chunks × 589 × 3)` of 0/1. */
export function decodePowerset(scores: Float32Array, chunkCount: number): Uint8Array {
	const activity = new Uint8Array(chunkCount * FRAMES_PER_CHUNK * LOCAL_SPEAKERS);

	for (let frame = 0; frame < chunkCount * FRAMES_PER_CHUNK; frame++) {
		let best = 0;
		for (let powersetClass = 1; powersetClass < POWERSET_CLASSES; powersetClass++) {
			if (
				scores[frame * POWERSET_CLASSES + powersetClass] > scores[frame * POWERSET_CLASSES + best]
			) {
				best = powersetClass;
			}
		}
		activity.set(POWERSET_MAPPING[best], frame * LOCAL_SPEAKERS);
	}

	return activity;
}
