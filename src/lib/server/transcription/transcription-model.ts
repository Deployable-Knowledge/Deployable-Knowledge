import {
	ModelRegistry,
	pipeline,
	type AutomaticSpeechRecognitionPipeline
} from '@huggingface/transformers';
import {
	combineFileProgress,
	transformersProgress,
	type DownloadProgressHandler
} from '#lib/server/utils/download-progress';
import { TRANSCRIPTION_THREADS } from '#lib/server/utils/inference-threads';
import { TRANSFORMERS_CACHE_DIR } from '#lib/server/utils/transformers-env';
import { AUDIO_SAMPLE_RATE, sampleIndexToMs, type AudioChunk } from './audio-types';

export const TRANSCRIPTION_MODEL = 'Xenova/whisper-small.en';

const TRANSCRIPTION_TASK = 'automatic-speech-recognition';

const TRANSCRIPTION_OPTIONS = {
	cache_dir: TRANSFORMERS_CACHE_DIR,
	device: 'cpu',
	dtype: 'q8'
} as const;

let transcriptionPipeline: Promise<AutomaticSpeechRecognitionPipeline> | undefined;

export function isTranscriptionModelInstalled(): Promise<boolean> {
	return ModelRegistry.is_pipeline_cached(
		TRANSCRIPTION_TASK,
		TRANSCRIPTION_MODEL,
		TRANSCRIPTION_OPTIONS
	);
}

export async function installTranscriptionModel(
	onProgress: DownloadProgressHandler
): Promise<void> {
	const transcriber = await pipeline(TRANSCRIPTION_TASK, TRANSCRIPTION_MODEL, {
		...TRANSCRIPTION_OPTIONS,
		progress_callback: transformersProgress(combineFileProgress(onProgress))
	});
	await transcriber.dispose();
}

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
	transcriptionPipeline ??= pipeline(TRANSCRIPTION_TASK, TRANSCRIPTION_MODEL, {
		...TRANSCRIPTION_OPTIONS,
		session_options: {
			intraOpNumThreads: TRANSCRIPTION_THREADS,
			interOpNumThreads: 1
		}
	}).catch((error) => {
		transcriptionPipeline = undefined;
		throw error;
	});

	return transcriptionPipeline;
}

function decodingOptions(audio: AudioChunk) {
	const durationSeconds = audio.samples.length / AUDIO_SAMPLE_RATE;
	const maxNewTokens = Math.min(384, Math.max(32, Math.ceil(durationSeconds * 8)));

	return {
		do_sample: false,
		max_new_tokens: maxNewTokens,
		no_repeat_ngram_size: 4,
		repetition_penalty: 1.05,
		return_timestamps: true
	};
}

function splitSegmentIntoWords(text: string, startMs: number, endMs: number): TranscriptSegment[] {
	const words = text.split(/\s+/).filter(Boolean);
	const totalCharacters = words.reduce((sum, word) => sum + word.length, 0);
	const spanMs = endMs - startMs;

	let characters = 0;
	return words.map((word) => {
		const wordStartMs = startMs + Math.round((spanMs * characters) / totalCharacters);
		characters += word.length;
		const wordEndMs = startMs + Math.round((spanMs * characters) / totalCharacters);
		return { startMs: wordStartMs, endMs: wordEndMs, text: word };
	});
}

async function transcribeChunk(
	transcriber: AutomaticSpeechRecognitionPipeline,
	audio: AudioChunk
): Promise<TranscribedAudioChunk> {
	const result = await transcriber(audio.samples, decodingOptions(audio));

	const sourceStartMs = sampleIndexToMs(audio.startSample);
	const sourceEndMs = sampleIndexToMs(audio.endSample);

	const segments = (result.chunks ?? []).flatMap<TranscriptSegment>((segment) => {
		const text = segment.text?.trim() ?? '';
		const [start, end] = segment.timestamp ?? [];

		if (!text || typeof start !== 'number') return [];

		const startMs = Math.min(
			sourceEndMs,
			Math.max(sourceStartMs, sourceStartMs + Math.round(start * 1000))
		);

		let endMs = sourceEndMs;
		if (typeof end === 'number') {
			endMs = Math.min(sourceEndMs, Math.max(startMs, sourceStartMs + Math.round(end * 1000)));
		}

		return splitSegmentIntoWords(text, startMs, endMs);
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

export function combineChunkResults(chunks: TranscribedAudioChunk[]): TranscriptionResult {
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

export async function transcribeAudioChunks(
	audioChunks: AudioChunk[],
	onChunk?: (completed: number, total: number) => void
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

	for (const [index, audioChunk] of audioChunks.entries()) {
		if (audioChunk.samples.length > 0) {
			results.push(await transcribeChunk(transcriber, audioChunk));
		}
		onChunk?.(index + 1, audioChunks.length);
	}

	return combineChunkResults(results);
}
