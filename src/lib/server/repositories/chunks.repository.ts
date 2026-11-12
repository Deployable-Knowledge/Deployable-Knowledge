import { and, asc, count, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { databaseClient, db } from '#lib/server/database/database';
import {
	documentChunks,
	documents,
	type Document,
	type DocumentChunk,
	type NewDocumentChunk
} from '#lib/server/database/schema';

const INSERT_BATCH_SIZE = 100;

export type ChunkWriter = Pick<typeof db, 'insert'>;

export type ChunkWindowChunk = {
	chunkId: string;
	position: number;
	pageIndex: number;
	chunkIndex: number;
	chunkType: DocumentChunk['chunkType'];
	content: string;
};

export type ChunkWindow = {
	document: { id: string; title: string; sourceType: Document['sourceType'] };
	totalChunks: number;
	start: number;
	end: number;
	chunks: ChunkWindowChunk[];
};

export type ExportChunk = Pick<
	DocumentChunk,
	| 'id'
	| 'chunkIndex'
	| 'pageIndex'
	| 'chunkType'
	| 'content'
	| 'startMs'
	| 'endMs'
	| 'speaker'
	| 'embedding'
	| 'embeddingModel'
>;

export type EmbeddingSummary = {
	documentId: string;
	minBytes: number;
	maxBytes: number;
};

export class ChunksRepository {
	static async insertBatched(
		writer: ChunkWriter,
		rows: NewDocumentChunk[],
		onBatch?: (inserted: number) => void
	): Promise<void> {
		for (let index = 0; index < rows.length; index += INSERT_BATCH_SIZE) {
			await writer.insert(documentChunks).values(rows.slice(index, index + INSERT_BATCH_SIZE));
			onBatch?.(Math.min(index + INSERT_BATCH_SIZE, rows.length));
		}
	}

	static forExport(documentId: string): Promise<ExportChunk[]> {
		return db
			.select({
				id: documentChunks.id,
				chunkIndex: documentChunks.chunkIndex,
				pageIndex: documentChunks.pageIndex,
				chunkType: documentChunks.chunkType,
				content: documentChunks.content,
				startMs: documentChunks.startMs,
				endMs: documentChunks.endMs,
				speaker: documentChunks.speaker,
				embedding: documentChunks.embedding,
				embeddingModel: documentChunks.embeddingModel
			})
			.from(documentChunks)
			.where(eq(documentChunks.documentId, documentId))
			.orderBy(asc(documentChunks.pageIndex), asc(documentChunks.chunkIndex));
	}

	static embeddingSummary(
		documentIds: string[],
		embeddingModel: string
	): Promise<EmbeddingSummary[]> {
		return db
			.select({
				documentId: documentChunks.documentId,
				minBytes: sql<number>`min(length(${documentChunks.embedding}))`,
				maxBytes: sql<number>`max(length(${documentChunks.embedding}))`
			})
			.from(documentChunks)
			.where(
				and(
					inArray(documentChunks.documentId, documentIds),
					eq(documentChunks.embeddingModel, embeddingModel),
					isNotNull(documentChunks.embedding)
				)
			)
			.groupBy(documentChunks.documentId);
	}

	static async window(
		documentId: string,
		start: number,
		maxCount: number,
		includeLocalOnly: boolean
	): Promise<ChunkWindow | null> {
		const document = await db
			.select({
				id: documents.id,
				title: documents.title,
				sourceType: documents.sourceType
			})
			.from(documents)
			.where(
				and(
					eq(documents.id, documentId),
					eq(documents.active, true),
					includeLocalOnly ? undefined : eq(documents.localOnly, false)
				)
			)
			.get();

		if (!document) return null;

		const totals = await db
			.select({ total: count() })
			.from(documentChunks)
			.where(eq(documentChunks.documentId, documentId))
			.get();
		const totalChunks = totals?.total ?? 0;

		if (totalChunks === 0) {
			return { document, totalChunks: 0, start: 0, end: 0, chunks: [] };
		}

		const clampedStart = Math.min(Math.max(1, Math.floor(start)), totalChunks);
		const clampedEnd = Math.min(clampedStart + Math.max(1, Math.floor(maxCount)) - 1, totalChunks);

		const result = await databaseClient.execute({
			sql: `SELECT chunkId, position, pageIndex, chunkIndex, chunkType, content FROM (
					SELECT
						dc.id AS chunkId,
						dc.page_index AS pageIndex,
						dc.chunk_index AS chunkIndex,
						dc.chunk_type AS chunkType,
						dc.content AS content,
						ROW_NUMBER() OVER (ORDER BY dc.page_index, dc.chunk_index) AS position
					FROM document_chunks dc
					WHERE dc.document_id = ?
				)
				WHERE position BETWEEN ? AND ?
				ORDER BY position`,
			args: [documentId, clampedStart, clampedEnd]
		});

		const chunks = result.rows.map((row) => ({
			chunkId: String(row.chunkId),
			position: Number(row.position),
			pageIndex: Number(row.pageIndex),
			chunkIndex: Number(row.chunkIndex),
			chunkType: String(row.chunkType) as DocumentChunk['chunkType'],
			content: String(row.content)
		}));

		return { document, totalChunks, start: clampedStart, end: clampedEnd, chunks };
	}
}
