import { totalmem } from 'node:os';
import { agglomerativeClusters } from './ahc';
import { EMBEDDING_DIMENSION } from './embeddings';
import { roundHalfEven } from './rounding';
import { FRAMES_PER_CHUNK, LOCAL_SPEAKERS } from './segmentation';

export const UNASSIGNED = -2;

const MIN_ACTIVE_RATIO = 0.2;
const THRESHOLD = 0.75;
const MIN_CLUSTER_SIZE = 12;
const ORPHAN_DISTANCE = 0.8;
const MIN_SPEAKER_SAMPLES = 6;
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

function embeddingAt(embeddings: Float64Array, index: number): Float64Array {
	return embeddings.subarray(index * EMBEDDING_DIMENSION, (index + 1) * EMBEDDING_DIMENSION);
}

function cosineSimilarity(left: Float64Array, right: Float64Array): number {
	let dot = 0;
	let leftNorm = 0;
	let rightNorm = 0;
	for (let d = 0; d < EMBEDDING_DIMENSION; d++) {
		dot += left[d] * right[d];
		leftNorm += left[d] * left[d];
		rightNorm += right[d] * right[d];
	}
	return dot / Math.sqrt(leftNorm * rightNorm);
}

function cosineDistance(left: Float64Array, right: Float64Array): number {
	return 1 - cosineSimilarity(left, right);
}

function groupOrphans(
	orphans: number[],
	centroids: Map<number, Float64Array>
): Map<number, number> {
	const parent = new Map(orphans.map((label) => [label, label]));
	const root = (label: number): number => {
		while (parent.get(label) !== label) label = parent.get(label)!;
		return label;
	};

	orphans.forEach((left, index) => {
		for (const right of orphans.slice(index + 1)) {
			if (cosineDistance(centroids.get(left)!, centroids.get(right)!) > ORPHAN_DISTANCE) continue;
			const leftRoot = root(left);
			const rightRoot = root(right);
			parent.set(Math.max(leftRoot, rightRoot), Math.min(leftRoot, rightRoot));
		}
	});

	return new Map(orphans.map((label) => [label, root(label)]));
}

function mostSimilar(embedding: Float64Array, centroids: Float64Array[]): number {
	let best = 0;
	let bestScore = cosineSimilarity(embedding, centroids[0]);
	for (let cluster = 1; cluster < centroids.length; cluster++) {
		const score = cosineSimilarity(embedding, centroids[cluster]);
		if (score > bestScore) {
			best = cluster;
			bestScore = score;
		}
	}
	return best;
}

function clusterCentroid(
	embeddings: Float64Array,
	labels: Int32Array,
	label: number
): Float64Array {
	const centroid = new Float64Array(EMBEDDING_DIMENSION);
	let members = 0;
	labels.forEach((rowLabel, row) => {
		if (rowLabel !== label) return;
		members++;
		const embedding = embeddingAt(embeddings, row);
		for (let d = 0; d < EMBEDDING_DIMENSION; d++) centroid[d] += embedding[d];
	});
	return centroid.map((value) => value / members);
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

function clusterTraining(trainEmbeddings: Float64Array, count: number): Int32Array {
	const normalized = new Float64Array(trainEmbeddings.length);
	for (let row = 0; row < count; row++) {
		const embedding = embeddingAt(trainEmbeddings, row);
		const norm = Math.hypot(...embedding);
		for (let d = 0; d < EMBEDDING_DIMENSION; d++)
			normalized[row * EMBEDDING_DIMENSION + d] = embedding[d] / norm;
	}

	assertDistanceTableFits(count);
	const labels = agglomerativeClusters(normalized, count, EMBEDDING_DIMENSION, THRESHOLD);

	const minClusterSize = Math.min(MIN_CLUSTER_SIZE, Math.max(1, roundHalfEven(0.1 * count)));
	const sizes = new Map<number, number>();
	for (const label of labels) sizes.set(label, (sizes.get(label) ?? 0) + 1);

	const sortedLabels = [...sizes.keys()].sort((left, right) => left - right);
	const large = sortedLabels.filter((label) => sizes.get(label)! >= minClusterSize);
	if (large.length === 0) return new Int32Array(count);

	const target = new Map(large.map((label, index) => [label, index]));
	const largeCentroids = large.map((label) => clusterCentroid(normalized, labels, label));
	const small = sortedLabels.filter((label) => !target.has(label));
	const centroids = new Map(
		small.map((label) => [label, clusterCentroid(normalized, labels, label)])
	);
	const nearestLarge = new Map(
		small.map((label) => [label, mostSimilar(centroids.get(label)!, largeCentroids)])
	);
	const orphans = small.filter(
		(label) =>
			cosineDistance(centroids.get(label)!, largeCentroids[nearestLarge.get(label)!]) >
			ORPHAN_DISTANCE
	);
	const groups = groupOrphans(orphans, centroids);
	const groupSizes = new Map<number, number>();
	for (const label of orphans) {
		const group = groups.get(label)!;
		groupSizes.set(group, (groupSizes.get(group) ?? 0) + sizes.get(label)!);
	}

	const newSpeakers = new Map<number, number>();
	for (const label of small) {
		const group = groups.get(label);
		if (group === undefined || groupSizes.get(group)! < MIN_SPEAKER_SAMPLES) {
			target.set(label, nearestLarge.get(label)!);
			continue;
		}
		if (!newSpeakers.has(group)) newSpeakers.set(group, large.length + newSpeakers.size);
		target.set(label, newSpeakers.get(group)!);
	}

	return labels.map((label) => target.get(label)!);
}

export function clusterEmbeddings(
	embeddings: Float64Array,
	activity: Uint8Array,
	chunkCount: number
): Int32Array {
	const pairs = chunkCount * LOCAL_SPEAKERS;
	const { active, clean } = activityTotals(activity, chunkCount);

	const train = [];
	for (let pair = 0; pair < pairs; pair++) {
		if (clean[pair] < MIN_ACTIVE_RATIO * FRAMES_PER_CHUNK) continue;
		if (embeddingAt(embeddings, pair).every(Number.isFinite)) train.push(pair);
	}

	const hardClusters = new Int32Array(pairs);
	if (train.length >= 2) {
		const trainEmbeddings = new Float64Array(train.length * EMBEDDING_DIMENSION);
		train.forEach((pair, row) =>
			trainEmbeddings.set(embeddingAt(embeddings, pair), row * EMBEDDING_DIMENSION)
		);

		const trainClusters = clusterTraining(trainEmbeddings, train.length);
		const clusters = trainClusters.reduce((maximum, label) => Math.max(maximum, label), 0) + 1;
		const centroids = Array.from({ length: clusters }, (_, cluster) =>
			clusterCentroid(trainEmbeddings, trainClusters, cluster)
		);

		for (let pair = 0; pair < pairs; pair++) {
			hardClusters[pair] = mostSimilar(embeddingAt(embeddings, pair), centroids);
		}
	}

	for (let pair = 0; pair < pairs; pair++) {
		if (active[pair] === 0) hardClusters[pair] = UNASSIGNED;
	}

	return hardClusters;
}
