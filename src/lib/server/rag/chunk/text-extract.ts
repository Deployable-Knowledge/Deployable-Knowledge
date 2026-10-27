import { readFile } from 'node:fs/promises';
import { setImmediate as yieldEventLoop } from 'node:timers/promises';
import { PDFParse, type TableArray } from 'pdf-parse';
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import { createLogger } from '#lib/server/logging';
import { TimeoutError, withTimeout } from '#lib/server/utils/with-timeout';
import { installOcrData, OCR_DATA_DIR } from './ocr-data.ts';
import { extractPageImages, type PageImage, type PdfDocument } from './page-images.ts';
import {
	normalizeWhitespace,
	type ExtractedChunk as Chunk,
	type ExtractionResult,
	type Source
} from './parse-shared.ts';

const MIN_OCR_CONFIDENCE = 80;
const MIN_OCR_ONLY_CONFIDENCE = 50;
const MAX_OCR_PIXELS = 50_000_000;
const OCR_IMAGE_TIMEOUT_MS = 120_000;
const OCR_STARTUP_TIMEOUT_MS = 60_000;
const PAGE_IMAGE_TIMEOUT_MS = 60_000;
const TABLE_DETECTION_TIMEOUT_MS = 120_000;
const PARSER_TEARDOWN_TIMEOUT_MS = 10_000;
const MAX_OCR_FAILURES = 3;

const ocrLog = createLogger('ocr');
const pdfLog = createLogger('documents');

function tableToText(table: TableArray): string {
	return table
		.map((row) => row.map(normalizeWhitespace).filter(Boolean).join(' | '))
		.filter(Boolean)
		.join('\n');
}

type PdfSession = {
	data: Buffer;
	parser: PDFParse;
};

function documentOf(parser: PDFParse): PdfDocument {
	const document = (parser as unknown as { doc?: PdfDocument }).doc;
	if (!document) throw new Error('The PDF document was not loaded.');
	return document;
}

async function replaceParser(session: PdfSession): Promise<void> {
	const stalled = session.parser;
	session.parser = new PDFParse({ data: session.data });
	await withTimeout(
		stalled.destroy(),
		PARSER_TEARDOWN_TIMEOUT_MS,
		'Parser teardown timed out.'
	).catch((error: unknown) => pdfLog.warn('Replaced PDF parser failed to tear down', {}, error));
}

type OcrSession = {
	worker: Worker;
	exited: Promise<never>;
};

async function createOcrSession(): Promise<OcrSession> {
	await installOcrData();

	const creation = createWorker('eng', OEM.LSTM_ONLY, {
		cacheMethod: 'readOnly',
		cachePath: OCR_DATA_DIR,
		gzip: false,
		langPath: OCR_DATA_DIR,
		errorHandler: (error: unknown) => ocrLog.error('OCR worker error', {}, error)
	}).then(async (worker) => {
		await worker.setParameters({
			tessedit_pageseg_mode: PSM.AUTO,
			user_defined_dpi: '300',
			debug_file: '/dev/null'
		});
		return worker;
	});

	let worker: Worker;
	try {
		worker = await withTimeout(creation, OCR_STARTUP_TIMEOUT_MS, 'OCR worker startup timed out.');
	} catch (error) {
		void creation.then((late) => late.terminate()).catch(() => undefined);
		throw error;
	}

	const thread = (worker as unknown as { worker?: NodeJS.EventEmitter }).worker;
	const exited = new Promise<never>((_, reject) => {
		thread?.once?.('exit', (code: unknown) => {
			reject(new Error(`OCR worker exited unexpectedly (code ${String(code)}).`));
		});
	});
	exited.catch(() => undefined);
	thread?.on('error', (error: unknown) => ocrLog.error('OCR worker thread crashed', {}, error));

	return { worker, exited };
}

function recognizeImage(session: OcrSession, image: PageImage) {
	return withTimeout(
		Promise.race([session.worker.recognize(image.data), session.exited]),
		OCR_IMAGE_TIMEOUT_MS,
		`OCR timed out after ${OCR_IMAGE_TIMEOUT_MS / 1000}s.`
	);
}

async function ocrEmbeddedImages(
	document: PdfDocument,
	pageCount: number,
	pagesWithText: ReadonlySet<number>,
	onPageProgress?: (current: number, total: number) => void
): Promise<Map<number, string[]>> {
	const textByPage = new Map<number, string[]>();
	let session: OcrSession | undefined;
	let failures = 0;

	try {
		for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
			const images = await getPageImages(document, pageNumber);
			const minConfidence = pagesWithText.has(pageNumber)
				? MIN_OCR_CONFIDENCE
				: MIN_OCR_ONLY_CONFIDENCE;

			if (images.length > 0) {
				const sizes = images.map((image) => `${image.name} ${image.width}x${image.height}`);
				ocrLog.debug('Found page images', {
					images: sizes.join(', '),
					page: pageNumber,
					pageCount
				});
			}

			for (const image of images) {
				const imageFields = {
					height: image.height,
					image: image.name,
					page: pageNumber,
					width: image.width
				};
				if (image.width * image.height > MAX_OCR_PIXELS) {
					ocrLog.warn('Skipped an image too large to OCR', imageFields);
					continue;
				}

				try {
					session ??= await createOcrSession();

					const recognizeStarted = Date.now();
					const result = await recognizeImage(session, image);
					const text = normalizeWhitespace(result.data.text);
					const confidence = result.data.confidence;
					failures = 0;

					const durationMs = Date.now() - recognizeStarted;
					if (durationMs > 15_000) {
						ocrLog.info('Slow OCR image', {
							...imageFields,
							confidence: Math.round(confidence),
							durationMs
						});
					}

					if (text && confidence >= minConfidence) {
						textByPage.set(pageNumber, [...(textByPage.get(pageNumber) ?? []), text]);
					} else if (text) {
						ocrLog.debug('Discarded low-confidence OCR text', {
							...imageFields,
							confidence: Math.round(confidence)
						});
					}
				} catch (error) {
					failures += 1;
					ocrLog.warn(
						'OCR image failed; replacing the worker',
						{ ...imageFields, failures, maxFailures: MAX_OCR_FAILURES },
						error
					);
					await session?.worker.terminate().catch(() => undefined);
					session = undefined;

					if (failures >= MAX_OCR_FAILURES) {
						ocrLog.error('OCR stopped after repeated failures; continuing without image text', {
							failures
						});
						return textByPage;
					}
				}
			}

			onPageProgress?.(pageNumber, pageCount);
			await yieldEventLoop();
		}
	} finally {
		await session?.worker.terminate().catch(() => undefined);
	}

	return textByPage;
}

async function getPageImages(document: PdfDocument, pageNumber: number): Promise<PageImage[]> {
	try {
		return await withTimeout(
			extractPageImages(document, pageNumber),
			PAGE_IMAGE_TIMEOUT_MS,
			`Image extraction timed out after ${PAGE_IMAGE_TIMEOUT_MS / 1000}s.`
		);
	} catch (error) {
		ocrLog.warn('Page image extraction failed', { page: pageNumber }, error);
		return [];
	}
}

async function getPageTables(pdf: PdfSession, pageNumber: number): Promise<TableArray[]> {
	try {
		const result = await withTimeout(
			pdf.parser.getTable({ partial: [pageNumber] }),
			TABLE_DETECTION_TIMEOUT_MS,
			`Table detection timed out after ${TABLE_DETECTION_TIMEOUT_MS / 1000}s.`
		);
		return result.pages[0]?.tables ?? [];
	} catch (error) {
		if (error instanceof TimeoutError) {
			pdfLog.warn('Table detection stalled; replacing the parser', { page: pageNumber });
			await replaceParser(pdf);
		} else {
			pdfLog.warn('Table detection failed', { page: pageNumber }, error);
		}
		return [];
	}
}

async function collectTables(
	pdf: PdfSession,
	pageCount: number
): Promise<Map<number, TableArray[]>> {
	const tablesByPage = new Map<number, TableArray[]>();
	for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
		const tables = await getPageTables(pdf, pageNumber);
		if (tables.length > 0) tablesByPage.set(pageNumber, tables);
		await yieldEventLoop();
	}
	return tablesByPage;
}

export async function extractText(
	file: Source,
	onPageProgress?: (current: number, total: number) => void
): Promise<ExtractionResult> {
	const data = await readFile(file.path);
	const pdf: PdfSession = { data, parser: new PDFParse({ data }) };

	try {
		const textStarted = Date.now();
		const textResult = await pdf.parser.getText();

		const pagesWithText = new Set<number>();
		for (let pageNumber = 1; pageNumber <= textResult.total; pageNumber += 1) {
			if (normalizeWhitespace(textResult.getPageText(pageNumber))) {
				pagesWithText.add(pageNumber);
			}
		}
		pdfLog.debug('Extracted native PDF text', {
			document: file.title,
			durationMs: Date.now() - textStarted,
			pages: textResult.total,
			pagesWithText: pagesWithText.size
		});

		const ocrStarted = Date.now();
		const ocrTextByPage = await ocrEmbeddedImages(
			documentOf(pdf.parser),
			textResult.total,
			pagesWithText,
			onPageProgress
		);
		ocrLog.debug('OCR pass finished', {
			document: file.title,
			durationMs: Date.now() - ocrStarted,
			pagesWithText: ocrTextByPage.size
		});

		const tableStarted = Date.now();
		const tablesByPage = await collectTables(pdf, textResult.total);
		const tableCount = [...tablesByPage.values()].reduce((sum, tables) => sum + tables.length, 0);
		pdfLog.debug('PDF table detection finished', {
			document: file.title,
			durationMs: Date.now() - tableStarted,
			tables: tableCount
		});

		const chunks: Chunk[] = [];

		for (let pageNumber = 1; pageNumber <= textResult.total; pageNumber += 1) {
			const pageIndex = pageNumber - 1;
			const nativeText = normalizeWhitespace(textResult.getPageText(pageNumber));

			if (nativeText) {
				chunks.push({ chunkType: 'TEXT', source: file, pageIndex, content: nativeText });
			}

			for (const content of ocrTextByPage.get(pageNumber) ?? []) {
				chunks.push({ chunkType: 'IMAGE', source: file, pageIndex, content });
			}

			for (const table of tablesByPage.get(pageNumber) ?? []) {
				const content = tableToText(table);

				if (content) {
					chunks.push({ chunkType: 'TABLE', source: file, pageIndex, content });
				}
			}
		}

		return { chunks, pageCount: textResult.total };
	} finally {
		await pdf.parser.destroy();
	}
}
