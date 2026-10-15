import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Vad } from 'sherpa-onnx-node';
import { AUDIO_SAMPLE_RATE, sliceAudioChunk, type AudioChunk } from './audio-types';

const VAD_MODEL_PATH = resolve(process.cwd(), 'models', 'vad', 'silero_vad.onnx');

const VAD_WINDOW_SAMPLES = 512;
const VAD_BUFFER_SECONDS = 60;

const MAX_CHUNK_SAMPLES = 28 * AUDIO_SAMPLE_RATE;
const MAX_MERGE_GAP_SAMPLES = Math.round(0.75 * AUDIO_SAMPLE_RATE);
const CHUNK_PADDING_SAMPLES = Math.round(0.25 * AUDIO_SAMPLE_RATE);

interface SpeechRange {
	startSample: number;
	endSample: number;
}

function drainSpeechRanges(vad: Vad, ranges: SpeechRange[]): void {
	while (!vad.isEmpty()) {
		const segment = vad.front();

		ranges.push({
			startSample: segment.start,
			endSample: segment.start + segment.samples.length
		});

		vad.pop();
	}
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

	const { default: sherpa } = await import('sherpa-onnx-node');

	const vad = new sherpa.Vad(
		{
			sileroVad: {
				model: VAD_MODEL_PATH,
				threshold: 0.5,
				minSpeechDuration: 0.25,
				minSilenceDuration: 0.5,
				maxSpeechDuration: 25,
				windowSize: VAD_WINDOW_SAMPLES
			},
			sampleRate: AUDIO_SAMPLE_RATE,
			numThreads: 1,
			provider: 'cpu',
			debug: false
		},
		VAD_BUFFER_SECONDS
	);

	const ranges: SpeechRange[] = [];

	for (let offset = 0; offset < audioData.length; offset += VAD_WINDOW_SAMPLES) {
		vad.acceptWaveform(audioData.subarray(offset, offset + VAD_WINDOW_SAMPLES));

		drainSpeechRanges(vad, ranges);
	}

	vad.flush();
	drainSpeechRanges(vad, ranges);

	const mergedRanges = mergeSpeechRanges(ranges);
	return createPaddedChunks(audioData, mergedRanges);
}
