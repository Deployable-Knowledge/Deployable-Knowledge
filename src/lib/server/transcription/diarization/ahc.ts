function condensedIndex(n: number, i: number, j: number): number {
	return n * i - (i * (i + 1)) / 2 + (j - i - 1);
}

interface Merge {
	left: number;
	right: number;
	distance: number;
}

function centroidLinkage(points: Float64Array, count: number, dimension: number): Merge[] {
	const distances = new Float32Array((count * (count - 1)) / 2);
	let pair = 0;
	for (let i = 0; i < count; i++) {
		for (let j = i + 1; j < count; j++) {
			let dot = 0;
			for (let d = 0; d < dimension; d++)
				dot += points[i * dimension + d] * points[j * dimension + d];
			// Euclidean distance between unit vectors; points must be L2-normalized.
			distances[pair++] = Math.sqrt(Math.max(0, 2 - 2 * dot));
		}
	}

	const size = new Float64Array(count).fill(1);
	const clusterId = Int32Array.from({ length: count }, (_, index) => index);
	const neighbor = new Int32Array(count).fill(-1);
	const minDistance = new Float64Array(count).fill(Infinity);

	const findNearest = (x: number): void => {
		let best = -1;
		let bestDistance = Infinity;
		for (let z = x + 1; z < count; z++) {
			if (size[z] === 0) continue;
			const distance = distances[condensedIndex(count, x, z)];
			if (distance < bestDistance) {
				best = z;
				bestDistance = distance;
			}
		}
		neighbor[x] = best;
		minDistance[x] = bestDistance;
	};

	const closestCluster = (): number => {
		let best = -1;
		for (let x = 0; x < count - 1; x++) {
			if (size[x] > 0 && (best < 0 || minDistance[x] < minDistance[best])) best = x;
		}
		return best;
	};

	for (let x = 0; x < count - 1; x++) findNearest(x);
	const merges: Merge[] = [];

	for (let step = 0; step < count - 1; step++) {
		let x = closestCluster();
		let y = neighbor[x];
		while (minDistance[x] !== distances[condensedIndex(count, x, y)]) {
			findNearest(x);
			x = closestCluster();
			y = neighbor[x];
		}

		const distance = minDistance[x];

		const sizeX = size[x];
		const sizeY = size[y];
		const merged = sizeX + sizeY;
		merges.push({
			left: Math.min(clusterId[x], clusterId[y]),
			right: Math.max(clusterId[x], clusterId[y]),
			distance
		});

		size[x] = 0;
		size[y] = merged;
		clusterId[y] = count + step;

		for (let z = 0; z < count; z++) {
			if (size[z] === 0 || z === y) continue;
			const dxz =
				z < x ? distances[condensedIndex(count, z, x)] : distances[condensedIndex(count, x, z)];
			const yzIndex = z < y ? condensedIndex(count, z, y) : condensedIndex(count, y, z);
			const dyz = distances[yzIndex];
			const squared =
				(sizeX * dxz * dxz + sizeY * dyz * dyz - (sizeX * sizeY * distance * distance) / merged) /
				merged;
			distances[yzIndex] = Math.sqrt(Math.max(0, squared));
		}

		for (let z = 0; z < x; z++) {
			if (size[z] > 0 && neighbor[z] === x) neighbor[z] = y;
		}

		for (let z = 0; z < y; z++) {
			if (size[z] === 0) continue;
			const candidate = distances[condensedIndex(count, z, y)];
			if (candidate < minDistance[z]) {
				neighbor[z] = y;
				minDistance[z] = candidate;
			}
		}

		if (y < count - 1) findNearest(y);
	}

	return merges;
}

function cutDendrogram(merges: Merge[], count: number, threshold: number): Int32Array {
	const maxDistance = new Float64Array(merges.length);
	merges.forEach((merge, index) => {
		let value = merge.distance;
		if (merge.left >= count) value = Math.max(value, maxDistance[merge.left - count]);
		if (merge.right >= count) value = Math.max(value, maxDistance[merge.right - count]);
		maxDistance[index] = value;
	});

	const labels = new Int32Array(count);
	const stack: Array<[node: number, label: number]> = [[2 * count - 2, 0]];
	let clusters = 0;

	while (stack.length > 0) {
		const [node, inherited] = stack.pop()!;
		if (node < count) {
			labels[node] = inherited || ++clusters;
			continue;
		}

		const { left, right } = merges[node - count];
		const label = inherited || (maxDistance[node - count] <= threshold ? ++clusters : 0);
		for (const child of [right, left]) if (child < count) stack.push([child, label]);
		for (const child of [right, left]) if (child >= count) stack.push([child, label]);
	}

	return labels;
}

export function agglomerativeClusters(
	points: Float64Array,
	count: number,
	dimension: number,
	threshold: number
): Int32Array {
	const flat = cutDendrogram(centroidLinkage(points, count, dimension), count, threshold);
	const unique = [...new Set(flat)].sort((left, right) => left - right);
	const relabel = new Map(unique.map((label, index) => [label, index]));
	return flat.map((label) => relabel.get(label)!);
}
