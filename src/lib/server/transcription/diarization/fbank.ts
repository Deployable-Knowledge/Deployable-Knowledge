export const MEL_BINS = 80;

const SAMPLE_RATE = 16_000;
const FFT_SIZE = 400;
export const FBANK_HOP = 160;
const PADDING = FFT_SIZE / 2;
const SPECTRUM_BINS = FFT_SIZE / 2 + 1;
const OUTER = 16;
const INNER = 25;
const AMPLITUDE_FLOOR = 1e-10;
const DYNAMIC_RANGE_DB = 80;

const window = Float64Array.from(
	{ length: FFT_SIZE },
	(_, n) => 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / FFT_SIZE)
);

function rootsOfUnity(size: number, rows: number, columns: number) {
	const cos = new Float64Array(rows * columns);
	const sin = new Float64Array(rows * columns);
	for (let row = 0; row < rows; row++) {
		for (let column = 0; column < columns; column++) {
			const angle = (-2 * Math.PI * ((row * column) % size)) / size;
			cos[row * columns + column] = Math.cos(angle);
			sin[row * columns + column] = Math.sin(angle);
		}
	}
	return { cos, sin };
}

const outerRoots = rootsOfUnity(OUTER, OUTER, OUTER);
const twiddles = rootsOfUnity(FFT_SIZE, INNER, OUTER);
const innerRoots = rootsOfUnity(INNER, INNER, INNER);

function toMel(hz: number): number {
	return 2595 * Math.log10(1 + hz / 700);
}

function toHz(mel: number): number {
	return 700 * (10 ** (mel / 2595) - 1);
}

const melFilters = (() => {
	const melLow = toMel(0);
	const melHigh = toMel(SAMPLE_RATE / 2);
	const hz = Array.from({ length: MEL_BINS + 2 }, (_, index) =>
		toHz(melLow + ((melHigh - melLow) * index) / (MEL_BINS + 1))
	);

	return Array.from({ length: MEL_BINS }, (_, bin) => {
		const center = hz[bin + 1];
		const band = hz[bin + 1] - hz[bin];
		const weights: number[] = [];
		let first = -1;
		for (let spectrumBin = 0; spectrumBin < SPECTRUM_BINS; spectrumBin++) {
			const frequency = (spectrumBin * (SAMPLE_RATE / 2)) / (SPECTRUM_BINS - 1);
			const slope = (frequency - center) / band;
			const weight = Math.max(0, Math.min(1 + slope, 1 - slope));
			if (weight === 0) continue;
			if (first < 0) first = spectrumBin;
			weights[spectrumBin - first] = weight;
		}
		return { first, weights: Float64Array.from(weights, (weight) => weight ?? 0) };
	});
})();

const real = new Float64Array(INNER * OUTER);
const imaginary = new Float64Array(INNER * OUTER);
const frame = new Float64Array(FFT_SIZE);
const power = new Float64Array(SPECTRUM_BINS);
const means = new Float64Array(MEL_BINS);

function powerSpectrum(): void {
	for (let n2 = 0; n2 < INNER; n2++) {
		for (let k1 = 0; k1 < OUTER; k1++) {
			let sumReal = 0;
			let sumImaginary = 0;
			for (let n1 = 0; n1 < OUTER; n1++) {
				const sample = frame[INNER * n1 + n2];
				sumReal += sample * outerRoots.cos[n1 * OUTER + k1];
				sumImaginary += sample * outerRoots.sin[n1 * OUTER + k1];
			}
			const twiddle = n2 * OUTER + k1;
			real[twiddle] = sumReal * twiddles.cos[twiddle] - sumImaginary * twiddles.sin[twiddle];
			imaginary[twiddle] = sumReal * twiddles.sin[twiddle] + sumImaginary * twiddles.cos[twiddle];
		}
	}

	for (let k1 = 0; k1 < OUTER; k1++) {
		for (let k2 = 0; k1 + OUTER * k2 < SPECTRUM_BINS; k2++) {
			let sumReal = 0;
			let sumImaginary = 0;
			for (let n2 = 0; n2 < INNER; n2++) {
				const value = n2 * OUTER + k1;
				const root = n2 * INNER + k2;
				sumReal += real[value] * innerRoots.cos[root] - imaginary[value] * innerRoots.sin[root];
				sumImaginary +=
					real[value] * innerRoots.sin[root] + imaginary[value] * innerRoots.cos[root];
			}
			power[k1 + OUTER * k2] = sumReal * sumReal + sumImaginary * sumImaginary;
		}
	}
}

export function countFbankFrames(sampleCount: number): number {
	return 1 + Math.floor(sampleCount / FBANK_HOP);
}

export function computeLogMelFrames(
	samples: Float32Array,
	firstFrame: number,
	frameCount: number,
	target: Float64Array
): void {
	for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
		const start = (firstFrame + frameIndex) * FBANK_HOP - PADDING;
		for (let n = 0; n < FFT_SIZE; n++) {
			const index = start + n;
			const sample = index >= 0 && index < samples.length ? samples[index] : 0;
			frame[n] = sample * window[n];
		}
		powerSpectrum();

		for (let bin = 0; bin < MEL_BINS; bin++) {
			const { first, weights } = melFilters[bin];
			let energy = 0;
			for (let offset = 0; offset < weights.length; offset++)
				energy += power[first + offset] * weights[offset];
			target[frameIndex * MEL_BINS + bin] = 10 * Math.log10(Math.max(energy, AMPLITUDE_FLOOR));
		}
	}
}

export function normalizeFbank(
	logMel: Float64Array,
	frameCount: number,
	output: Float32Array
): Float32Array {
	const valueCount = frameCount * MEL_BINS;
	if (output.length < valueCount) {
		throw new Error(`Fbank output holds ${output.length} values; ${valueCount} are needed.`);
	}

	let maximum = -Infinity;
	for (let index = 0; index < valueCount; index++) {
		if (logMel[index] > maximum) maximum = logMel[index];
	}

	const floor = maximum - DYNAMIC_RANGE_DB;
	means.fill(0);
	for (let index = 0; index < valueCount; index++) {
		means[index % MEL_BINS] += Math.max(logMel[index], floor);
	}
	for (let bin = 0; bin < MEL_BINS; bin++) means[bin] /= frameCount;

	for (let index = 0; index < valueCount; index++) {
		output[index] = Math.max(logMel[index], floor) - means[index % MEL_BINS];
	}
	return output.subarray(0, valueCount);
}
