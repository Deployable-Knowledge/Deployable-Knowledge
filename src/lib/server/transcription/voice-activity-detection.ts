import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { InferenceSession, Tensor } from 'onnxruntime-node';
import { AUDIO_SAMPLE_RATE, sliceAudioChunk, type AudioChunk } from './audio-types';

const VAD_MODEL_PATH = resolve(process.cwd(), 'models', 'vad', 'silero_vad_v4.onnx');

const VAD_WINDOW_SAMPLES = 512;
const VAD_STATE_DIMS = [2, 1, 64];
const VAD_STATE_SIZE = 2 * 64;

const fromMilliseconds = (milliseconds: number) => (AUDIO_SAMPLE_RATE * milliseconds) / 1000;

const SPEECH_THRESHOLD = 0.5;
const SILENCE_THRESHOLD = Math.max(SPEECH_THRESHOLD - 0.15, 0.01);
const MIN_SPEECH_SAMPLES = fromMilliseconds(250);
const MIN_SILENCE_SAMPLES = fromMilliseconds(500);
const SPEECH_PAD_SAMPLES = fromMilliseconds(30);
const MAX_SPEECH_SAMPLES = fromMilliseconds(25_000) - VAD_WINDOW_SAMPLES - 2 * SPEECH_PAD_SAMPLES;
const MIN_SILENCE_SAMPLES_AT_MAX_SPEECH = fromMilliseconds(98);

const MAX_CHUNK_SAMPLES = 28 * AUDIO_SAMPLE_RATE;
const MAX_MERGE_GAP_SAMPLES = Math.round(0.75 * AUDIO_SAMPLE_RATE);
const CHUNK_PADDING_SAMPLES = Math.round(0.25 * AUDIO_SAMPLE_RATE);

interface SpeechRange {
	startSample: number;
	endSample: number;
}

let vadSession: Promise<InferenceSession> | undefined;

function getVadSession(): Promise<InferenceSession> {
	vadSession ??= InferenceSession.create(VAD_MODEL_PATH, {
		intraOpNumThreads: 1,
		interOpNumThreads: 1
	}).catch((error: unknown) => {
		vadSession = undefined;
		throw error;
	});
	return vadSession;
}

async function speechProbabilities(
	session: InferenceSession,
	audioData: Float32Array
): Promise<Float32Array> {
	const probabilities = new Float32Array(Math.ceil(audioData.length / VAD_WINDOW_SAMPLES));
	const sampleRate = new Tensor('int64', BigInt64Array.of(BigInt(AUDIO_SAMPLE_RATE)), []);
	const window = new Float32Array(VAD_WINDOW_SAMPLES);
	let h: Float32Array = new Float32Array(VAD_STATE_SIZE);
	let c: Float32Array = new Float32Array(VAD_STATE_SIZE);

	for (let index = 0; index < probabilities.length; index++) {
		const samples = audioData.subarray(
			index * VAD_WINDOW_SAMPLES,
			(index + 1) * VAD_WINDOW_SAMPLES
		);
		window.set(samples);
		window.fill(0, samples.length);

		const output = await session.run({
			input: new Tensor('float32', window, [1, VAD_WINDOW_SAMPLES]),
			sr: sampleRate,
			h: new Tensor('float32', h, VAD_STATE_DIMS),
			c: new Tensor('float32', c, VAD_STATE_DIMS)
		});
		h = output.hn.data as Float32Array;
		c = output.cn.data as Float32Array;
		probabilities[index] = (output.output.data as Float32Array)[0];
	}

	return probabilities;
}

// Port of get_speech_timestamps_from_probs from silero-vad 6.2.3 (MIT) with
// use_max_poss_sil_at_max_speech enabled; the branch order matters.
function speechRanges(probabilities: Float32Array, sampleCount: number): SpeechRange[] {
	const ranges: SpeechRange[] = [];
	let triggered = false;
	let start: number | undefined;
	let tempEnd = 0;
	let possibleEnds: Array<[end: number, silence: number]> = [];

	for (let index = 0; index < probabilities.length; index++) {
		const probability = probabilities[index];
		const sample = VAD_WINDOW_SAMPLES * index;

		if (probability >= SPEECH_THRESHOLD && tempEnd) {
			const silence = sample - tempEnd;
			if (silence > MIN_SILENCE_SAMPLES_AT_MAX_SPEECH) possibleEnds.push([tempEnd, silence]);
			tempEnd = 0;
		}

		if (probability >= SPEECH_THRESHOLD && !triggered) {
			triggered = true;
			start = sample;
			continue;
		}

		if (triggered && start !== undefined && sample - start > MAX_SPEECH_SAMPLES) {
			if (possibleEnds.length > 0) {
				const [end, silence] = possibleEnds.reduce((longest, candidate) =>
					candidate[1] > longest[1] ? candidate : longest
				);
				ranges.push({ startSample: start, endSample: end });
				start = undefined;
				if (end + silence < end + sample) start = end + silence;
				else triggered = false;
				tempEnd = 0;
				possibleEnds = [];
			} else {
				ranges.push({ startSample: start, endSample: sample });
				start = undefined;
				tempEnd = 0;
				triggered = false;
				possibleEnds = [];
				continue;
			}
		}

		if (probability < SILENCE_THRESHOLD && triggered) {
			if (!tempEnd) tempEnd = sample;
			if (sample - tempEnd < MIN_SILENCE_SAMPLES) continue;

			if (start !== undefined && tempEnd - start > MIN_SPEECH_SAMPLES) {
				ranges.push({ startSample: start, endSample: tempEnd });
			}
			start = undefined;
			tempEnd = 0;
			triggered = false;
			possibleEnds = [];
		}
	}

	if (start !== undefined && sampleCount - start > MIN_SPEECH_SAMPLES) {
		ranges.push({ startSample: start, endSample: sampleCount });
	}

	return padSpeechRanges(ranges, sampleCount);
}

function padSpeechRanges(ranges: SpeechRange[], sampleCount: number): SpeechRange[] {
	ranges.forEach((range, index) => {
		if (index === 0) range.startSample = Math.max(0, range.startSample - SPEECH_PAD_SAMPLES);

		const next = ranges[index + 1];
		if (!next) {
			range.endSample = Math.min(sampleCount, range.endSample + SPEECH_PAD_SAMPLES);
			return;
		}

		const silence = next.startSample - range.endSample;
		if (silence < 2 * SPEECH_PAD_SAMPLES) {
			range.endSample += Math.floor(silence / 2);
			next.startSample = Math.max(0, next.startSample - Math.floor(silence / 2));
		} else {
			range.endSample = Math.min(sampleCount, range.endSample + SPEECH_PAD_SAMPLES);
			next.startSample = Math.max(0, next.startSample - SPEECH_PAD_SAMPLES);
		}
	});
	return ranges;
}

function splitLongRanges(ranges: SpeechRange[]): SpeechRange[] {
	const splitRanges: SpeechRange[] = [];

	for (const range of ranges) {
		for (
			let startSample = range.startSample;
			startSample < range.endSample;
			startSample += MAX_CHUNK_SAMPLES
		) {
			splitRanges.push({
				startSample,
				endSample: Math.min(range.endSample, startSample + MAX_CHUNK_SAMPLES)
			});
		}
	}

	return splitRanges;
}

function mergeSpeechRanges(ranges: SpeechRange[]): SpeechRange[] {
	const mergedRanges: SpeechRange[] = [];

	for (const range of splitLongRanges(ranges)) {
		const previous = mergedRanges.at(-1);

		if (!previous) {
			mergedRanges.push({ ...range });
			continue;
		}

		const gapSamples = range.startSample - previous.endSample;
		const combinedEndSample = Math.max(previous.endSample, range.endSample);
		const combinedLength = combinedEndSample - previous.startSample;

		if (gapSamples <= MAX_MERGE_GAP_SAMPLES && combinedLength <= MAX_CHUNK_SAMPLES) {
			previous.endSample = combinedEndSample;
			continue;
		}

		mergedRanges.push({ ...range });
	}

	return mergedRanges;
}

function createPaddedChunks(audioData: Float32Array, ranges: SpeechRange[]): AudioChunk[] {
	return ranges.map((range, index) => {
		const previous = ranges[index - 1];
		const next = ranges[index + 1];

		let leftBoundary = 0;
		if (previous) {
			leftBoundary = Math.floor((previous.endSample + range.startSample) / 2);
		}

		let rightBoundary = audioData.length;
		if (next) {
			rightBoundary = Math.floor((range.endSample + next.startSample) / 2);
		}

		const startSample = Math.max(leftBoundary, range.startSample - CHUNK_PADDING_SAMPLES);
		const endSample = Math.min(rightBoundary, range.endSample + CHUNK_PADDING_SAMPLES);

		return sliceAudioChunk(audioData, startSample, endSample);
	});
}

export async function detectSpeechChunks(audioData: Float32Array): Promise<AudioChunk[]> {
	if (!existsSync(VAD_MODEL_PATH)) {
		throw new Error(`Silero VAD model is missing from ${VAD_MODEL_PATH}`);
	}

	const probabilities = await speechProbabilities(await getVadSession(), audioData);
	const mergedRanges = mergeSpeechRanges(speechRanges(probabilities, audioData.length));
	return createPaddedChunks(audioData, mergedRanges);
}
