import type { ProgressCallback } from '@huggingface/transformers';

export type DownloadProgressHandler = (loaded: number, total: number) => void;

export type FileProgressHandler = (file: string, loaded: number, total: number) => void;

export function combineFileProgress(onProgress: DownloadProgressHandler): FileProgressHandler {
	const files = new Map<string, { loaded: number; total: number }>();

	return (file, loaded, total) => {
		files.set(file, { loaded, total });

		let combinedLoaded = 0;
		let combinedTotal = 0;
		for (const progress of files.values()) {
			combinedLoaded += progress.loaded;
			combinedTotal += progress.total;
		}
		onProgress(combinedLoaded, combinedTotal);
	};
}

export function transformersProgress(onFileProgress: FileProgressHandler): ProgressCallback {
	return (info) => {
		if (info.status !== 'progress') return;
		onFileProgress(`${info.name}/${info.file}`, info.loaded, info.total);
	};
}
