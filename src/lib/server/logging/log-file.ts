import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir, readFile, rename, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { LOG_LEVELS, LOG_SUBSYSTEMS } from '#lib/constants/logs';
import type { LogEntry, LogError, LogFields } from '#lib/types';

export type StoredLogEntry = Omit<LogEntry, 'id'>;

export interface LogFileHistory {
	entries: StoredLogEntry[];
	malformedLines: number;
}

const LOG_DIRECTORY = resolve(process.cwd(), 'logs');
const LOG_FILE = join(LOG_DIRECTORY, 'app.jsonl');
const ROTATED_LOG_FILE = join(LOG_DIRECTORY, 'app.1.jsonl');
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PENDING_LINES = 1_000;

const levels: readonly string[] = LOG_LEVELS;
const subsystems: readonly string[] = LOG_SUBSYSTEMS;

let stream: WriteStream | null = null;
let pending: string[] = [];
let bytesWritten = 0;
let disabled = false;

export async function openLogFile(historyLimit: number): Promise<LogFileHistory> {
	try {
		await mkdir(LOG_DIRECTORY, { recursive: true });
		const contents = await readFile(LOG_FILE, 'utf8').catch((error: NodeJS.ErrnoException) => {
			if (error.code === 'ENOENT') return '';
			throw error;
		});
		bytesWritten = (await stat(LOG_FILE).catch(() => null))?.size ?? 0;
		if (bytesWritten >= MAX_FILE_BYTES) await rotateClosedFile();
		openStream();
		return readHistory(contents, historyLimit);
	} catch (error) {
		disableLogFile(error);
		return { entries: [], malformedLines: 0 };
	}
}

export function writeLogEntry(entry: StoredLogEntry): void {
	if (disabled) return;

	const line = `${JSON.stringify(entry)}\n`;
	if (!stream) {
		pending.push(line);
		if (pending.length > MAX_PENDING_LINES) pending.shift();
		return;
	}

	stream.write(line);
	bytesWritten += Buffer.byteLength(line);
	if (bytesWritten >= MAX_FILE_BYTES) void rotateOpenFile();
}

function openStream(): void {
	const next = createWriteStream(LOG_FILE, { flags: 'a' });
	next.on('error', disableLogFile);
	stream = next;

	const queued = pending;
	pending = [];
	for (const line of queued) {
		next.write(line);
		bytesWritten += Buffer.byteLength(line);
	}
}

async function rotateOpenFile(): Promise<void> {
	const current = stream;
	if (!current) return;

	stream = null;
	await new Promise<void>((done) => current.end(done));
	try {
		await rotateClosedFile();
		openStream();
	} catch (error) {
		disableLogFile(error);
	}
}

async function rotateClosedFile(): Promise<void> {
	await rename(LOG_FILE, ROTATED_LOG_FILE);
	bytesWritten = 0;
}

function disableLogFile(error: unknown): void {
	if (disabled) return;
	disabled = true;
	stream = null;
	pending = [];
	console.error('[Logging] Writing logs/app.jsonl failed; file logging is off.', error);
}

function readHistory(contents: string, limit: number): LogFileHistory {
	const entries: StoredLogEntry[] = [];
	let malformedLines = 0;

	for (const line of contents.split('\n').filter(Boolean).slice(-limit)) {
		const entry = parseStoredEntry(line);
		if (entry) entries.push(entry);
		else malformedLines += 1;
	}

	return { entries, malformedLines };
}

function parseStoredEntry(line: string): StoredLogEntry | null {
	let value: unknown;
	try {
		value = JSON.parse(line);
	} catch {
		return null;
	}

	if (!isRecord(value)) return null;
	const { error, fields, level, message, subsystem, time } = value;
	if (
		typeof time !== 'string' ||
		typeof message !== 'string' ||
		typeof level !== 'string' ||
		!levels.includes(level) ||
		typeof subsystem !== 'string' ||
		!subsystems.includes(subsystem) ||
		!isLogFields(fields) ||
		(error !== undefined && !isLogError(error))
	) {
		return null;
	}

	return {
		...(error ? { error } : {}),
		fields,
		level: level as StoredLogEntry['level'],
		message,
		subsystem: subsystem as StoredLogEntry['subsystem'],
		time
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLogFields(value: unknown): value is LogFields {
	return (
		isRecord(value) &&
		Object.values(value).every(
			(field) =>
				field === null ||
				typeof field === 'boolean' ||
				typeof field === 'number' ||
				typeof field === 'string'
		)
	);
}

function isLogError(value: unknown): value is LogError {
	return isRecord(value) && typeof value.name === 'string' && typeof value.message === 'string';
}
