/*
 * Port of pyannote.audio's `VBx` and `cluster_vbx` (utils/vbx.py, derived from BUT's VBx,
 * Apache-2.0): Bayesian clustering of PLDA-space x-vectors without the HMM.
 */

export interface VbxResult {
	/** Responsibilities, `(count × speakers)`. */
	gamma: Float64Array;
	/** Speaker priors, `(speakers)`. */
	pi: Float64Array;
	speakers: number;
}

const INIT_SMOOTHING = 7;
const MAX_ITERATIONS = 20;
const EPSILON = 1e-4;
const PRIOR_FLOOR = 1e-8;

export function clusterVbx(
	ahcLabels: Int32Array,
	features: Float64Array,
	phi: Float64Array,
	fa: number,
	fb: number
): VbxResult {
	const count = ahcLabels.length;
	const dimension = phi.length;
	const speakers = ahcLabels.reduce((maximum, label) => Math.max(maximum, label), -1) + 1;

	if (features.length !== count * dimension) {
		throw new Error(`VBx expected ${count}x${dimension} features.`);
	}

	// qinit = softmax(onehot(ahc) * init_smoothing)
	let gamma = new Float64Array(count * speakers);
	const offLabel = 1 / (Math.exp(INIT_SMOOTHING) + speakers - 1);
	const onLabel = Math.exp(INIT_SMOOTHING) * offLabel;
	for (let t = 0; t < count; t++) {
		for (let s = 0; s < speakers; s++)
			gamma[t * speakers + s] = s === ahcLabels[t] ? onLabel : offLabel;
	}
	let pi = new Float64Array(speakers).fill(1 / speakers);

	const constant = new Float64Array(count);
	const rho = new Float64Array(count * dimension);
	for (let t = 0; t < count; t++) {
		let squares = 0;
		for (let d = 0; d < dimension; d++) {
			const value = features[t * dimension + d];
			squares += value * value;
			rho[t * dimension + d] = value * Math.sqrt(phi[d]);
		}
		constant[t] = -0.5 * (squares + dimension * Math.log(2 * Math.PI));
	}

	const ratio = fa / fb;
	const invL = new Float64Array(speakers * dimension);
	const alpha = new Float64Array(speakers * dimension);
	const logP = new Float64Array(count * speakers);
	let previousElbo = -Infinity;

	for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
		alpha.fill(0);
		for (let s = 0; s < speakers; s++) {
			let occupancy = 0;
			for (let t = 0; t < count; t++) occupancy += gamma[t * speakers + s];
			for (let d = 0; d < dimension; d++)
				invL[s * dimension + d] = 1 / (1 + ratio * occupancy * phi[d]);
		}
		for (let t = 0; t < count; t++) {
			for (let s = 0; s < speakers; s++) {
				const weight = gamma[t * speakers + s];
				for (let d = 0; d < dimension; d++)
					alpha[s * dimension + d] += weight * rho[t * dimension + d];
			}
		}
		for (let index = 0; index < alpha.length; index++) alpha[index] *= ratio * invL[index];

		const speakerTerm = new Float64Array(speakers);
		for (let s = 0; s < speakers; s++) {
			for (let d = 0; d < dimension; d++) {
				const index = s * dimension + d;
				speakerTerm[s] += (invL[index] + alpha[index] ** 2) * phi[d];
			}
		}

		const logPi = pi.map((prior) => Math.log(prior + PRIOR_FLOOR));
		let totalLogLikelihood = 0;
		const nextGamma = new Float64Array(count * speakers);

		for (let t = 0; t < count; t++) {
			let maximum = -Infinity;
			for (let s = 0; s < speakers; s++) {
				let dot = 0;
				for (let d = 0; d < dimension; d++)
					dot += rho[t * dimension + d] * alpha[s * dimension + d];
				logP[t * speakers + s] = fa * (dot - 0.5 * speakerTerm[s] + constant[t]);
				maximum = Math.max(maximum, logP[t * speakers + s] + logPi[s]);
			}

			let sum = 0;
			for (let s = 0; s < speakers; s++)
				sum += Math.exp(logP[t * speakers + s] + logPi[s] - maximum);
			const logPx = maximum + Math.log(sum);
			totalLogLikelihood += logPx;

			for (let s = 0; s < speakers; s++) {
				nextGamma[t * speakers + s] = Math.exp(logP[t * speakers + s] + logPi[s] - logPx);
			}
		}

		gamma = nextGamma;
		pi = new Float64Array(speakers);
		for (let t = 0; t < count; t++) {
			for (let s = 0; s < speakers; s++) pi[s] += gamma[t * speakers + s];
		}
		const piTotal = pi.reduce((sum, value) => sum + value, 0);
		pi = pi.map((value) => value / piTotal);

		let regularizer = 0;
		for (let index = 0; index < invL.length; index++) {
			regularizer += Math.log(invL[index]) - invL[index] - alpha[index] ** 2 + 1;
		}
		const elbo = totalLogLikelihood + fb * 0.5 * regularizer;

		if (iteration > 0 && elbo - previousElbo < EPSILON) break;
		previousElbo = elbo;
	}

	return { gamma, pi, speakers };
}
