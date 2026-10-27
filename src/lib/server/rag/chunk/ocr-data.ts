import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DownloadProgressHandler } from '#lib/server/utils/download-progress';
import { downloadVerifiedFile } from '#lib/server/utils/verified-download';

export const OCR_DATA_DIR = resolve(process.cwd(), '.cache', 'tessdata');

const OCR_DATA_FILE = join(OCR_DATA_DIR, 'eng.traineddata');
const OCR_DATA_URL =
	'https://raw.githubusercontent.com/tesseract-ocr/tessdata/4.1.0/eng.traineddata';
const OCR_DATA_SHA256 = 'daa0c97d651c19fba3b25e81317cd697e9908c8208090c94c3905381c23fc047';

let installation: Promise<void> | undefined;

export function isOcrDataInstalled(): boolean {
	return existsSync(OCR_DATA_FILE);
}

export function installOcrData(onProgress?: DownloadProgressHandler): Promise<void> {
	if (isOcrDataInstalled()) return Promise.resolve();

	installation ??= downloadVerifiedFile({
		url: OCR_DATA_URL,
		destination: OCR_DATA_FILE,
		sha256: OCR_DATA_SHA256,
		onProgress
	}).finally(() => {
		installation = undefined;
	});
	return installation;
}
