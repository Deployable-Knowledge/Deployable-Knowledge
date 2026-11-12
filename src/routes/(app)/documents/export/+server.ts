import { error } from '@sveltejs/kit';
import {
	DocumentExportError,
	documentExportStream,
	prepareDocumentExport
} from '#lib/server/documents/export-documents';
import { filenameSlug } from '#lib/server/utils/filename';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as {
		documentIds?: unknown;
		name?: unknown;
	} | null;
	const documentIds = body?.documentIds;
	if (
		!Array.isArray(documentIds) ||
		documentIds.length === 0 ||
		!documentIds.every((id) => typeof id === 'string')
	) {
		throw error(400, 'Choose at least one document to export.');
	}
	const name = body?.name ?? '';
	if (typeof name !== 'string') throw error(400, 'The export name must be text.');

	try {
		const prepared = await prepareDocumentExport([...new Set(documentIds)]);
		return new Response(documentExportStream(prepared), {
			headers: {
				'Cache-Control': 'no-store',
				'Content-Disposition': `attachment; filename="${filenameSlug(name, 'documents')}.zip"`,
				'Content-Type': 'application/zip'
			}
		});
	} catch (cause) {
		if (cause instanceof DocumentExportError) throw error(cause.status, cause.message);
		throw cause;
	}
};
