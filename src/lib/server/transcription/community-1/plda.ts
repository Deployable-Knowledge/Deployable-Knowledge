/*
 * Port of pyannote.audio's `vbx_setup` and `PLDA` (utils/vbx.py, core/plda.py): x-vector
 * centering/whitening/LDA followed by projection into the PLDA latent space used by VBx.
 */

import {
	cholesky,
	invert,
	matrix,
	multiply,
	symmetricEigen,
	transpose,
	type Matrix
} from './linear-algebra';
import { parseNpz, type NpyArray } from './npy';

export const EMBEDDING_DIMENSION = 256;
const LDA_DIMENSION = 128;

export interface PldaModel {
	/** Between-speaker covariance diagonal in the PLDA space (`PLDA.phi`). */
	phi: Float64Array;
	transform(embeddings: Float64Array, count: number): Float64Array;
}

function requireArray(arrays: Map<string, NpyArray>, name: string, shape: number[]): Float64Array {
	const array = arrays.get(name);
	if (!array) throw new Error(`PLDA array ${name} is missing.`);
	if (array.shape.join('x') !== shape.join('x')) {
		throw new Error(
			`PLDA array ${name} has shape ${array.shape.join('x')}; expected ${shape.join('x')}.`
		);
	}
	if (!array.data.every(Number.isFinite)) throw new Error(`PLDA array ${name} is not finite.`);
	return array.data;
}

function l2Normalize(values: Float64Array): Float64Array {
	let norm = 0;
	for (const value of values) norm += value * value;
	norm = Math.sqrt(norm);
	return values.map((value) => value / norm);
}

/**
 * Solves the generalized symmetric eigenproblem `B·v = λ·W·v` as `scipy.linalg.eigh(B, W)` does,
 * with eigenvectors normalized so that `vᵀ·W·v = 1`, and returns them sorted by descending λ.
 */
function generalizedEigen(b: Matrix, w: Matrix): { values: Float64Array; rows: Matrix } {
	const n = b.rows;
	const lowerInverse = invert(cholesky(w));
	const reduced = multiply(multiply(lowerInverse, b), transpose(lowerInverse));

	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			const mean = 0.5 * (reduced.data[i * n + j] + reduced.data[j * n + i]);
			reduced.data[i * n + j] = mean;
			reduced.data[j * n + i] = mean;
		}
	}

	const { values, vectors } = symmetricEigen(reduced);
	const eigenvectors = multiply(transpose(lowerInverse), vectors);
	const order = Array.from(values.keys()).sort((left, right) => values[right] - values[left]);

	const sortedValues = new Float64Array(n);
	const rows = matrix(n, n);
	order.forEach((column, row) => {
		sortedValues[row] = values[column];
		for (let k = 0; k < n; k++) rows.data[row * n + k] = eigenvectors.data[k * n + column];
	});

	return { values: sortedValues, rows };
}

export function loadPlda(transformNpz: Uint8Array, pldaNpz: Uint8Array): PldaModel {
	const transformArrays = parseNpz(transformNpz);
	const pldaArrays = parseNpz(pldaNpz);

	const mean1 = requireArray(transformArrays, 'mean1', [EMBEDDING_DIMENSION]);
	const mean2 = requireArray(transformArrays, 'mean2', [LDA_DIMENSION]);
	const lda = requireArray(transformArrays, 'lda', [EMBEDDING_DIMENSION, LDA_DIMENSION]);
	const mu = requireArray(pldaArrays, 'mu', [LDA_DIMENSION]);
	const tr = matrix(
		LDA_DIMENSION,
		LDA_DIMENSION,
		requireArray(pldaArrays, 'tr', [LDA_DIMENSION, LDA_DIMENSION])
	);
	const psi = requireArray(pldaArrays, 'psi', [LDA_DIMENSION]);

	// W = inv(trᵀ·tr); B = inv((trᵀ / psi)·tr)
	const trT = transpose(tr);
	const scaledTrT = matrix(
		LDA_DIMENSION,
		LDA_DIMENSION,
		trT.data.map((value, index) => value / psi[index % LDA_DIMENSION])
	);
	const within = invert(multiply(trT, tr));
	const between = invert(multiply(scaledTrT, tr));
	const { values: pldaPsi, rows: pldaTr } = generalizedEigen(between, within);

	const transform = (embeddings: Float64Array, count: number): Float64Array => {
		if (embeddings.length !== count * EMBEDDING_DIMENSION) {
			throw new Error(`Expected ${count} embeddings of dimension ${EMBEDDING_DIMENSION}.`);
		}

		const features = new Float64Array(count * LDA_DIMENSION);
		const centered = new Float64Array(EMBEDDING_DIMENSION);
		const projected = new Float64Array(LDA_DIMENSION);

		for (let row = 0; row < count; row++) {
			for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
				centered[i] = embeddings[row * EMBEDDING_DIMENSION + i] - mean1[i];
			}
			const whitened = l2Normalize(centered).map((value) => value * Math.sqrt(EMBEDDING_DIMENSION));

			projected.fill(0);
			for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
				for (let j = 0; j < LDA_DIMENSION; j++)
					projected[j] += whitened[i] * lda[i * LDA_DIMENSION + j];
			}
			for (let j = 0; j < LDA_DIMENSION; j++) projected[j] -= mean2[j];
			const xvector = l2Normalize(projected).map((value) => value * Math.sqrt(LDA_DIMENSION));

			for (let k = 0; k < LDA_DIMENSION; k++) {
				let sum = 0;
				for (let j = 0; j < LDA_DIMENSION; j++) {
					sum += (xvector[j] - mu[j]) * pldaTr.data[k * LDA_DIMENSION + j];
				}
				features[row * LDA_DIMENSION + k] = sum;
			}
		}

		return features;
	};

	return { phi: pldaPsi, transform };
}
