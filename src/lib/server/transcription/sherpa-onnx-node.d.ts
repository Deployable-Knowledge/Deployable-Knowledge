declare module 'sherpa-onnx-node' {
	export interface SpeakerTurn {
		start: number;
		end: number;
		speaker: number;
	}

	export interface OfflineSpeakerDiarization {
		readonly sampleRate: number;
		process(samples: Float32Array): SpeakerTurn[];
	}

	const sherpa: {
		OfflineSpeakerDiarization: new (config: {
			segmentation: { pyannote: { model: string; windowShiftRatio: number } };
			embedding: { model: string };
			clustering: { numClusters: number; threshold: number };
			minDurationOn: number;
			minDurationOff: number;
		}) => OfflineSpeakerDiarization;
	};

	export default sherpa;
}
