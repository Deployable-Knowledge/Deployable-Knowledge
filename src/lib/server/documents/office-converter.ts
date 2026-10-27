import type { WorkerConverter } from '@matbee/libreoffice-converter/server';
import { createLogger } from '#lib/server/logging';
import { withTimeout } from '#lib/server/utils/with-timeout';

export type OfficeInputFormat = 'docx' | 'pptx' | 'xlsx';

const IDLE_TEARDOWN_MS = 5 * 60 * 1000;
const CONVERSION_TIMEOUT_MS = 2 * 60 * 1000;
const TEARDOWN_TIMEOUT_MS = 5 * 1000;

const log = createLogger('documents');

let converterPromise: Promise<WorkerConverter> | undefined;
let conversionQueue: Promise<unknown> = Promise.resolve();
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function getConverter(): Promise<WorkerConverter> {
	converterPromise ??= import('@matbee/libreoffice-converter/server')
		.then((module) => module.createWorkerConverter())
		.catch((error) => {
			converterPromise = undefined;
			throw error;
		});
	return converterPromise;
}

async function destroyConverter(): Promise<void> {
	const pending = converterPromise;
	converterPromise = undefined;
	if (idleTimer) {
		clearTimeout(idleTimer);
		idleTimer = undefined;
	}
	if (!pending) return;
	try {
		await withTimeout(
			pending.then((converter) => converter.destroy()),
			TEARDOWN_TIMEOUT_MS,
			'Teardown timed out.'
		);
	} catch (error) {
		log.warn('Office converter teardown failed', {}, error);
	}
}

function scheduleIdleTeardown(): void {
	if (idleTimer) clearTimeout(idleTimer);
	idleTimer = setTimeout(() => {
		idleTimer = undefined;
		void destroyConverter();
	}, IDLE_TEARDOWN_MS);
	idleTimer.unref?.();
}

export function convertOfficeToPdf(
	buffer: Buffer,
	inputFormat: OfficeInputFormat
): Promise<Buffer> {
	const task = conversionQueue.then(async () => {
		const started = Date.now();
		log.debug('Converting office document to PDF', { bytes: buffer.length, inputFormat });
		try {
			const converter = await getConverter();
			const result = await withTimeout(
				converter.convert(buffer, { outputFormat: 'pdf', inputFormat }),
				CONVERSION_TIMEOUT_MS,
				'Conversion timed out.'
			);
			scheduleIdleTeardown();
			log.info('Office document converted to PDF', {
				durationMs: Date.now() - started,
				inputFormat
			});
			return Buffer.from(result.data);
		} catch (error) {
			log.error('Office conversion failed', { inputFormat }, error);
			await destroyConverter();
			throw new Error(
				'Could not convert this file to PDF. It may be corrupt or password-protected.'
			);
		}
	});
	conversionQueue = task.catch(() => undefined);
	return task;
}
