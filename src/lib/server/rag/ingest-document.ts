import { basename } from 'node:path';
import type { ApiDocumentIngestProgress, Document } from '#lib/types';
import { createLogger } from '#lib/server/logging';
import { handlerForPath, handlerForType } from '#lib/server/documents/source-types';
import { chunkPages } from '#lib/server/rag/chunk/chunker';
import { assembleChunks } from '#lib/server/rag/chunk/assemble-chunks';
import type { Source } from '#lib/server/rag/chunk/parse-shared';
import { storeDocumentChunks } from './embedding';

const log = createLogger('documents');

export type IngestDocumentInput = {
	fileName?: string;
	filePath: string;
	title?: string;
	sourceType?: Document['sourceType'];
	localOnly?: boolean;
};

export type IngestDocumentResult = {
	documentId: string;
	title: string;
	sourcePath: string;
	pageCount: number;
	chunkCount: number;
};

export async function ingestDocument(
	{ fileName, filePath, title, sourceType, localOnly = false }: IngestDocumentInput,
	onProgress?: (progress: ApiDocumentIngestProgress) => void
): Promise<IngestDocumentResult> {
	const handler = handlerForPath(filePath) ?? (sourceType ? handlerForType(sourceType) : null);
	if (!handler?.extract) throw new Error('Unsupported document type.');
	const extract = handler.extract;
	const identity = handlerForType(sourceType ?? handler.type) ?? handler;

	const report = (percent: number, message: string) => {
		onProgress?.({ percent, label: identity.progressLabel, message });
	};

	const source: Source = {
		title: title?.trim() || basename(filePath),
		type: sourceType ?? handler.type,
		path: filePath
	};

	const logFields = { fileName: fileName?.trim() || source.title, sourceType: source.type };

	report(0, handler.startMessage);

	log.info('Ingesting document', logFields);
	const started = Date.now();
	const extraction = await extract(source, (ratio, message) => report(ratio * 50, message));

	const rawChunks = chunkPages(extraction.chunks);
	const assembled = assembleChunks(extraction.chunks, rawChunks);
	const chunks = handler.finalize?.(assembled, extraction) ?? assembled;

	if (chunks.length === 0) throw new Error(identity.emptyResultMessage);
	const shouldEmbed = source.type !== 'CSV';
	const action = shouldEmbed ? 'Embedding' : 'Indexing';

	log.debug(`Extracted document; ${action.toLowerCase()} chunks`, {
		...logFields,
		chunks: chunks.length,
		pageCount: extraction.pageCount
	});
	report(50, `${action} 0 of ${chunks.length} chunks`);

	let lastMilestone = 0;
	const stored = await storeDocumentChunks(chunks, localOnly, ({ stage, current, total }) => {
		if (stage !== (shouldEmbed ? 'embedding' : 'storing')) return;
		const ratio = total > 0 ? current / total : 1;
		const milestone = Math.floor(ratio * 4);
		if (milestone > lastMilestone && milestone < 4) {
			lastMilestone = milestone;
			log.debug(`${action} chunks`, { ...logFields, current, total });
		}
		report(50 + ratio * 50, `${action} ${current} of ${total} chunks`);
	});

	log.info('Document ingestion completed', {
		...logFields,
		chunkCount: stored.chunkCount,
		durationMs: Date.now() - started,
		pageCount: extraction.pageCount
	});

	return {
		documentId: stored.documentId,
		title: source.title,
		sourcePath: source.path,
		pageCount: extraction.pageCount,
		chunkCount: stored.chunkCount
	};
}
