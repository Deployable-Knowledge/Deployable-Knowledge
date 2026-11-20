import { error } from '@sveltejs/kit';
import { CHAT_MODES } from '#lib/constants';
import type { ChatPreferences } from '#lib/types';
import { getChatPreferences, setChatPreferences } from '#lib/server/database/app-state';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => Response.json(await getChatPreferences());

export const PATCH: RequestHandler = async ({ request }) => {
	const { mode, toolsEnabled } = (await request.json()) as ChatPreferences;

	if (!CHAT_MODES.includes(mode)) throw error(400, 'Unsupported chat mode.');
	if (typeof toolsEnabled !== 'boolean') throw error(400, 'toolsEnabled must be a boolean.');

	return Response.json(await setChatPreferences({ mode, toolsEnabled }));
};
