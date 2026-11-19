/*This transcription service runs on the Hugging Face Transformers library using the
Xenova Whisper Tiny English model. While it handles English audio transcription well, it may not perform 
as accurately on complex/chaotic audio scenarios. Looking into using larger models*/

import {
	pipeline,
	type AutomaticSpeechRecognitionPipeline,
	type ProgressCallback
} from '@huggingface/transformers';
import {
	combineFileProgress,
	transformersProgress,
	type DownloadProgressHandler
} from '#lib/server/utils/download-progress';
import { cachedModel } from '#lib/server/utils/transformers-env';
import { installSpeakerModel, isSpeakerModelInstalled } from './speaker-diarization';

export const TRANSCRIPTION_MODEL = 'Xenova/whisper-tiny.en';

const TRANSCRIPTION_TASK = 'automatic-speech-recognition';

const WHISPER = cachedModel(TRANSCRIPTION_MODEL, [
	'config.json',
	'generation_config.json',
	'preprocessor_config.json',
	'tokenizer.json',
	'tokenizer_config.json',
	'onnx/encoder_model.onnx',
	'onnx/decoder_model_merged.onnx'
]);

let transcriptionPipeline: Promise<AutomaticSpeechRecognitionPipeline> | undefined;

export function isTranscriptionModelInstalled(): boolean {
	return WHISPER.isInstalled() && isSpeakerModelInstalled();
}

function loadWhisper(
	progress_callback?: ProgressCallback
): Promise<AutomaticSpeechRecognitionPipeline> {
	const { nameOrPath, options } = WHISPER.source();
	return pipeline(TRANSCRIPTION_TASK, nameOrPath, { ...options, progress_callback });
}

async function installWhisper(progress_callback: ProgressCallback): Promise<void> {
	const transcriber = await loadWhisper(progress_callback);
	await transcriber.dispose();
}

export async function installTranscriptionModel(
	onProgress: DownloadProgressHandler
): Promise<void> {
	const progress_callback = transformersProgress(combineFileProgress(onProgress));
	await Promise.all([installWhisper(progress_callback), installSpeakerModel(progress_callback)]);
}

export type TranscriptSegment = {
	startMs: number;
	endMs: number;
	text: string;
	speaker?: number;
};

export type TranscriptionResult = {
	text: string;
	segments: TranscriptSegment[];
};

export async function transcribeAudio(audioData: Float32Array): Promise<TranscriptionResult> {
	transcriptionPipeline ??= loadWhisper().catch((error) => {
		transcriptionPipeline = undefined;
		throw error;
	});

	const transcriber = await transcriptionPipeline;

	// Timestamps let the pipeline stitch the 30 second windows of long audio back together
	const result = await transcriber(audioData, {
		chunk_length_s: 30,
		return_timestamps: true,
		stride_length_s: 5
	});

	const segments = (result.chunks ?? []).flatMap<TranscriptSegment>((segment) => {
		const text = segment.text?.trim() ?? '';
		const [start, end] = segment.timestamp ?? [];
		if (!text || typeof start !== 'number') return [];

		const endSeconds = typeof end === 'number' ? Math.max(end, start) : start;

		return [
			{
				startMs: Math.max(0, Math.round(start * 1000)),
				endMs: Math.max(0, Math.round(endSeconds * 1000)),
				text
			}
		];
	});

	return { text: result.text.trim(), segments };
}
