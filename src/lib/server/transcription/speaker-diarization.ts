import type { Community1Diarizer } from './community-1/pipeline';
import type { SpeakerTurn } from './speaker-turn';

let diarizer: Promise<Community1Diarizer> | undefined;

function loadDiarizer(): Promise<Community1Diarizer> {
	// ONNX Runtime and the model assets load on first use; a failed load is retried on the next call.
	diarizer ??= import('./community-1/pipeline')
		.then(({ createCommunity1Diarizer }) => createCommunity1Diarizer())
		.catch((error: unknown) => {
			diarizer = undefined;
			throw error;
		});

	return diarizer;
}

/**
 * pyannote Community-1 speaker diarization of a complete mono 16 kHz recording, with an
 * automatically estimated number of speakers. Turns may overlap.
 */
export async function diarizeAudio(samples: Float32Array): Promise<SpeakerTurn[]> {
	const { turns } = await (await loadDiarizer()).diarize(samples);
	return turns;
}
