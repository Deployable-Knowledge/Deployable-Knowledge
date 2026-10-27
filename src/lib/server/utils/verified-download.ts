import { createHash } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DownloadProgressHandler } from './download-progress';

type VerifiedDownload = {
	url: string;
	destination: string;
	sha256: string;
	onProgress?: DownloadProgressHandler;
};

export async function downloadVerifiedFile({
	url,
	destination,
	sha256,
	onProgress
}: VerifiedDownload): Promise<void> {
	const response = await fetch(url);
	if (!response.ok || !response.body) {
		throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
	}

	const total = Number(response.headers.get('content-length')) || 0;
	const hash = createHash('sha256');
	const temporaryPath = `${destination}.${process.pid}.tmp`;
	let loaded = 0;

	await mkdir(dirname(destination), { recursive: true });
	try {
		const file = await open(temporaryPath, 'w');
		try {
			for await (const chunk of response.body) {
				hash.update(chunk);
				await file.write(chunk);
				loaded += chunk.byteLength;
				onProgress?.(loaded, total);
			}
		} finally {
			await file.close();
		}

		if (hash.digest('hex') !== sha256) throw new Error(`Checksum mismatch for ${url}`);
		await rename(temporaryPath, destination);
	} catch (error) {
		await rm(temporaryPath, { force: true });
		throw error;
	}
}
