import { homedir } from 'node:os';
import type { LogLevel, LogSubsystem } from '#lib/constants/logs';
import type { ApiLogsResponse, LogEntry, LogError, LogFields } from '#lib/types';
import { openLogFile, writeLogEntry, type StoredLogEntry } from './log-file';

type LogMethod = (message: string, fields?: LogFields, cause?: unknown) => void;

export type Logger = Record<LogLevel, LogMethod>;

const MAX_ENTRIES = 1_000;

const PATH_ROOTS = [
	[process.cwd(), '<data>'],
	[homedir(), '~']
].filter(([root]) => root.length > 1);

const CONSOLE_WRITERS: Record<LogLevel, (line: string) => void> = {
	debug: console.debug,
	info: console.info,
	warn: console.warn,
	error: console.error
};

const runId = crypto.randomUUID();
const entries: LogEntry[] = [];
let latestId = 0;
let initialized = false;

export function createLogger(subsystem: LogSubsystem): Logger {
	const method =
		(level: LogLevel): LogMethod =>
		(message, fields = {}, cause) =>
			record({ fields, level, message, subsystem, time: new Date().toISOString() }, cause);

	return {
		debug: method('debug'),
		info: method('info'),
		warn: method('warn'),
		error: method('error')
	};
}

const log = createLogger('application');

export async function initializeLogging(): Promise<void> {
	if (initialized) return;
	initialized = true;

	const history = await openLogFile(MAX_ENTRIES);
	const current = entries.splice(0);
	latestId = 0;
	for (const entry of [...history.entries, ...current]) remember(entry);

	if (history.malformedLines > 0) {
		log.warn('Skipped malformed lines in the log file', { lines: history.malformedLines });
	}
}

export function readLogs(afterId = 0): ApiLogsResponse {
	return {
		entries: entries.filter((entry) => entry.id > afterId),
		latestId,
		runId
	};
}

export function formatLogLine(entry: StoredLogEntry): string {
	const fields = Object.entries(entry.fields).map(([key, value]) => `${key}=${String(value)}`);
	const error = entry.error ? [`(${entry.error.name}: ${entry.error.message})`] : [];

	return [
		entry.time,
		entry.level.toUpperCase().padEnd(5),
		entry.subsystem.padEnd(11),
		entry.message,
		...fields,
		...error
	].join(' ');
}

function record(base: StoredLogEntry, cause: unknown): void {
	const entry = cause === undefined ? base : { ...base, error: serializeError(cause) };
	remember(entry);
	writeLogEntry(entry);

	const line = formatLogLine(entry);
	const stack = cause instanceof Error ? cause.stack : undefined;
	CONSOLE_WRITERS[entry.level](stack ? `${line}\n${stack}` : line);
}

function remember(entry: StoredLogEntry): void {
	latestId += 1;
	entries.push({ ...entry, id: latestId });
	if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
}

function serializeError(cause: unknown): LogError {
	const scrub = (text: string) =>
		PATH_ROOTS.reduce((result, [root, label]) => result.replaceAll(root, label), text);

	if (cause instanceof Error) return { message: scrub(cause.message), name: cause.name };
	return { message: scrub(String(cause)), name: 'Error' };
}
