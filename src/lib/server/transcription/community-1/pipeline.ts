/*
 * pyannote Community-1 speaker diarization (`SpeakerDiarization.apply`, pyannote.audio 4.0.7) on
 * ONNX Runtime, for mono 16 kHz float32 audio with an automatically estimated speaker count.
 */

import { InferenceSession } from 'onnxruntime-node';
import type { SpeakerTurn } from '../speaker-turn';
import { loadCommunity1Assets } from './assets';
import { clusterEmbeddings, unassignInactiveSpeakers, type ClusteringResult } from './clustering';
import { createEmbeddingModel, extractEmbeddings, type EmbeddingModel } from './embeddings';
import { loadPlda, type PldaModel } from './plda';
import {
	binarizeToTurns,
	clusteredSegmentation,
	speakerCount,
	toDiarization
} from './reconstruction';
import { decodePowerset, runSegmentation } from './segmentation';

/** Community-1 `config.yaml` clustering parameters. */
const CLUSTERING_PARAMETERS = { threshold: 0.6, fa: 0.07, fb: 0.8 };

export interface DiarizationIntermediates {
	chunkCount: number;
	segmentationScores: Float32Array;
	activity: Uint8Array;
	count: Uint8Array;
	embeddings: Float64Array;
	clustering: ClusteringResult;
	timings: Record<string, number>;
}

export interface DiarizationOutput {
	/** Overlap-preserving diarization. */
	turns: SpeakerTurn[];
	/** At most one speaker at a time. */
	exclusiveTurns: SpeakerTurn[];
	intermediates?: DiarizationIntermediates;
}

export interface Community1Diarizer {
	embeddingModel: EmbeddingModel;
	plda: PldaModel;
	diarize(samples: Float32Array, options?: { capture?: boolean }): Promise<DiarizationOutput>;
}

export async function createCommunity1Diarizer(): Promise<Community1Diarizer> {
	const assets = await loadCommunity1Assets();
	const plda = loadPlda(assets.xvecTransform, assets.plda);
	const segmentationSession = await InferenceSession.create(assets.segmentation);
	const embeddingModel = await createEmbeddingModel(assets.embedding);

	const diarize = async (
		samples: Float32Array,
		options: { capture?: boolean } = {}
	): Promise<DiarizationOutput> => {
		const timings: Record<string, number> = {};
		let clock = performance.now();
		const lap = (stage: string) => {
			const now = performance.now();
			timings[stage] = now - clock;
			clock = now;
		};

		const { chunkCount, scores } = await runSegmentation(segmentationSession, samples);
		const activity = decodePowerset(scores, chunkCount);
		const count = speakerCount(activity, chunkCount);
		lap('segmentation');

		if (count.every((value) => value === 0)) return { turns: [], exclusiveTurns: [] };

		const embeddings = await extractEmbeddings(embeddingModel, samples, activity, chunkCount);
		lap('embeddings');

		const clustering = clusterEmbeddings(
			embeddings,
			activity,
			chunkCount,
			plda,
			CLUSTERING_PARAMETERS
		);
		const hardClusters = Int32Array.from(clustering.hardClusters);
		unassignInactiveSpeakers(hardClusters, activity, chunkCount);
		lap('clustering');

		const clustered = clusteredSegmentation(activity, hardClusters, chunkCount);
		const turns = binarizeToTurns(toDiarization(clustered, chunkCount, count));
		const exclusiveCount = count.map((value) => Math.min(value, 1));
		const exclusiveTurns = binarizeToTurns(toDiarization(clustered, chunkCount, exclusiveCount));
		lap('reconstruction');

		if (!options.capture) return { turns, exclusiveTurns };

		return {
			turns,
			exclusiveTurns,
			intermediates: {
				chunkCount,
				segmentationScores: scores,
				activity,
				count,
				embeddings,
				clustering: { ...clustering, hardClusters },
				timings
			}
		};
	};

	return { embeddingModel, plda, diarize };
}
