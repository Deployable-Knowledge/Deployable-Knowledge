import { completeSetup } from '#lib/server/database/app-state';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
	await completeSetup();
	return new Response(null, { status: 204 });
};
