import { parentPort } from 'node:worker_threads';
import { createCommunity1Diarizer, type Community1Diarizer } from './community-1/pipeline';
import { alignTranscription } from './forced-alignment';
import { filterHallucinatedTranscription } from './hallucination-gate';
import { assignSpeakers } from './speaker-assignment';
import { transcribeAudioChunks } from './transcription-model';
import type {
	TranscribeReply,
	TranscribeRequest,
	TranscriptionStage
} from './transcription-worker-protocol';
import { detectSpeechChunks } from './voice-activity-detection';

if (!parentPort) throw new Error('The transcription worker must run in a worker thread.');
const port = parentPort;

let diarizer: Promise<Community1Diarizer> | undefined;

function loadDiarizer(): Promise<Community1Diarizer> {
	diarizer ??= createCommunity1Diarizer().catch((error: unknown) => {
		diarizer = undefined;
		throw error;
	});
	return diarizer;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function reply(message: TranscribeReply): void {
	port.postMessage(message);
}

async function transcribe({ id, samples }: TranscribeRequest): Promise<void> {
	const progress = (stage: TranscriptionStage, fraction: number) =>
		reply({ type: 'progress', id, stage, fraction });

	try {
		progress('speech', 0);
		const audioChunks = await detectSpeechChunks(samples);
		if (audioChunks.length === 0) {
			reply({ type: 'result', id, text: '', segments: [] });
			return;
		}

		progress('transcription', 0);
		let transcription = filterHallucinatedTranscription(
			await transcribeAudioChunks(audioChunks, (completed, total) =>
				progress('transcription', completed / total)
			)
		);

		if (transcription.segments.length > 0) {
			progress('alignment', 0);
			transcription = await alignTranscription(transcription, (completed, total) =>
				progress('alignment', completed / total)
			);
		}

		let segments = transcription.segments;
		let speakerError: string | undefined;

		if (segments.length > 0) {
			progress('segmentation', 0);
			try {
				const turns = await (await loadDiarizer()).diarize(samples, progress);
				segments = assignSpeakers(segments, turns);
			} catch (error) {
				speakerError = errorMessage(error);
			}
		}

		reply({ type: 'result', id, text: transcription.text, segments, speakerError });
	} catch (error) {
		reply({ type: 'error', id, message: errorMessage(error) });
	}
}

port.on('message', (request: TranscribeRequest) => {
	if (request.type === 'transcribe') void transcribe(request);
});
