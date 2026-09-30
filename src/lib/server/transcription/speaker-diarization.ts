import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import type { DiarizationProgress } from './community-1/pipeline';
import type { DiarizeReply, DiarizeRequest } from './community-1/worker-protocol';
import type { SpeakerTurn } from './speaker-turn';

const WORKER_PATH = resolve(
	process.env.DK_APP_ROOT?.trim() || process.cwd(),
	'dist-workers',
	'diarization-worker.mjs'
);

interface PendingJob {
	id: number;
	worker: Worker;
	onProgress?: DiarizationProgress;
	resolve(turns: SpeakerTurn[]): void;
	reject(error: Error): void;
}

let worker: Worker | undefined;
let pending: PendingJob | undefined;
let nextJobId = 1;
let queue: Promise<unknown> = Promise.resolve();

function startWorker(): Worker {
	if (!existsSync(WORKER_PATH)) {
		throw new Error(`The diarization worker has not been built: ${WORKER_PATH} is missing.`);
	}

	const started = new Worker(WORKER_PATH, { execArgv: [] });

	started.on('message', (message: DiarizeReply) => {
		const job = pending;
		if (!job || job.worker !== started || job.id !== message.id) return;

		if (message.type === 'progress') {
			job.onProgress?.(message.stage, message.fraction);
			return;
		}

		pending = undefined;
		started.unref();
		if (message.type === 'result') job.resolve(message.turns);
		else job.reject(new Error(message.message));
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
		fail(new Error(`The diarization worker stopped (exit code ${code}).`))
	);

	// Held open only while a job runs, so an idle worker never keeps the server from exiting
	started.unref();
	return started;
}

function runJob(samples: Float32Array, onProgress?: DiarizationProgress): Promise<SpeakerTurn[]> {
	return new Promise((resolve, reject) => {
		worker ??= startWorker();
		const request: DiarizeRequest = { type: 'diarize', id: nextJobId++, samples };
		pending = { id: request.id, worker, onProgress, resolve, reject };

		const transfer = samples.buffer instanceof ArrayBuffer ? [samples.buffer] : [];
		worker.ref();
		worker.postMessage(request, transfer);
	});
}

export function diarizeAudio(
	samples: Float32Array,
	onProgress?: DiarizationProgress
): Promise<SpeakerTurn[]> {
	const job = queue.then(() => runJob(samples, onProgress));
	queue = job.catch(() => undefined);
	return job;
}
