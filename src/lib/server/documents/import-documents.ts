import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { ApiDocumentImportResult, ApiDocumentIngestProgress } from '#lib/types';
import type { NewDocumentChunk } from '#lib/server/database/schema';
import { createLogger } from '#lib/server/logging';
import {
	documentIdFor,
	embeddingToBuffer,
	refreshStaleEmbeddings
} from '#lib/server/rag/embedding';
import { putChunkVectors } from '#lib/server/rag/search/vector-index';
import type { VectorIndexRow } from '#lib/server/rag/search/vector-store';
import { DocumentsRepository, SyncedFoldersRepository } from '#lib/server/repositories';
import type { SyncedFromFolder } from '#lib/server/repositories/documents.repository';
import { ZipArchive } from '#lib/server/utils/zip-archive';
import { DOCUMENT_TAG_PATTERN, parseYoutubeVideoId, watchUrl } from '#lib/utils';
import {
	decodeNpy,
	npyRow,
	PACKAGE_FILES,
	PackageFormatError,
	parseChunks,
	parseDocument,
	parseManifest,
	type NpyMatrix,
	type PackageChunk,
	type PackageDocument,
	type PackageEmbedding,
	type PackageFormatVersion,
	type PackageManifest,
	type PackageManifestDocument
} from './document-package';
import { existingDocument, managedPathForHash } from './ingest-file';
import { writePreviewArtifact } from './managed-artifacts';
import { removeManagedDocumentFile } from './remove-document';
import { handlerForPath, handlerForType } from './source-types';

const IMPORT_LABEL = 'Importing documents';
const STORED_FILE_PATTERN = /^([0-9a-f]{16})(\.[a-z0-9]+)$/;
const CHUNK_ID_PATTERN = /^[0-9a-f]{64}$/;

const log = createLogger('documents');

export interface DocumentPackage {
	manifest: PackageManifest;
	archive: ZipArchive;
	dispose: () => Promise<void>;
}

interface ImportContext {
	archive: ZipArchive;
	version: PackageFormatVersion;
	embedding: PackageEmbedding | null;
	localOnly: boolean;
	folderIdsByName: Map<string, string>;
}

interface ImportTarget {
	sourcePath: string;
	originalFile: string | null;
}

interface PackageVectors {
	model: string;
	matrix: NpyMatrix;
}

async function readJson(archive: ZipArchive, name: string): Promise<unknown> {
	const text = (await archive.read(name)).toString('utf8');
	try {
		return JSON.parse(text);
	} catch {
		throw new PackageFormatError(`${name} is not valid JSON.`);
	}
}

export async function receiveDocumentPackage(
	body: ReadableStream<Uint8Array>
): Promise<DocumentPackage> {
	const directory = await mkdtemp(join(tmpdir(), 'dk-import-'));
	let archive: ZipArchive | null = null;
	const dispose = async () => {
		archive?.close();
		await rm(directory, { recursive: true, force: true });
	};

	try {
		const path = join(directory, 'package.zip');
		await pipeline(body, createWriteStream(path));
		archive = await ZipArchive.open(path).catch((cause: unknown) => {
			throw new PackageFormatError('This file is not a zip archive.', { cause });
		});
		if (!archive.has(PACKAGE_FILES.manifest)) {
			throw new PackageFormatError('This zip is not a document export.');
		}
		const manifest = parseManifest(await readJson(archive, PACKAGE_FILES.manifest));
		return { manifest, archive, dispose };
	} catch (cause) {
		await dispose();
		throw cause;
	}
}

async function storedFileFromContent(
	archive: ZipArchive,
	folder: string,
	originalFile: string | null
): Promise<string> {
	if (!originalFile) throw new PackageFormatError('The document has no stored copy.');
	const hash = await archive.sha256(`${folder}/${originalFile}`);
	return `${hash.slice(0, 16)}${extname(originalFile)}`;
}

async function importTarget(
	archive: ZipArchive,
	folder: string,
	file: PackageDocument
): Promise<ImportTarget> {
	if (file.sourceType === 'YOUTUBE') {
		const videoId = file.sourceUrl === null ? null : parseYoutubeVideoId(file.sourceUrl);
		if (!videoId) throw new PackageFormatError('The YouTube link is missing or invalid.');
		return { sourcePath: watchUrl(videoId), originalFile: null };
	}

	const storedFile =
		file.storedFile ?? (await storedFileFromContent(archive, folder, file.originalFile));
	const [, hash, extension] = storedFile.match(STORED_FILE_PATTERN) ?? [];
	if (!hash || !extension) {
		throw new PackageFormatError(`“${storedFile}” is not a stored file name.`);
	}
	const handler = handlerForType(file.sourceType);
	const extensions: readonly string[] = handler?.convert
		? [handler.convert.extension]
		: (handler?.extensions ?? []);
	if (!extensions.includes(extension)) {
		throw new PackageFormatError(`A ${file.sourceType} document can't be stored as ${extension}.`);
	}
	const originalFile = `original${extension}`;
	if (file.originalFile !== originalFile) {
		throw new PackageFormatError(`The stored copy should be ${originalFile}.`);
	}
	return { sourcePath: managedPathForHash(hash, extension), originalFile };
}

async function folderIdForName(
	name: string,
	folderIdsByName: Map<string, string>
): Promise<string> {
	const known = folderIdsByName.get(name);
	if (known) return known;
	const existing = (await SyncedFoldersRepository.list()).find((folder) => folder.name === name);
	const id = existing?.id ?? randomUUID();
	folderIdsByName.set(name, id);
	return id;
}

async function folderPlacement(
	file: PackageDocument,
	folderIdsByName: Map<string, string>
): Promise<SyncedFromFolder | null> {
	const { syncedFrom } = file;
	if (!syncedFrom) return null;
	if (file.origin !== 'FILE' || file.sourceType === 'YOUTUBE') {
		throw new PackageFormatError('Only added files can belong to a synced folder.');
	}
	const blankId = syncedFrom.folderId !== null && !syncedFrom.folderId.trim();
	if (blankId || !syncedFrom.folderName.trim()) {
		throw new PackageFormatError('The synced folder has no id or name.');
	}
	const segments = syncedFrom.relativePath.split('/');
	if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
		throw new PackageFormatError(`“${syncedFrom.relativePath}” is not a path inside a folder.`);
	}

	return {
		folderId:
			syncedFrom.folderId ?? (await folderIdForName(syncedFrom.folderName, folderIdsByName)),
		folderName: syncedFrom.folderName,
		relativePath: syncedFrom.relativePath,
		lastModified: syncedFrom.lastModified ?? 0,
		size: syncedFrom.size ?? 0
	};
}

function tagNames(file: PackageDocument): string[] {
	const invalid = file.tags.find((tag) => !DOCUMENT_TAG_PATTERN.test(tag));
	if (invalid !== undefined) throw new PackageFormatError(`“${invalid}” is not a valid tag.`);
	return [...new Set(file.tags)];
}

function assertChunkIds(chunks: PackageChunk[], source: string): void {
	const seen = new Set<string>();
	for (const { id } of chunks) {
		if (!CHUNK_ID_PATTERN.test(id)) {
			throw new PackageFormatError(`${source} has an invalid chunk id.`);
		}
		if (seen.has(id)) throw new PackageFormatError(`${source} lists chunk ${id} twice.`);
		seen.add(id);
	}
}

async function readVectors(
	archive: ZipArchive,
	folder: string,
	chunks: PackageChunk[],
	embedding: PackageEmbedding | null
): Promise<PackageVectors | null> {
	const rows = chunks.flatMap(({ embeddingRow }) => (embeddingRow === null ? [] : [embeddingRow]));
	if (!rows.length) return null;
	if (!embedding) {
		throw new PackageFormatError(
			`${folder} has embeddings, but the manifest names no embedding model.`
		);
	}

	const name = `${folder}/${PACKAGE_FILES.embeddings}`;
	const matrix = decodeNpy(await archive.read(name), name);
	if (matrix.dimensions !== embedding.dimensions) {
		throw new PackageFormatError(
			`${name} has ${matrix.dimensions} dimensions, not the ${embedding.dimensions} the manifest names.`
		);
	}
	if (rows.some((row) => row >= matrix.rows)) {
		throw new PackageFormatError(
			`${folder}/${PACKAGE_FILES.chunks} points past the end of ${name}.`
		);
	}
	return { model: embedding.model, matrix };
}

function chunkRows(
	chunks: PackageChunk[],
	documentId: string,
	vectors: PackageVectors | null,
	createdAt: string
): { rows: NewDocumentChunk[]; indexed: VectorIndexRow[] } {
	const indexed: VectorIndexRow[] = [];
	const rows = chunks.map(({ embeddingRow, ...chunk }): NewDocumentChunk => {
		if (!vectors || embeddingRow === null) {
			return { ...chunk, documentId, embedding: null, embeddingModel: null, createdAt };
		}
		const vector = npyRow(vectors.matrix, embeddingRow);
		indexed.push({
			chunkId: chunk.id,
			documentId,
			chunkType: chunk.chunkType,
			key: vectors.model,
			vector
		});
		return {
			...chunk,
			documentId,
			embedding: embeddingToBuffer(vector),
			embeddingModel: vectors.model,
			createdAt
		};
	});
	return { rows, indexed };
}

async function restoreStoredFile(
	archive: ZipArchive,
	name: string,
	managedPath: string
): Promise<void> {
	await mkdir(dirname(managedPath), { recursive: true });
	await archive.extract(name, managedPath);
	const handler = handlerForPath(managedPath);
	if (handler?.preview) {
		await writePreviewArtifact(handler, await readFile(managedPath), managedPath);
	}
}

async function importDocument(
	{ archive, version, embedding, localOnly, folderIdsByName }: ImportContext,
	{ path: folder }: PackageManifestDocument
): Promise<'imported' | 'skipped'> {
	const documentName = `${folder}/${PACKAGE_FILES.document}`;
	const file = parseDocument(await readJson(archive, documentName), documentName, version);
	if (!file.title.trim()) throw new PackageFormatError(`${documentName} has no title.`);
	const target = await importTarget(archive, folder, file);
	const syncedFrom = await folderPlacement(file, folderIdsByName);

	if (await existingDocument(target.sourcePath)) return 'skipped';
	if (
		syncedFrom &&
		(await SyncedFoldersRepository.findFile(syncedFrom.folderId, syncedFrom.relativePath))
	) {
		return 'skipped';
	}

	const chunksName = `${folder}/${PACKAGE_FILES.chunks}`;
	const chunks = parseChunks(await archive.read(chunksName), chunksName);
	if (!chunks.length) throw new PackageFormatError(`${chunksName} has no chunks.`);
	assertChunkIds(chunks, chunksName);
	const vectors = await readVectors(archive, folder, chunks, embedding);
	const tags = tagNames(file);
	const documentId = documentIdFor(target.sourcePath);
	const { rows, indexed } = chunkRows(chunks, documentId, vectors, file.createdAt);

	try {
		if (target.originalFile) {
			await restoreStoredFile(archive, `${folder}/${target.originalFile}`, target.sourcePath);
		}
		await DocumentsRepository.insertDocument({
			document: {
				id: documentId,
				title: file.title,
				sourcePath: target.sourcePath,
				sourceType: file.sourceType,
				origin: file.origin,
				active: file.active,
				localOnly: file.localOnly || localOnly,
				createdAt: file.createdAt,
				updatedAt: file.updatedAt
			},
			tags,
			chunks: rows,
			syncedFrom
		});
	} catch (cause) {
		if (target.originalFile) await removeManagedDocumentFile(target.sourcePath);
		throw cause;
	}

	putChunkVectors(indexed);
	return 'imported';
}

export async function importDocumentPackage(
	{ manifest, archive }: DocumentPackage,
	localOnly: boolean,
	onProgress: (progress: ApiDocumentIngestProgress) => void
): Promise<ApiDocumentImportResult> {
	const result: ApiDocumentImportResult = { imported: 0, skipped: 0, failed: [] };
	const context: ImportContext = {
		archive,
		version: manifest.formatVersion,
		embedding: manifest.embedding,
		localOnly,
		folderIdsByName: new Map()
	};
	const total = manifest.documents.length;
	log.info('Importing documents', { documents: total, model: manifest.embedding?.model ?? null });

	for (const [index, entry] of manifest.documents.entries()) {
		onProgress({
			percent: (index / total) * 100,
			label: IMPORT_LABEL,
			message: `Importing ${index + 1} of ${total}`
		});
		try {
			const outcome = await importDocument(context, entry);
			if (outcome === 'imported') result.imported += 1;
			else result.skipped += 1;
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : String(cause);
			if (cause instanceof PackageFormatError) {
				log.warn('Skipped a damaged document', { title: entry.title, reason: message });
			} else {
				log.error('Could not import a document', { title: entry.title }, cause);
			}
			result.failed.push({ title: entry.title, message });
		}
	}

	if (result.imported) refreshStaleEmbeddings();

	log.info('Document import completed', {
		imported: result.imported,
		skipped: result.skipped,
		failed: result.failed.length
	});
	return result;
}
