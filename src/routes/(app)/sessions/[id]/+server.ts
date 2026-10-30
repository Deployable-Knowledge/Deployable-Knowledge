import type { ApiSessionTitleRequest } from '#lib/types';
import { SessionsRepository } from '#lib/server/repositories';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const session = await SessionsRepository.find(params.id);

	if (!session) return Response.json(null);

	return Response.json(await SessionsRepository.listMessages(params.id));
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const body = (await request.json()) as ApiSessionTitleRequest;
	const title = body.title.trim();
	if (!title) {
		return Response.json({ error: 'Session title is required' }, { status: 400 });
	}
	await SessionsRepository.rename(params.id, title);

	return Response.json({ status: 'ok', session_id: params.id, title });
};

export const DELETE: RequestHandler = async ({ params }) => {
	await SessionsRepository.delete(params.id);

	return Response.json({ status: 'ok', session_id: params.id });
};
