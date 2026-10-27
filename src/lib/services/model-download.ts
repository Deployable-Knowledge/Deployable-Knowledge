import type {
	ApiDocumentIngestProgress,
	ApiLocalModelDownloadRequest,
	ApiModelDownloadEvent,
	ApiSetupInstallRequest
} from '#lib/types';
import { apiStream, formatBytes, parseNdjsonStream } from '#lib/utils';

export async function streamModelDownload(
	endpoint: string,
	body: ApiLocalModelDownloadRequest | ApiSetupInstallRequest,
	label: string,
	onProgress?: (progress: ApiDocumentIngestProgress) => void,
	signal?: AbortSignal
): Promise<void> {
	const response = await apiStream(endpoint, {
		method: 'POST',
		body: JSON.stringify(body),
		signal
	});

	let ready = false;

	for await (const event of parseNdjsonStream<ApiModelDownloadEvent>(response, signal)) {
		if (event.status === 'progress') {
			onProgress?.({
				percent: event.progress * 100,
				label,
				message: `${formatBytes(event.loaded)} / ${formatBytes(event.total)}`
			});
		} else if (event.status === 'ready') {
			ready = true;
		} else if (event.status === 'error') {
			throw new Error(event.message);
		}
	}

	if (!ready) throw new Error('The download ended unexpectedly.');
}
