/*
 * Whisper produces the transcript text. Wav2Vec2 forced alignment later
 * refines the word timestamps without changing that text.
 */

import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { TRANSFORMERS_CACHE_DIR } from '../utils/transformers-env';
import { sampleIndexToMs, type AudioChunk } from './audio-types';

export const TRANSCRIPTION_MODEL = 'Xenova/whisper-tiny.en';

let transcriptionPipeline: Promise<AutomaticSpeechRecognitionPipeline> | undefined;

export interface TranscriptSegment {
	startMs: number;
	endMs: number;
	text: string;
	speakerId?: number;
}

export interface TranscribedAudioChunk {
	audio: AudioChunk;
	text: string;
	segments: TranscriptSegment[];
}

export interface TranscriptionResult {
	text: string;
	segments: TranscriptSegment[];
	chunks: TranscribedAudioChunk[];
}

async function getTranscriber(): Promise<AutomaticSpeechRecognitionPipeline> {
	transcriptionPipeline ??= pipeline('automatic-speech-recognition', TRANSCRIPTION_MODEL, {
		cache_dir: TRANSFORMERS_CACHE_DIR
	}).catch((error) => {
		transcriptionPipeline = undefined;
		throw error;
	});

	return transcriptionPipeline;
}

async function transcribeChunk(
	transcriber: AutomaticSpeechRecognitionPipeline,
	audio: AudioChunk,
	longForm: boolean
): Promise<TranscribedAudioChunk> {
	let result;

	if (longForm) {
		result = await transcriber(audio.samples, {
			chunk_length_s: 30,
			return_timestamps: 'word',
			stride_length_s: 5
		});
	} else {
		result = await transcriber(audio.samples, {
			return_timestamps: 'word'
		});
	}

	const sourceStartMs = sampleIndexToMs(audio.startSample);
	const sourceEndMs = sampleIndexToMs(audio.endSample);

	const segments = (result.chunks ?? []).flatMap<TranscriptSegment>((segment) => {
		const text = segment.text?.trim() ?? '';
		const [start, end] = segment.timestamp ?? [];

		if (!text || typeof start !== 'number') return [];

		const endSeconds = typeof end === 'number' ? Math.max(end, start) : start;

		const startMs = Math.min(
			sourceEndMs,
			Math.max(sourceStartMs, sourceStartMs + Math.round(start * 1000))
		);

		const endMs = Math.min(
			sourceEndMs,
			Math.max(startMs, sourceStartMs + Math.round(endSeconds * 1000))
		);

		return [
			{
				startMs,
				endMs,
				text
			}
		];
	});

	let text = result.text.trim();
	if (segments.length > 0) {
		text = segments.map((segment) => segment.text).join(' ');
	}

	return {
		audio,
		text,
		segments
	};
}

function combineChunkResults(chunks: TranscribedAudioChunk[]): TranscriptionResult {
	return {
		text: chunks
			.map((chunk) => chunk.text)
			.filter(Boolean)
			.join(' ')
			.trim(),
		segments: chunks.flatMap((chunk) => chunk.segments),
		chunks
	};
}

/**
 * Preserves the original whole-recording path for the later baseline
 * comparison.
 */
export async function transcribeAudio(audioData: Float32Array): Promise<TranscriptionResult> {
	const transcriber = await getTranscriber();

	const audio: AudioChunk = {
		startSample: 0,
		endSample: audioData.length,
		samples: audioData
	};

	const result = await transcribeChunk(transcriber, audio, true);

	return combineChunkResults([result]);
}

/**
 * Transcribes VAD-generated chunks. These chunks are already shorter than
 * Whisper's 30-second input limit, so internal long-form chunking is disabled.
 */
export async function transcribeAudioChunks(
	audioChunks: AudioChunk[]
): Promise<TranscriptionResult> {
	if (audioChunks.length === 0) {
		return {
			text: '',
			segments: [],
			chunks: []
		};
	}

	const transcriber = await getTranscriber();
	const results: TranscribedAudioChunk[] = [];

	for (const audioChunk of audioChunks) {
		if (audioChunk.samples.length === 0) continue;

		results.push(await transcribeChunk(transcriber, audioChunk, false));
	}

	return combineChunkResults(results);
}
