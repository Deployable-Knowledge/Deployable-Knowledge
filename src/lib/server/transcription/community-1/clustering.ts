/*
 * Port of `VBxClustering.__call__` (pyannote.audio pipelines/clustering.py) with an automatically
 * estimated number of speakers. The KMeans fallback only runs when a speaker count is imposed, so
 * it is not ported.
 */

import { totalmem } from 'node:os';
import { agglomerativeClusters } from './ahc';
import { EMBEDDING_DIMENSION, type PldaModel } from './plda';
import { FRAMES_PER_CHUNK, LOCAL_SPEAKERS } from './segmentation';
import { clusterVbx } from './vbx';

export const UNASSIGNED = -2;

const MIN_ACTIVE_RATIO = 0.2;
const AHC_THRESHOLD = 0.6;
const VBX_FA = 0.07;
const VBX_FB = 0.8;
const MIN_SPEAKER_PRIOR = 1e-7;

// AHC's pairwise distance table grows with the square of the voice samples, lives outside the
// JavaScript heap, and is not bounded by worker heap limits.
const MAX_DISTANCE_TABLE_SHARE_OF_RAM = 0.25;

function assertDistanceTableFits(sampleCount: number): void {
	const bytes = ((sampleCount * (sampleCount - 1)) / 2) * Float64Array.BYTES_PER_ELEMENT;
	const limit = totalmem() * MAX_DISTANCE_TABLE_SHARE_OF_RAM;
	if (bytes <= limit) return;

	const gb = (value: number) => (value / 1024 ** 3).toFixed(1);
	throw new Error(
		`Too many voice samples (${sampleCount}) to identify speakers: clustering would need ` +
			`${gb(bytes)} GB, more than the ${gb(limit)} GB allowed on this machine.`
	);
}

function activityTotals(activity: Uint8Array, chunkCount: number) {
	const active = new Int32Array(chunkCount * LOCAL_SPEAKERS);
	const clean = new Int32Array(chunkCount * LOCAL_SPEAKERS);

	for (let chunk = 0; chunk < chunkCount; chunk++) {
		for (let frame = 0; frame < FRAMES_PER_CHUNK; frame++) {
			const base = (chunk * FRAMES_PER_CHUNK + frame) * LOCAL_SPEAKERS;
			let speaking = 0;
			for (let speaker = 0; speaker < LOCAL_SPEAKERS; speaker++)
				speaking += activity[base + speaker];

			for (let speaker = 0; speaker < LOCAL_SPEAKERS; speaker++) {
				if (!activity[base + speaker]) continue;
				active[chunk * LOCAL_SPEAKERS + speaker]++;
				if (speaking === 1) clean[chunk * LOCAL_SPEAKERS + speaker]++;
			}
		}
	}

	return { active, clean };
}

function assignChunk(
	scores: Float64Array,
	clusters: number,
	target: Int32Array,
	targetOffset: number
): void {
	const assignable = Math.min(LOCAL_SPEAKERS, clusters);
	const current = new Int32Array(LOCAL_SPEAKERS).fill(UNASSIGNED);
	const used = new Uint8Array(clusters);
	let bestScore = -Infinity;
	let best = Int32Array.from(current);

	const search = (speaker: number, assigned: number, score: number): void => {
		if (speaker === LOCAL_SPEAKERS) {
			if (assigned === assignable && score > bestScore) {
				bestScore = score;
				best = Int32Array.from(current);
			}
			return;
		}

		for (let cluster = 0; cluster < clusters; cluster++) {
			if (used[cluster]) continue;
			used[cluster] = 1;
			current[speaker] = cluster;
			search(speaker + 1, assigned + 1, score + scores[speaker * clusters + cluster]);
			used[cluster] = 0;
		}

		if (LOCAL_SPEAKERS - speaker - 1 >= assignable - assigned) {
			current[speaker] = UNASSIGNED;
			search(speaker + 1, assigned, score);
		}
	};

	search(0, 0, 0);
	target.set(best, targetOffset);
}

export function clusterEmbeddings(
	embeddings: Float64Array,
	activity: Uint8Array,
	chunkCount: number,
	plda: PldaModel
): Int32Array {
	const pairs = chunkCount * LOCAL_SPEAKERS;
	const { active, clean } = activityTotals(activity, chunkCount);

	const train: number[] = [];
	for (let pair = 0; pair < pairs; pair++) {
		if (clean[pair] < MIN_ACTIVE_RATIO * FRAMES_PER_CHUNK) continue;
		const embedding = embeddings.subarray(
			pair * EMBEDDING_DIMENSION,
			(pair + 1) * EMBEDDING_DIMENSION
		);
		if (embedding.every(Number.isFinite)) train.push(pair);
	}

	const hardClusters = new Int32Array(pairs);
	if (train.length < 2) return hardClusters.map((_, pair) => (active[pair] ? 0 : UNASSIGNED));

	const trainEmbeddings = new Float64Array(train.length * EMBEDDING_DIMENSION);
	const normalized = new Float64Array(train.length * EMBEDDING_DIMENSION);
	train.forEach((pair, row) => {
		const source = embeddings.subarray(
			pair * EMBEDDING_DIMENSION,
			(pair + 1) * EMBEDDING_DIMENSION
		);
		trainEmbeddings.set(source, row * EMBEDDING_DIMENSION);
		const norm = Math.hypot(...source);
		for (let d = 0; d < EMBEDDING_DIMENSION; d++)
			normalized[row * EMBEDDING_DIMENSION + d] = source[d] / norm;
	});

	assertDistanceTableFits(train.length);
	const ahcLabels = agglomerativeClusters(
		normalized,
		train.length,
		EMBEDDING_DIMENSION,
		AHC_THRESHOLD
	);
	const pldaFeatures = plda.transform(trainEmbeddings, train.length);
	const { gamma, pi, speakers } = clusterVbx(ahcLabels, pldaFeatures, plda.phi, VBX_FA, VBX_FB);

	const kept = Array.from(pi.keys()).filter((speaker) => pi[speaker] > MIN_SPEAKER_PRIOR);
	const clusters = kept.length;
	const centroids = new Float64Array(clusters * EMBEDDING_DIMENSION);
	kept.forEach((speaker, cluster) => {
		let weightSum = 0;
		for (let row = 0; row < train.length; row++) {
			const weight = gamma[row * speakers + speaker];
			weightSum += weight;
			for (let d = 0; d < EMBEDDING_DIMENSION; d++) {
				centroids[cluster * EMBEDDING_DIMENSION + d] +=
					weight * trainEmbeddings[row * EMBEDDING_DIMENSION + d];
			}
		}
		for (let d = 0; d < EMBEDDING_DIMENSION; d++)
			centroids[cluster * EMBEDDING_DIMENSION + d] /= weightSum;
	});

	const centroidNorms = kept.map((_, cluster) =>
		Math.hypot(
			...centroids.subarray(cluster * EMBEDDING_DIMENSION, (cluster + 1) * EMBEDDING_DIMENSION)
		)
	);

	const soft = new Float64Array(pairs * clusters);
	let minimum = Infinity;
	for (let pair = 0; pair < pairs; pair++) {
		const embedding = embeddings.subarray(
			pair * EMBEDDING_DIMENSION,
			(pair + 1) * EMBEDDING_DIMENSION
		);
		const norm = Math.hypot(...embedding);
		for (let cluster = 0; cluster < clusters; cluster++) {
			let dot = 0;
			for (let d = 0; d < EMBEDDING_DIMENSION; d++) {
				dot += embedding[d] * centroids[cluster * EMBEDDING_DIMENSION + d];
			}
			const score = 1 + dot / (norm * centroidNorms[cluster]);
			soft[pair * clusters + cluster] = score;
			if (score < minimum) minimum = score;
		}
	}

	// Silent local speakers must not win an assignment over speaking ones.
	for (let pair = 0; pair < pairs; pair++) {
		if (active[pair] > 0) continue;
		soft.fill(minimum - 1, pair * clusters, (pair + 1) * clusters);
	}

	// A zero-norm embedding has no cosine score; `constrained_argmax` treats it as the minimum.
	for (let index = 0; index < soft.length; index++) {
		if (Number.isNaN(soft[index])) soft[index] = minimum - 1;
	}

	for (let chunk = 0; chunk < chunkCount; chunk++) {
		assignChunk(
			soft.subarray(chunk * LOCAL_SPEAKERS * clusters, (chunk + 1) * LOCAL_SPEAKERS * clusters),
			clusters,
			hardClusters,
			chunk * LOCAL_SPEAKERS
		);
	}

	for (let pair = 0; pair < pairs; pair++) {
		if (active[pair] === 0) hardClusters[pair] = UNASSIGNED;
	}

	return hardClusters;
}
