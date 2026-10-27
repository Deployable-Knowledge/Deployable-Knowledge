import type { ApiDiagnosticsSnapshot, LogEntry } from '#lib/types';
import { formatLogLine } from '#lib/server/logging';

export function formatDiagnosticsReport(
	snapshot: ApiDiagnosticsSnapshot,
	entries: LogEntry[]
): string {
	return [
		'Deployable Knowledge Diagnostic Report',
		`Generated: ${snapshot.generatedAt}`,
		'Privacy: logs include document names, synced-folder-relative paths, and error messages with the data and home directories replaced by <data> and ~; document content, prompts, messages, search queries, and credentials are excluded.',
		'',
		'[Application]',
		`Version: ${snapshot.application.version}`,
		`Runtime: ${snapshot.application.runtimeMode}`,
		`Uptime seconds: ${snapshot.application.uptimeSeconds}`,
		`Resident memory bytes: ${snapshot.application.memoryBytes}`,
		'',
		'[Health]',
		`Database: ${snapshot.health.database}`,
		`Search index: ${snapshot.health.searchIndex}`,
		`Embedding model: ${snapshot.health.embeddingModel}`,
		'',
		'[Counts]',
		...Object.entries(snapshot.counts).map(([key, value]) => `${key}: ${value ?? 'unavailable'}`),
		'',
		'[Logs]',
		...entries.map(formatLogLine),
		''
	].join('\n');
}
