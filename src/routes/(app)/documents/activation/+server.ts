import type { RequestHandler } from '@sveltejs/kit';
import type { ApiDocumentActivationRequest } from '#lib/types';
import { DocumentsRepository } from '#lib/server/repositories';

export const PATCH: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as ApiDocumentActivationRequest;

	if (typeof body.active !== 'boolean') {
		return Response.json({ error: 'active must be a boolean.' }, { status: 400 });
	}

	const documentIds = body.documentIds && [...new Set(body.documentIds)];
	if (documentIds?.length === 0 || body.tags?.length === 0) {
		return Response.json(
			{
				error: 'Provide at least one document or tag, or omit both to update every document.'
			},
			{ status: 400 }
		);
	}

	await DocumentsRepository.setActive({ active: body.active, documentIds, tags: body.tags });

	return Response.json({ ok: true });
};
