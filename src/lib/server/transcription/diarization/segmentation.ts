import { Tensor, type InferenceSession } from 'onnxruntime-node';
import type { SlidingWindow } from './rounding';

export const SAMPLE_RATE = 16_000;
export const CHUNK_SAMPLES = 10 * SAMPLE_RATE;
export const STEP_SAMPLES = SAMPLE_RATE;
export const FRAMES_PER_CHUNK = 589;
export const LOCAL_SPEAKERS = 3;

export const CHUNK_WINDOW: SlidingWindow = { start: 0, duration: 10, step: 1 };

export const FRAME_WINDOW: SlidingWindow = { start: 0, duration: 0.0619375, step: 0.016875 };

const POWERSET_CLASSES = 7;
const SEGMENTATION_BATCH = 32;

const POWERSET_MAPPING: readonly (readonly number[])[] = [
	[0, 0, 0],
	[1, 0, 0],
	[0, 1, 0],
	[0, 0, 1],
	[1, 1, 0],
	[1, 0, 1],
	[0, 1, 1]
];

function countChunks(sampleCount: number): number {
	const fullChunks =
		sampleCount >= CHUNK_SAMPLES ? Math.floor((sampleCount - CHUNK_SAMPLES) / STEP_SAMPLES) + 1 : 0;
	const hasLastChunk =
		sampleCount < CHUNK_SAMPLES || (sampleCount - CHUNK_SAMPLES) % STEP_SAMPLES > 0;

	return fullChunks + (hasLastChunk ? 1 : 0);
}

function copyChunk(samples: Float32Array, index: number, target: Float32Array): void {
	const start = index * STEP_SAMPLES;
	const available = samples.subarray(start, Math.min(samples.length, start + CHUNK_SAMPLES));
	target.set(available);
	target.fill(0, available.length);
}

function decodeBatch(
	scores: Float32Array,
	frameCount: number,
	activity: Uint8Array,
	firstFrame: number
): void {
	for (let frame = 0; frame < frameCount; frame++) {
		let best = 0;
		for (let powersetClass = 1; powersetClass < POWERSET_CLASSES; powersetClass++) {
			if (
				scores[frame * POWERSET_CLASSES + powersetClass] > scores[frame * POWERSET_CLASSES + best]
			) {
				best = powersetClass;
			}
		}
		activity.set(POWERSET_MAPPING[best], (firstFrame + frame) * LOCAL_SPEAKERS);
	}
}

export async function runSegmentation(
	session: InferenceSession,
	samples: Float32Array
): Promise<{ chunkCount: number; activity: Uint8Array }> {
	const chunkCount = countChunks(samples.length);
	const activity = new Uint8Array(chunkCount * FRAMES_PER_CHUNK * LOCAL_SPEAKERS);
	const input = new Float32Array(Math.min(SEGMENTATION_BATCH, chunkCount) * CHUNK_SAMPLES);

	for (let first = 0; first < chunkCount; first += SEGMENTATION_BATCH) {
		const batch = Math.min(SEGMENTATION_BATCH, chunkCount - first);
		const batchInput = input.subarray(0, batch * CHUNK_SAMPLES);

		for (let offset = 0; offset < batch; offset++) {
			copyChunk(
				samples,
				first + offset,
				batchInput.subarray(offset * CHUNK_SAMPLES, (offset + 1) * CHUNK_SAMPLES)
			);
		}

		const output = await session.run({
			input_values: new Tensor('float32', batchInput, [batch, 1, CHUNK_SAMPLES])
		});
		const batchScores = output.logits;

		if (batchScores.dims.join('x') !== `${batch}x${FRAMES_PER_CHUNK}x${POWERSET_CLASSES}`) {
			throw new Error(`Unexpected segmentation output shape ${batchScores.dims.join('x')}.`);
		}

		decodeBatch(
			batchScores.data as Float32Array,
			batch * FRAMES_PER_CHUNK,
			activity,
			first * FRAMES_PER_CHUNK
		);
	}

	return { chunkCount, activity };
}
