import { buildDiagnosticsSnapshot, formatDiagnosticsReport } from '#lib/server/diagnostics';
import { readLogs } from '#lib/server/logging';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const snapshot = await buildDiagnosticsSnapshot();
	const { entries } = readLogs();

	return new Response(formatDiagnosticsReport(snapshot, entries), {
		headers: {
			'Cache-Control': 'no-store',
			'Content-Disposition': 'attachment; filename="deployable-knowledge-diagnostics.txt"',
			'Content-Type': 'text/plain; charset=utf-8',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
