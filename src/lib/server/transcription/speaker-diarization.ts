import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OfflineSpeakerDiarization, SpeakerTurn } from 'sherpa-onnx-node';

const modelDir = resolve(process.cwd(), 'models', 'diarization');
const segmentationModel = resolve(modelDir, 'model.onnx');
const embeddingModel = resolve(
	modelDir,
	'3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx'
);

let diarizer: OfflineSpeakerDiarization | undefined;

export async function diarizeAudio(samples: Float32Array): Promise<SpeakerTurn[]> {
	if (!existsSync(segmentationModel) || !existsSync(embeddingModel)) {
		throw new Error(`Diarization models are missing from ${modelDir}`);
	}

	if (!diarizer) {
		const { default: sherpa } = await import('sherpa-onnx-node');

		// Diarization Parameters (threshold, numClusters, minDurationOn/Off, windowShiftRatio)
		/*
		* segmentation.pyannote.model: Finds when each voice is active.
		* windowShiftRatio: How far the segmentation window moves between passes,
		*   as a fraction of its length. Smaller values mean more overlap and more work.
		*
		* embedding.model: Converts speech into vectors used to compare voices.
		*
		* clustering.numClusters: Expected number of speakers. Zero estimates the
		*   number automatically; a positive value fixes the count and ignores threshold.
		* clustering.threshold: Speaker-embedding distance threshold used only when
		*   numClusters is zero. Higher values merge more clusters and usually produce
		*   fewer speakers; too high can merge different people.
		*
		* minDurationOn: Discards speaker segments shorter than this many seconds.
		*   Raising it can remove false brief turns but can also lose real interjections.
		* minDurationOff: Short gaps below this duration may be joined. Raising it
		*   can reduce fragmented turns but may blur rapid exchanges.
		*/
		diarizer = new sherpa.OfflineSpeakerDiarization({
			segmentation: {
				pyannote: { model: segmentationModel, windowShiftRatio: 0.1 }
			},
			embedding: { model: embeddingModel },
			clustering: {
				numClusters: 0,
				threshold: 0.91
			},
			minDurationOn: 0.3,
			minDurationOff: 0.5
		});

		if (diarizer.sampleRate !== 16_000) {
			diarizer = undefined;
			throw new Error('Diarization model requires a different sample rate.');
		}
	}

	return diarizer.process(samples);
}
