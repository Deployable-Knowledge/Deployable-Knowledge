export const MEL_BINS = 80;

const SAMPLE_RATE = 16_000;
const FFT_SIZE = 400;
const HOP = 160;
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

function powerSpectrum(frame: Float64Array, power: Float64Array): void {
	const real = new Float64Array(INNER * OUTER);
	const imaginary = new Float64Array(INNER * OUTER);

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
	return 1 + Math.floor(sampleCount / HOP);
}

export function computeFbank(signal: Float32Array): Float32Array {
	const frameCount = countFbankFrames(signal.length);
	const logMel = new Float64Array(frameCount * MEL_BINS);
	const frame = new Float64Array(FFT_SIZE);
	const power = new Float64Array(SPECTRUM_BINS);
	let maximum = -Infinity;

	for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
		const start = frameIndex * HOP - PADDING;
		for (let n = 0; n < FFT_SIZE; n++) {
			const index = start + n;
			const sample = index >= 0 && index < signal.length ? signal[index] : 0;
			frame[n] = sample * window[n];
		}
		powerSpectrum(frame, power);

		for (let bin = 0; bin < MEL_BINS; bin++) {
			const { first, weights } = melFilters[bin];
			let energy = 0;
			for (let offset = 0; offset < weights.length; offset++)
				energy += power[first + offset] * weights[offset];
			const decibels = 10 * Math.log10(Math.max(energy, AMPLITUDE_FLOOR));
			logMel[frameIndex * MEL_BINS + bin] = decibels;
			if (decibels > maximum) maximum = decibels;
		}
	}

	const floor = maximum - DYNAMIC_RANGE_DB;
	const means = new Float64Array(MEL_BINS);
	for (let index = 0; index < logMel.length; index++) {
		logMel[index] = Math.max(logMel[index], floor);
		means[index % MEL_BINS] += logMel[index];
	}

	return Float32Array.from(logMel, (value, index) => value - means[index % MEL_BINS] / frameCount);
}
