export const AUDIO_SAMPLE_RATE = 16_000;

export interface AudioChunk {
	startSample: number;
	endSample: number;
	samples: Float32Array;
}

export function sampleIndexToMs(sampleIndex: number): number {
	return Math.round((sampleIndex / AUDIO_SAMPLE_RATE) * 1000);
}

export function sliceAudioChunk(
	audioData: Float32Array,
	startSample: number,
	endSample: number
): AudioChunk {
	const start = Math.max(0, Math.min(audioData.length, Math.trunc(startSample)));
	const end = Math.max(start, Math.min(audioData.length, Math.trunc(endSample)));

	return {
		startSample: start,
		endSample: end,
		samples: audioData.subarray(start, end)
	};
}
