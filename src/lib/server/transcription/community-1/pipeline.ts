/*
 * pyannote Community-1 speaker diarization (`SpeakerDiarization.apply`, pyannote.audio 4.0.7) on
 * ONNX Runtime, for mono 16 kHz float32 audio with an automatically estimated speaker count.
 */

import { InferenceSession } from 'onnxruntime-node';
import type { SpeakerTurn } from '../speaker-turn';
import { loadCommunity1Assets } from './assets';
import { clusterEmbeddings } from './clustering';
import { createEmbeddingModel, extractEmbeddings } from './embeddings';
import { loadPlda } from './plda';
import {
	binarizeToTurns,
	clusteredSegmentation,
	speakerCount,
	toDiarization
} from './reconstruction';
import { decodePowerset, runSegmentation } from './segmentation';

export type DiarizationStage = 'segmentation' | 'embeddings' | 'clustering' | 'reconstruction';

export type DiarizationProgress = (stage: DiarizationStage, fraction: number) => void;

export interface Community1Diarizer {
	diarize(samples: Float32Array, onProgress?: DiarizationProgress): Promise<SpeakerTurn[]>;
}

export async function createCommunity1Diarizer(): Promise<Community1Diarizer> {
	const assets = await loadCommunity1Assets();
	const plda = loadPlda(assets.xvecTransform, assets.plda);
	const segmentationSession = await InferenceSession.create(assets.segmentation);
	const embeddingModel = await createEmbeddingModel(assets.embedding);

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
			embeddingModel,
			samples,
			activity,
			chunkCount,
			(fraction) => onProgress?.('embeddings', fraction)
		);

		const hardClusters = clusterEmbeddings(embeddings, activity, chunkCount, plda);
		onProgress?.('clustering', 1);

		const clustered = clusteredSegmentation(activity, hardClusters, chunkCount);
		const turns = binarizeToTurns(toDiarization(clustered, chunkCount, count));
		onProgress?.('reconstruction', 1);

		return turns;
	};

	return { diarize };
}
