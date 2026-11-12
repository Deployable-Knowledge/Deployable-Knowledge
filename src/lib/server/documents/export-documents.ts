import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { makeZip } from 'client-zip';
import packageMetadata from '../../../../package.json';
import { createLogger } from '#lib/server/logging';
import { getActiveEmbedding } from '#lib/server/rag/embedding-model';
import { ChunksRepository, DocumentsRepository } from '#lib/server/repositories';
import type { EmbeddingSummary, ExportChunk } from '#lib/server/repositories/chunks.repository';
import type { DocumentExportRecord } from '#lib/server/repositories/documents.repository';
import { filenameSlug } from '#lib/server/utils/filename';
import {
	encodeNpy,
	FLOAT32_BYTES,
	PACKAGE_FILES,
	PACKAGE_FORMAT,
	PACKAGE_FORMAT_VERSION,
	type PackageChunk,
	type PackageDocument,
	type PackageEmbedding,
	type PackageManifest,
	type PackageManifestDocument
} from './document-package';

const MISSING_TITLES_SHOWN = 5;

const log = createLogger('documents');

export class DocumentExportError extends Error {
	constructor(
		message: string,
		public readonly status: number
	) {
		super(message);
		this.name = 'DocumentExportError';
	}
}

interface PreparedDocument {
	record: DocumentExportRecord;
	path: string;
	originalFile: string | null;
	hasVectors: boolean;
}

export interface PreparedDocumentExport {
	documents: PreparedDocument[];
	embedding: PackageEmbedding | null;
}

type ZipEntry = { name: string; input: Buffer } | { name: string; input: AsyncIterable<Buffer> };

function jsonEntry(name: string, value: unknown): ZipEntry {
	return { name, input: Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8') };
}

function storedFilePath(record: DocumentExportRecord): string {
	return resolve(process.cwd(), record.sourcePath);
}

function vectorDimensions(model: string, summaries: EmbeddingSummary[]): number {
	const sizes = new Set(summaries.flatMap(({ minBytes, maxBytes }) => [minBytes, maxBytes]));
	const [bytes] = sizes;
	if (sizes.size !== 1 || bytes === 0 || bytes % FLOAT32_BYTES !== 0) {
		throw new Error(`Stored embeddings for ${model} have inconsistent sizes.`);
	}
	return bytes / FLOAT32_BYTES;
}

async function assertStoredFiles(documents: PreparedDocument[]): Promise<void> {
	const readable = await Promise.all(
		documents.map(async ({ record, originalFile }) => {
			if (originalFile === null) return true;
			const stats = await stat(storedFilePath(record)).catch(() => null);
			return stats?.isFile() ?? false;
		})
	);
	const missing = documents
		.filter((_, index) => !readable[index])
		.map(({ record }) => `“${record.title}”`);
	if (!missing.length) return;

	const shown = missing.slice(0, MISSING_TITLES_SHOWN).join(', ');
	const more =
		missing.length > MISSING_TITLES_SHOWN
			? ` and ${missing.length - MISSING_TITLES_SHOWN} more`
			: '';
	throw new DocumentExportError(
		`The stored file is missing or unreadable for ${shown}${more}. Remove or re-add ${missing.length === 1 ? 'it' : 'them'} before exporting.`,
		409
	);
}

export async function prepareDocumentExport(
	documentIds: string[]
): Promise<PreparedDocumentExport> {
	const records = await DocumentsRepository.exportRecords(documentIds);
	if (records.length !== documentIds.length) {
		throw new DocumentExportError(
			'Some of these documents no longer exist. Refresh the library and try again.',
			404
		);
	}

	const { key } = await getActiveEmbedding();
	const summaries = await ChunksRepository.embeddingSummary(documentIds, key);
	const embedded = new Set(summaries.map(({ documentId }) => documentId));
	const width = Math.max(3, String(records.length).length);

	const documents = records.map((record, index) => ({
		record,
		path: `documents/${String(index + 1).padStart(width, '0')}-${filenameSlug(record.title, 'document')}`,
		originalFile:
			record.sourceType === 'YOUTUBE'
				? null
				: `original${extname(record.sourcePath).toLowerCase()}`,
		hasVectors: embedded.has(record.id)
	}));
	await assertStoredFiles(documents);

	return {
		documents,
		embedding: summaries.length
			? { model: key, dimensions: vectorDimensions(key, summaries), dtype: 'float32' }
			: null
	};
}

function encodeChunks(
	chunks: ExportChunk[],
	vectors: PackageEmbedding | null
): { jsonl: Buffer; rows: Buffer[] } {
	const rows: Buffer[] = [];
	const lines = chunks.map(({ embedding, embeddingModel, ...chunk }) => {
		let embeddingRow: number | null = null;
		if (vectors && embedding && embeddingModel === vectors.model) {
			if (embedding.byteLength !== vectors.dimensions * FLOAT32_BYTES) {
				throw new Error(`Chunk ${chunk.id} has an embedding of the wrong size.`);
			}
			embeddingRow = rows.push(embedding) - 1;
		}
		const line: PackageChunk = { ...chunk, embeddingRow };
		return `${JSON.stringify(line)}\n`;
	});
	return { jsonl: Buffer.from(lines.join(''), 'utf8'), rows };
}

async function encodedChunks(
	record: DocumentExportRecord,
	vectors: PackageEmbedding | null
): Promise<{ jsonl: Buffer; rows: Buffer[]; count: number }> {
	try {
		const chunks = await ChunksRepository.forExport(record.id);
		return { ...encodeChunks(chunks, vectors), count: chunks.length };
	} catch (cause) {
		log.error('Could not export a document', { title: record.title }, cause);
		throw cause;
	}
}

function documentFile({ record, originalFile }: PreparedDocument): PackageDocument {
	const youtube = record.sourceType === 'YOUTUBE';
	return {
		id: record.id,
		title: record.title,
		sourceType: record.sourceType,
		origin: record.origin,
		active: record.active,
		localOnly: record.localOnly,
		tags: record.tags,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
		syncedFrom: record.syncedFrom,
		originalFile,
		storedFile: youtube ? null : basename(record.sourcePath),
		sourceUrl: youtube ? record.sourcePath : null
	};
}

async function* packageEntries({
	documents,
	embedding
}: PreparedDocumentExport): AsyncGenerator<ZipEntry> {
	const manifestDocuments: PackageManifestDocument[] = [];

	for (const prepared of documents) {
		const { record, path, originalFile, hasVectors } = prepared;
		yield jsonEntry(`${path}/${PACKAGE_FILES.document}`, documentFile(prepared));
		if (originalFile) {
			const file = createReadStream(storedFilePath(record));
			try {
				yield { name: `${path}/${originalFile}`, input: file };
			} finally {
				file.destroy();
			}
		}

		const vectors = hasVectors ? embedding : null;
		const { jsonl, rows, count } = await encodedChunks(record, vectors);
		yield { name: `${path}/${PACKAGE_FILES.chunks}`, input: jsonl };
		if (vectors) {
			yield {
				name: `${path}/${PACKAGE_FILES.embeddings}`,
				input: encodeNpy(rows, vectors.dimensions)
			};
		}

		manifestDocuments.push({
			id: record.id,
			title: record.title,
			sourceType: record.sourceType,
			path,
			chunkCount: count,
			embeddedChunkCount: rows.length
		});
	}

	const manifest: PackageManifest = {
		format: PACKAGE_FORMAT,
		formatVersion: PACKAGE_FORMAT_VERSION,
		appVersion: packageMetadata.version,
		exportedAt: new Date().toISOString(),
		embedding,
		documents: manifestDocuments
	};
	yield jsonEntry(PACKAGE_FILES.manifest, manifest);
}

export function documentExportStream(prepared: PreparedDocumentExport): ReadableStream<Uint8Array> {
	log.info('Exporting documents', { documents: prepared.documents.length });
	return makeZip(packageEntries(prepared));
}
