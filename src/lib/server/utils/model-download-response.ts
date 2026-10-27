import type { ApiModelDownloadEvent } from '#lib/types';
import { createLogger } from '#lib/server/logging';
import type { DownloadProgressHandler } from './download-progress';
import { ndjsonTaskResponse } from './ndjson-response';

const PROGRESS_INTERVAL_MS = 300;

const log = createLogger('models');

export function modelDownloadResponse(
	name: string,
	download: (onProgress: DownloadProgressHandler) => Promise<void>,
	onCancel?: () => void
): Response {
	return ndjsonTaskResponse<ApiModelDownloadEvent>(
		log,
		name,
		async (send) => {
			let lastSentAt = 0;
			await download((loaded, total) => {
				const now = Date.now();
				if (!total || (now - lastSentAt < PROGRESS_INTERVAL_MS && loaded < total)) return;
				lastSentAt = now;
				send({ status: 'progress', progress: loaded / total, loaded, total });
			});
			send({ status: 'ready' });
		},
		(cause) => ({
			status: 'error',
			message: cause instanceof Error ? cause.message : `${name} failed`
		}),
		onCancel
	);
}
