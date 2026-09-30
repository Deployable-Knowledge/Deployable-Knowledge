/*
 * Messages exchanged between the SvelteKit server and the diarization worker thread
 * (`worker.ts`, bundled to dist-workers/diarization-worker.mjs).
 */

import type { SpeakerTurn } from '../speaker-turn';
import type { DiarizationStage } from './pipeline';

/** Server → worker: diarize one complete mono 16 kHz recording. */
export interface DiarizeRequest {
	type: 'diarize';
	id: number;
	samples: Float32Array;
}

/** Worker → server messages, each tied to the request `id` it answers. */
export type DiarizeReply =
	| { type: 'progress'; id: number; stage: DiarizationStage; fraction: number }
	| { type: 'result'; id: number; turns: SpeakerTurn[] }
	| { type: 'error'; id: number; message: string };
