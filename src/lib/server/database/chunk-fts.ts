import { setImmediate as yieldEventLoop } from 'node:timers/promises';
import { createLogger } from '#lib/server/logging';
import { databaseClient } from './database';

const BACKFILL_BATCH_SIZE = 5000;

const log = createLogger('search');

const SCHEMA_STATEMENTS = [
	`CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(
		content,
		content='document_chunks',
		tokenize='porter unicode61'
	)`,
	`CREATE TRIGGER IF NOT EXISTS chunk_fts_after_insert AFTER INSERT ON document_chunks BEGIN
		INSERT INTO chunk_fts(rowid, content) VALUES (new.rowid, new.content);
	END`,
	`CREATE TRIGGER IF NOT EXISTS chunk_fts_after_delete AFTER DELETE ON document_chunks BEGIN
		INSERT INTO chunk_fts(chunk_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
	END`,
	`CREATE TRIGGER IF NOT EXISTS chunk_fts_after_update AFTER UPDATE OF content ON document_chunks BEGIN
		INSERT INTO chunk_fts(chunk_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
		INSERT INTO chunk_fts(rowid, content) VALUES (new.rowid, new.content);
	END`
];

let readyPromise: Promise<void> | undefined;

export function ensureChunkFts(): Promise<void> {
	readyPromise ??= initialize().catch((error) => {
		readyPromise = undefined;
		throw error;
	});
	return readyPromise;
}

async function initialize(): Promise<void> {
	for (const statement of SCHEMA_STATEMENTS) {
		await databaseClient.execute(statement);
	}

	const counts = await databaseClient.execute(`
		SELECT
			(SELECT count(*) FROM chunk_fts_docsize) AS indexed,
			(SELECT count(*) FROM document_chunks) AS stored
	`);
	const { indexed, stored } = counts.rows[0] as unknown as { indexed: number; stored: number };
	if (indexed === stored) return;

	log.info('Rebuilding search index', { indexedChunks: indexed, storedChunks: stored });
	const started = Date.now();
	await databaseClient.execute(`INSERT INTO chunk_fts(chunk_fts) VALUES ('delete-all')`);

	let lastRowid = 0;
	for (;;) {
		const batch = await databaseClient.execute({
			sql: `SELECT max(rowid) AS upper, count(*) AS size FROM (
				SELECT rowid FROM document_chunks WHERE rowid > ? ORDER BY rowid LIMIT ?
			)`,
			args: [lastRowid, BACKFILL_BATCH_SIZE]
		});
		const { upper, size } = batch.rows[0] as unknown as { upper: number | null; size: number };
		if (!size || upper === null) break;

		await databaseClient.execute({
			sql: `INSERT INTO chunk_fts(rowid, content)
				SELECT rowid, content FROM document_chunks WHERE rowid > ? AND rowid <= ?`,
			args: [lastRowid, upper]
		});
		lastRowid = upper;
		await yieldEventLoop();
	}

	log.info('Search index rebuilt', {
		durationMs: Date.now() - started,
		indexedChunks: stored
	});
}
