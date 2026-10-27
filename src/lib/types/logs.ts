import type { LogLevel, LogSubsystem } from '#lib/constants/logs';

export type LogValue = boolean | number | string | null;

export type LogFields = Record<string, LogValue>;

export interface LogError {
	message: string;
	name: string;
}

export interface LogEntry {
	error?: LogError;
	fields: LogFields;
	id: number;
	level: LogLevel;
	message: string;
	subsystem: LogSubsystem;
	time: string;
}

export interface ApiLogsResponse {
	entries: LogEntry[];
	latestId: number;
	runId: string;
}
