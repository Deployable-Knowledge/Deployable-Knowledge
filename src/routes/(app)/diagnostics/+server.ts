import { buildDiagnosticsSnapshot } from '#lib/server/diagnostics';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return Response.json(await buildDiagnosticsSnapshot(), {
		headers: { 'Cache-Control': 'no-store' }
	});
};
