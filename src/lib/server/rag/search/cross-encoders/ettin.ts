import {
	AutoConfig,
	AutoModel,
	AutoTokenizer,
	ModelRegistry,
	type Tensor
} from '@huggingface/transformers';
import { createLogger } from '#lib/server/logging';
import {
	combineFileProgress,
	transformersProgress,
	type DownloadProgressHandler
} from '#lib/server/utils/download-progress';
import { INFERENCE_THREADS } from '#lib/server/utils/inference-threads';
import { TRANSFORMERS_CACHE_DIR } from '#lib/server/utils/transformers-env';
import {
	isEttinHeadInstalled,
	loadEttinHeadWeights,
	scoreEttinHiddenStates,
	type EttinHeadWeights
} from './ettin-head';
import { sigmoidScore, type CrossEncoder } from './cross-encoder';

const MODEL_ID = 'cross-encoder/ettin-reranker-32m-v1';
const MODEL_REVISION = 'b33e5ceb5110773ea9cf5e00c9bedc83a8c2afdd';
const MODEL_FILE_NAME = 'model_quint8_avx2';
const MAX_LENGTH = 512;
const BATCH_SIZE = 8;

const HUB_OPTIONS = { revision: MODEL_REVISION, cache_dir: TRANSFORMERS_CACHE_DIR };

const MODEL_OPTIONS = {
	...HUB_OPTIONS,
	model_file_name: MODEL_FILE_NAME,
	dtype: 'fp32',
	device: 'cpu'
} as const;

type CacheCheckOptions = NonNullable<Parameters<typeof ModelRegistry.is_cached>[1]> & {
	model_file_name: string;
};

const log = createLogger('search');

type Tokenizer = Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;

type Encoder = Awaited<ReturnType<typeof AutoModel.from_pretrained>>;

type EttinRuntime = {
	tokenizer: Tokenizer;
	encoder: Encoder;
	head: EttinHeadWeights;
};

type EncoderOutput = {
	last_hidden_state?: Tensor;
};

export class Ettin implements CrossEncoder {
	readonly id = 'ettin-32m';
	readonly name = 'Ettin 32M';

	private runtimePromise: Promise<EttinRuntime> | undefined;

	async isInstalled(): Promise<boolean> {
		if (!isEttinHeadInstalled()) return false;

		const config = await AutoConfig.from_pretrained(MODEL_ID, HUB_OPTIONS);
		const options: CacheCheckOptions = { ...MODEL_OPTIONS, config };
		return ModelRegistry.is_cached(MODEL_ID, options);
	}

	async prepare(onProgress: DownloadProgressHandler): Promise<void> {
		await this.getRuntime(onProgress);
	}

	async predict(query: string, passages: readonly string[]): Promise<readonly number[]> {
		if (passages.length === 0) {
			return [];
		}

		const runtime = await this.getRuntime();
		const rawScores: number[] = [];

		for (let offset = 0; offset < passages.length; offset += BATCH_SIZE) {
			const batch = passages.slice(offset, offset + BATCH_SIZE);

			rawScores.push(...(await this.scoreBatch(query, batch, runtime)));
		}

		return rawScores.map((score, index) => {
			if (!Number.isFinite(score)) {
				throw new Error(`Ettin returned a non-finite score at index ${index}`);
			}

			return sigmoidScore(score);
		});
	}

	private getRuntime(onProgress: DownloadProgressHandler = () => {}): Promise<EttinRuntime> {
		if (!this.runtimePromise) {
			const started = Date.now();
			const onFileProgress = combineFileProgress(onProgress);
			const progress_callback = transformersProgress(onFileProgress);

			log.info('Loading reranker', { model: this.name });

			this.runtimePromise = Promise.all([
				AutoTokenizer.from_pretrained(MODEL_ID, { ...HUB_OPTIONS, progress_callback }),
				AutoModel.from_pretrained(MODEL_ID, {
					...MODEL_OPTIONS,
					progress_callback,
					session_options: {
						intraOpNumThreads: INFERENCE_THREADS,
						interOpNumThreads: 1
					}
				}),
				loadEttinHeadWeights(onFileProgress)
			])
				.then(([tokenizer, encoder, head]) => {
					log.info('Reranker ready', { durationMs: Date.now() - started, model: this.name });

					return {
						tokenizer,
						encoder,
						head
					};
				})
				.catch((error) => {
					this.runtimePromise = undefined;
					throw error;
				});
		}

		return this.runtimePromise;
	}

	private async scoreBatch(
		query: string,
		passages: readonly string[],
		runtime: EttinRuntime
	): Promise<number[]> {
		const queries = new Array(passages.length).fill(query);
		const inputs = await runtime.tokenizer(queries, {
			text_pair: [...passages],
			padding: true,
			truncation: true,
			max_length: MAX_LENGTH
		});
		let hiddenStates: Tensor | undefined;

		try {
			const output = (await runtime.encoder(inputs)) as EncoderOutput;

			hiddenStates = output.last_hidden_state;

			if (!hiddenStates) {
				throw new Error('Ettin ONNX encoder did not return last_hidden_state');
			}

			if (!(hiddenStates.data instanceof Float32Array)) {
				throw new Error('Ettin ONNX encoder returned a non-float32 tensor');
			}

			return scoreEttinHiddenStates(hiddenStates.data, Array.from(hiddenStates.dims), runtime.head);
		} finally {
			hiddenStates?.dispose();

			for (const tensor of Object.values(inputs)) {
				tensor.dispose();
			}
		}
	}
}
