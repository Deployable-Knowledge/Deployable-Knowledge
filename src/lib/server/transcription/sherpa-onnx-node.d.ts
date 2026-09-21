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

	export interface SpeechSegment {
		start: number;
		samples: Float32Array;
	}

	export interface Vad {
		acceptWaveform(samples: Float32Array): void;
		isEmpty(): boolean;
		isDetected(): boolean;
		front(enableExternalBuffer?: boolean): SpeechSegment;
		pop(): void;
		flush(): void;
		reset(): void;
		clear(): void;
	}

	export interface SileroVadConfig {
		model: string;
		threshold: number;
		minSilenceDuration: number;
		minSpeechDuration: number;
		maxSpeechDuration: number;
		windowSize: number;
	}

	export interface VoiceActivityDetectorConfig {
		sileroVad: SileroVadConfig;
		sampleRate: number;
		numThreads: number;
		provider: string;
		debug: boolean | number;
	}

	const sherpa: {
		Vad: new (config: VoiceActivityDetectorConfig, bufferSizeInSeconds: number) => Vad;

		OfflineSpeakerDiarization: new (config: {
			segmentation: {
				pyannote: {
					model: string;
					windowShiftRatio: number;
				};
			};
			embedding: {
				model: string;
			};
			clustering: {
				numClusters: number;
				threshold: number;
			};
			minDurationOn: number;
			minDurationOff: number;
		}) => OfflineSpeakerDiarization;
	};

	export default sherpa;
}
