import type { RequestHandler } from '@sveltejs/kit';
import type { ApiDocumentLocalOnlyRequest } from '#lib/types';
import { refreshStaleEmbeddings } from '#lib/server/rag/embedding';
import { DocumentsRepository } from '#lib/server/repositories';

export const PATCH: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as ApiDocumentLocalOnlyRequest;

	if (typeof body.localOnly !== 'boolean') {
		return Response.json({ error: 'localOnly must be a boolean.' }, { status: 400 });
	}
	if (!Array.isArray(body.documentIds) || body.documentIds.length === 0) {
		return Response.json({ error: 'Provide at least one document.' }, { status: 400 });
	}

	await DocumentsRepository.setLocalOnly([...new Set(body.documentIds)], body.localOnly);
	if (!body.localOnly) refreshStaleEmbeddings();

	return Response.json({ ok: true });
};
