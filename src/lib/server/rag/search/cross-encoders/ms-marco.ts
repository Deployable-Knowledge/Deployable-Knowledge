import {
	AutoModelForSequenceClassification,
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
import { sigmoidScore, type CrossEncoder } from './cross-encoder';

const MODEL_ID = 'Xenova/ms-marco-MiniLM-L-6-v2';
const MAX_LENGTH = 512;
const BATCH_SIZE = 32;

const log = createLogger('search');

type Tokenizer = Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;

type ClassificationModel = Awaited<
	ReturnType<typeof AutoModelForSequenceClassification.from_pretrained>
>;

type MsMarcoRuntime = {
	tokenizer: Tokenizer;
	model: ClassificationModel;
};

export class MsMarco implements CrossEncoder {
	readonly id = 'ms-marco-minilm-l6-v2';
	readonly name = 'MS Marco MiniLM L6';

	private runtimePromise: Promise<MsMarcoRuntime> | undefined;

	isInstalled(): Promise<boolean> {
		return ModelRegistry.is_cached(MODEL_ID, { cache_dir: TRANSFORMERS_CACHE_DIR });
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
				throw new Error(`MS Marco returned a non-finite score at index ${index}`);
			}

			return sigmoidScore(score);
		});
	}

	private getRuntime(onProgress: DownloadProgressHandler = () => {}): Promise<MsMarcoRuntime> {
		if (!this.runtimePromise) {
			const started = Date.now();
			const progress_callback = transformersProgress(combineFileProgress(onProgress));

			log.info('Loading reranker', { model: this.name });

			this.runtimePromise = Promise.all([
				AutoTokenizer.from_pretrained(MODEL_ID, {
					cache_dir: TRANSFORMERS_CACHE_DIR,
					progress_callback
				}),
				AutoModelForSequenceClassification.from_pretrained(MODEL_ID, {
					cache_dir: TRANSFORMERS_CACHE_DIR,
					progress_callback,
					session_options: {
						intraOpNumThreads: INFERENCE_THREADS,
						interOpNumThreads: 1
					}
				})
			])
				.then(([tokenizer, model]) => {
					log.info('Reranker ready', { durationMs: Date.now() - started, model: this.name });

					return {
						tokenizer,
						model
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
		runtime: MsMarcoRuntime
	): Promise<number[]> {
		const queries = new Array(passages.length).fill(query);
		const inputs = await runtime.tokenizer(queries, {
			text_pair: [...passages],
			padding: true,
			truncation: true,
			max_length: MAX_LENGTH
		});
		let logits: Tensor | undefined;

		try {
			const output = await runtime.model(inputs);
			logits = output.logits;

			if (!logits) {
				throw new Error('MS Marco did not return logits');
			}

			if (!(logits.data instanceof Float32Array)) {
				throw new Error('MS Marco returned a non-float32 tensor');
			}

			if (logits.data.length !== passages.length) {
				throw new Error('MS Marco score count does not match the passage count');
			}

			return Array.from(logits.data);
		} finally {
			logits?.dispose();

			for (const tensor of Object.values(inputs)) {
				tensor.dispose();
			}
		}
	}
}
