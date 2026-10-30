import { error } from '@sveltejs/kit';
import { removeDocument } from '#lib/server/documents/remove-document';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params }) => {
	if (!(await removeDocument(params.id))) throw error(404, 'Document not found.');
	return Response.json({ removed: true });
};
