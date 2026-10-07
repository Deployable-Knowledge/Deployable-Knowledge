import type { DiarizationStage } from './diarization/pipeline';
import type { TranscriptSegment } from './transcription-model';

export type TranscriptionStage = 'speech' | 'transcription' | 'alignment' | DiarizationStage;

export type TranscriptionProgress = (stage: TranscriptionStage, fraction: number) => void;

export interface TranscribedRecording {
	text: string;
	segments: TranscriptSegment[];
	speakerError?: string;
}

export interface TranscribeRequest {
	type: 'transcribe';
	id: number;
	samples: Float32Array;
}

export type TranscribeReply =
	| { type: 'progress'; id: number; stage: TranscriptionStage; fraction: number }
	| ({ type: 'result'; id: number } & TranscribedRecording)
	| { type: 'error'; id: number; message: string };
