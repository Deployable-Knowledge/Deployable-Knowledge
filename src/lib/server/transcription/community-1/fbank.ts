/*
 * Kaldi-compatible log mel filterbank, matching `torchaudio.compliance.kaldi.fbank` with the
 * Community-1 WeSpeaker settings (16 kHz, 80 bins, 25 ms / 10 ms, Hamming, no dither, no energy,
 * snip_edges, power spectrum, 0.97 pre-emphasis, DC removal), followed by per-bin mean
 * normalization as `BaseWeSpeakerResNet.compute_fbank`.
 */

export const MEL_BINS = 80;

const SAMPLE_RATE = 16_000;
const FRAME_LENGTH = 400;
const FRAME_SHIFT = 160;
const FFT_SIZE = 512;
const FFT_BINS = FFT_SIZE / 2;
const PREEMPHASIS = 0.97;
const LOW_FREQUENCY = 20;
const FLOAT32_EPSILON = 1.1920928955078125e-7;
const WAVEFORM_SCALE = 1 << 15;

const window = Float64Array.from(
	{ length: FRAME_LENGTH },
	(_, n) => 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (FRAME_LENGTH - 1))
);

function melScale(frequency: number): number {
	return 1127 * Math.log(1 + frequency / 700);
}

const melBanks = (() => {
	const banks = new Float64Array(MEL_BINS * FFT_BINS);
	const melLow = melScale(LOW_FREQUENCY);
	const melHigh = melScale(SAMPLE_RATE / 2);
	const melDelta = (melHigh - melLow) / (MEL_BINS + 1);
	const binWidth = SAMPLE_RATE / FFT_SIZE;

	for (let bin = 0; bin < MEL_BINS; bin++) {
		const left = melLow + bin * melDelta;
		const center = melLow + (bin + 1) * melDelta;
		const right = melLow + (bin + 2) * melDelta;

		for (let fftBin = 0; fftBin < FFT_BINS; fftBin++) {
			const mel = melScale(binWidth * fftBin);
			const up = (mel - left) / (center - left);
			const down = (right - mel) / (right - center);
			banks[bin * FFT_BINS + fftBin] = Math.max(0, Math.min(up, down));
		}
	}

	return banks;
})();

const bitReversal = Uint16Array.from({ length: FFT_SIZE }, (_, index) => {
	let reversed = 0;
	for (let bit = 1, value = index; bit < FFT_SIZE; bit <<= 1, value >>= 1) {
		reversed = (reversed << 1) | (value & 1);
	}
	return reversed;
});

const twiddleCos = Float64Array.from({ length: FFT_SIZE / 2 }, (_, k) =>
	Math.cos((-2 * Math.PI * k) / FFT_SIZE)
);
const twiddleSin = Float64Array.from({ length: FFT_SIZE / 2 }, (_, k) =>
	Math.sin((-2 * Math.PI * k) / FFT_SIZE)
);

function fft(real: Float64Array, imaginary: Float64Array): void {
	for (let index = 0; index < FFT_SIZE; index++) {
		const target = bitReversal[index];
		if (target <= index) continue;
		[real[index], real[target]] = [real[target], real[index]];
		[imaginary[index], imaginary[target]] = [imaginary[target], imaginary[index]];
	}

	for (let size = 2; size <= FFT_SIZE; size <<= 1) {
		const half = size >> 1;
		const stride = FFT_SIZE / size;

		for (let start = 0; start < FFT_SIZE; start += size) {
			for (let k = 0; k < half; k++) {
				const cos = twiddleCos[k * stride];
				const sin = twiddleSin[k * stride];
				const even = start + k;
				const odd = even + half;
				const oddReal = real[odd] * cos - imaginary[odd] * sin;
				const oddImaginary = real[odd] * sin + imaginary[odd] * cos;

				real[odd] = real[even] - oddReal;
				imaginary[odd] = imaginary[even] - oddImaginary;
				real[even] += oddReal;
				imaginary[even] += oddImaginary;
			}
		}
	}
}

export function countFbankFrames(sampleCount: number): number {
	return sampleCount < FRAME_LENGTH
		? 0
		: 1 + Math.floor((sampleCount - FRAME_LENGTH) / FRAME_SHIFT);
}

export function computeFbank(waveform: Float32Array, target: Float32Array): void {
	const frameCount = countFbankFrames(waveform.length);
	if (target.length !== frameCount * MEL_BINS) {
		throw new Error(
			`FBank target holds ${target.length} values; expected ${frameCount * MEL_BINS}.`
		);
	}

	const frame = new Float64Array(FRAME_LENGTH);
	const real = new Float64Array(FFT_SIZE);
	const imaginary = new Float64Array(FFT_SIZE);
	const power = new Float64Array(FFT_BINS);
	const means = new Float64Array(MEL_BINS);

	for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
		const offset = frameIndex * FRAME_SHIFT;
		let mean = 0;
		for (let n = 0; n < FRAME_LENGTH; n++) {
			frame[n] = Math.fround(waveform[offset + n] * WAVEFORM_SCALE);
			mean += frame[n];
		}
		mean /= FRAME_LENGTH;
		for (let n = 0; n < FRAME_LENGTH; n++) frame[n] -= mean;

		// Pre-emphasis uses the previous sample, replicating the first one.
		real.fill(0);
		imaginary.fill(0);
		for (let n = FRAME_LENGTH - 1; n >= 0; n--) {
			const previous = n > 0 ? frame[n - 1] : frame[0];
			real[n] = (frame[n] - PREEMPHASIS * previous) * window[n];
		}

		fft(real, imaginary);
		for (let bin = 0; bin < FFT_BINS; bin++) power[bin] = real[bin] ** 2 + imaginary[bin] ** 2;

		for (let melBin = 0; melBin < MEL_BINS; melBin++) {
			let energy = 0;
			for (let bin = 0; bin < FFT_BINS; bin++)
				energy += power[bin] * melBanks[melBin * FFT_BINS + bin];
			const logEnergy = Math.log(Math.max(energy, FLOAT32_EPSILON));
			target[frameIndex * MEL_BINS + melBin] = logEnergy;
			means[melBin] += logEnergy;
		}
	}

	for (let melBin = 0; melBin < MEL_BINS; melBin++) means[melBin] /= frameCount;
	for (let index = 0; index < target.length; index++) target[index] -= means[index % MEL_BINS];
}
