import { InferenceSession } from 'onnxruntime-node';
import type { SpeakerTurn } from '../speaker-turn';
import { loadDiarizationModels } from './assets';
import { clusterEmbeddings } from './clustering';
import { extractEmbeddings } from './embeddings';
import {
	binarizeToTurns,
	clusteredSegmentation,
	speakerCount,
	toDiarization
} from './reconstruction';
import { decodePowerset, runSegmentation } from './segmentation';

export type DiarizationStage = 'segmentation' | 'embeddings' | 'clustering' | 'reconstruction';

export type DiarizationProgress = (stage: DiarizationStage, fraction: number) => void;

export interface SpeakerDiarizer {
	diarize(samples: Float32Array, onProgress?: DiarizationProgress): Promise<SpeakerTurn[]>;
}

export async function createSpeakerDiarizer(): Promise<SpeakerDiarizer> {
	const models = await loadDiarizationModels();
	const segmentationSession = await InferenceSession.create(models.segmentation);
	const embeddingSession = await InferenceSession.create(models.embedding);

	const diarize = async (
		samples: Float32Array,
		onProgress?: DiarizationProgress
	): Promise<SpeakerTurn[]> => {
		const { chunkCount, scores } = await runSegmentation(segmentationSession, samples);
		const activity = decodePowerset(scores, chunkCount);
		const count = speakerCount(activity, chunkCount);
		onProgress?.('segmentation', 1);

		if (count.every((value) => value === 0)) return [];

		const embeddings = await extractEmbeddings(
			embeddingSession,
			samples,
			activity,
			chunkCount,
			(fraction) => onProgress?.('embeddings', fraction)
		);

		const hardClusters = clusterEmbeddings(embeddings, activity, chunkCount);
		onProgress?.('clustering', 1);

		const clustered = clusteredSegmentation(activity, hardClusters, chunkCount);
		const turns = binarizeToTurns(toDiarization(clustered, chunkCount, count));
		onProgress?.('reconstruction', 1);

		return turns;
	};

	return { diarize };
}
