import type { SpeakerTurn } from '../speaker-turn';
import { UNASSIGNED } from './clustering';
import { closestFrame, roundHalfEven } from './rounding';
import { CHUNK_WINDOW, FRAME_WINDOW, FRAMES_PER_CHUNK, LOCAL_SPEAKERS } from './segmentation';

const AGGREGATE_EPSILON = 1e-12;
const BINARIZE_THRESHOLD = 0.5;

interface FrameScores {
	frames: number;
	classes: number;
	data: Float32Array;
}

function globalFrameCount(chunkCount: number): number {
	const end = CHUNK_WINDOW.start + CHUNK_WINDOW.duration + (chunkCount - 1) * CHUNK_WINDOW.step;
	return closestFrame(end + 0.5 * FRAME_WINDOW.duration, FRAME_WINDOW) + 1;
}

function aggregate(
	scores: Float32Array,
	chunkCount: number,
	classes: number,
	skipAverage: boolean
): FrameScores {
	const frames = globalFrameCount(chunkCount);
	const output = new Float32Array(frames * classes);
	const overlap = new Float32Array(frames * classes);
	const covered = new Uint8Array(frames * classes);

	for (let chunk = 0; chunk < chunkCount; chunk++) {
		const chunkStart = CHUNK_WINDOW.start + chunk * CHUNK_WINDOW.step;
		const startFrame = closestFrame(chunkStart + 0.5 * FRAME_WINDOW.duration, FRAME_WINDOW);

		for (let frame = 0; frame < FRAMES_PER_CHUNK; frame++) {
			const target = startFrame + frame;
			if (target >= frames) break;

			for (let label = 0; label < classes; label++) {
				const score = scores[(chunk * FRAMES_PER_CHUNK + frame) * classes + label];
				if (Number.isNaN(score)) continue;
				output[target * classes + label] += score;
				overlap[target * classes + label] += 1;
				covered[target * classes + label] = 1;
			}
		}
	}

	for (let index = 0; index < output.length; index++) {
		if (!covered[index]) {
			output[index] = 0;
			continue;
		}
		if (!skipAverage) output[index] = output[index] / Math.max(overlap[index], AGGREGATE_EPSILON);
	}

	return { frames, classes, data: output };
}

export function speakerCount(activity: Uint8Array, chunkCount: number): Uint8Array {
	const perChunk = new Float32Array(chunkCount * FRAMES_PER_CHUNK);
	for (let frame = 0; frame < perChunk.length; frame++) {
		for (let speaker = 0; speaker < LOCAL_SPEAKERS; speaker++) {
			perChunk[frame] += activity[frame * LOCAL_SPEAKERS + speaker];
		}
	}

	const averaged = aggregate(perChunk, chunkCount, 1, false);
	return Uint8Array.from(averaged.data, (value) => roundHalfEven(value));
}

export function clusteredSegmentation(
	activity: Uint8Array,
	hardClusters: Int32Array,
	chunkCount: number
): { clusters: number; data: Float32Array } {
	const clusters = hardClusters.reduce((maximum, cluster) => Math.max(maximum, cluster), -1) + 1;
	const data = new Float32Array(chunkCount * FRAMES_PER_CHUNK * clusters).fill(NaN);

	for (let chunk = 0; chunk < chunkCount; chunk++) {
		for (let speaker = 0; speaker < LOCAL_SPEAKERS; speaker++) {
			const cluster = hardClusters[chunk * LOCAL_SPEAKERS + speaker];
			if (cluster === UNASSIGNED) continue;

			for (let frame = 0; frame < FRAMES_PER_CHUNK; frame++) {
				const target = (chunk * FRAMES_PER_CHUNK + frame) * clusters + cluster;
				const value = activity[(chunk * FRAMES_PER_CHUNK + frame) * LOCAL_SPEAKERS + speaker];
				data[target] = Number.isNaN(data[target]) ? value : Math.max(data[target], value);
			}
		}
	}

	return { clusters, data };
}

export function toDiarization(
	clustered: { clusters: number; data: Float32Array },
	chunkCount: number,
	count: Uint8Array
): FrameScores {
	const activations = aggregate(clustered.data, chunkCount, clustered.clusters, true);
	const maxCount = count.reduce((maximum, value) => Math.max(maximum, value), 0);
	const classes = Math.max(activations.classes, maxCount);
	const frames = Math.min(activations.frames, count.length);
	const binary = new Float32Array(frames * classes);
	const order = Array.from({ length: classes }, (_, index) => index);

	for (let frame = 0; frame < frames; frame++) {
		const activation = (label: number) =>
			label < activations.classes ? activations.data[frame * activations.classes + label] : 0;
		const ranked = [...order].sort((left, right) => activation(right) - activation(left));
		for (let rank = 0; rank < count[frame]; rank++) binary[frame * classes + ranked[rank]] = 1;
	}

	return { frames, classes, data: binary };
}

export function binarizeToTurns(diarization: FrameScores): SpeakerTurn[] {
	const turns: SpeakerTurn[] = [];
	const middle = (frame: number) =>
		FRAME_WINDOW.start + frame * FRAME_WINDOW.step + 0.5 * FRAME_WINDOW.duration;

	if (diarization.frames === 0) return turns;

	for (let speaker = 0; speaker < diarization.classes; speaker++) {
		const value = (frame: number) => diarization.data[frame * diarization.classes + speaker];
		let start = middle(0);
		let active = value(0) > BINARIZE_THRESHOLD;

		for (let frame = 1; frame < diarization.frames; frame++) {
			if (active && value(frame) < BINARIZE_THRESHOLD) {
				turns.push({ start, end: middle(frame), speaker });
				active = false;
			} else if (!active && value(frame) > BINARIZE_THRESHOLD) {
				start = middle(frame);
				active = true;
			}
		}

		if (active) turns.push({ start, end: middle(diarization.frames - 1), speaker });
	}

	return turns.sort(
		(left, right) =>
			left.start - right.start || left.end - right.end || left.speaker - right.speaker
	);
}
