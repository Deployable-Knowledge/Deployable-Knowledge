/*
 * Worker-thread entry for Community-1 diarization. Its long synchronous stages (FBank, pooling,
 * clustering, reconstruction) run here so they never block the server's event loop.
 * Bundled by the Vite plugin in vite.config.ts to dist-workers/diarization-worker.mjs.
 */

import { parentPort } from 'node:worker_threads';
import { createCommunity1Diarizer, type Community1Diarizer } from './pipeline';
import type { DiarizeReply, DiarizeRequest } from './worker-protocol';

if (!parentPort) throw new Error('The diarization worker must run in a worker thread.');
const port = parentPort;

let diarizer: Promise<Community1Diarizer> | undefined;

function loadDiarizer(): Promise<Community1Diarizer> {
	// A failed load (for example missing model files) is retried on the next request.
	diarizer ??= createCommunity1Diarizer().catch((error: unknown) => {
		diarizer = undefined;
		throw error;
	});
	return diarizer;
}

function reply(message: DiarizeReply): void {
	port.postMessage(message);
}

async function diarize({ id, samples }: DiarizeRequest): Promise<void> {
	try {
		const { turns } = await (
			await loadDiarizer()
		).diarize(samples, {
			onProgress: (stage, fraction) => reply({ type: 'progress', id, stage, fraction })
		});
		reply({ type: 'result', id, turns });
	} catch (error) {
		reply({ type: 'error', id, message: error instanceof Error ? error.message : String(error) });
	}
}

port.on('message', (request: DiarizeRequest) => {
	if (request.type === 'diarize') void diarize(request);
});
