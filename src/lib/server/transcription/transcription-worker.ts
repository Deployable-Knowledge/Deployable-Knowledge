import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import type {
	TranscribedRecording,
	TranscribeReply,
	TranscribeRequest,
	TranscriptionProgress
} from './transcription-worker-protocol';

const WORKER_PATH = resolve(
	process.env.DK_APP_ROOT?.trim() || process.cwd(),
	'dist-workers',
	'transcription-worker.mjs'
);

interface PendingJob {
	id: number;
	worker: Worker;
	onProgress?: TranscriptionProgress;
	resolve(recording: TranscribedRecording): void;
	reject(error: Error): void;
}

let worker: Worker | undefined;
let pending: PendingJob | undefined;
let nextJobId = 1;
let queue: Promise<unknown> = Promise.resolve();

function startWorker(): Worker {
	if (!existsSync(WORKER_PATH)) {
		throw new Error(`The transcription worker has not been built: ${WORKER_PATH} is missing.`);
	}

	const started = new Worker(WORKER_PATH, { execArgv: [] });

	started.on('message', (message: TranscribeReply) => {
		const job = pending;
		if (!job || job.worker !== started || job.id !== message.id) return;

		if (message.type === 'progress') {
			job.onProgress?.(message.stage, message.fraction);
			return;
		}

		pending = undefined;
		started.unref();
		if (message.type === 'error') {
			job.reject(new Error(message.message));
			return;
		}

		const { text, segments, speakerError } = message;
		job.resolve({ text, segments, speakerError });
	});

	const fail = (error: Error) => {
		if (worker === started) worker = undefined;
		if (pending?.worker !== started) return;

		const job = pending;
		pending = undefined;
		job.reject(error);
	};
	started.on('error', fail);
	started.on('exit', (code) =>
		fail(new Error(`The transcription worker stopped (exit code ${code}).`))
	);

	started.unref();
	return started;
}

function runJob(
	samples: Float32Array,
	onProgress?: TranscriptionProgress
): Promise<TranscribedRecording> {
	return new Promise((resolve, reject) => {
		worker ??= startWorker();
		const request: TranscribeRequest = { type: 'transcribe', id: nextJobId++, samples };
		pending = { id: request.id, worker, onProgress, resolve, reject };

		const transfer = samples.buffer instanceof ArrayBuffer ? [samples.buffer] : [];
		worker.ref();
		worker.postMessage(request, transfer);
	});
}

export function transcribeRecording(
	samples: Float32Array,
	onProgress?: TranscriptionProgress
): Promise<TranscribedRecording> {
	const job = queue.then(() => runJob(samples, onProgress));
	queue = job.catch(() => undefined);
	return job;
}
