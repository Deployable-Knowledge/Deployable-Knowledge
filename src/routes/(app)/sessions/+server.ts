import { SessionsRepository } from '#lib/server/repositories';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return Response.json(await SessionsRepository.list());
};

export const POST: RequestHandler = async () => {
	return Response.json(await SessionsRepository.create(), { status: 201 });
};
