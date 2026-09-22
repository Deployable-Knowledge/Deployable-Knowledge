import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OfflineSpeakerDiarization, SpeakerTurn } from 'sherpa-onnx-node';

const AUTO_CLUSTER_THRESHOLD = 0.75;

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

		diarizer = new sherpa.OfflineSpeakerDiarization({
			segmentation: {
				pyannote: { model: segmentationModel, windowShiftRatio: 0.1 }
			},
			embedding: { model: embeddingModel },
			clustering: {
				numClusters: 0,
				threshold: AUTO_CLUSTER_THRESHOLD
			},
			minDurationOn: 0.2,
			minDurationOff: 0.5
		});

		if (diarizer.sampleRate !== 16_000) {
			diarizer = undefined;
			throw new Error('Diarization model requires a different sample rate.');
		}
	}

	return diarizer.process(samples);
}
