import { totalmem } from 'node:os';
import { json } from '@sveltejs/kit';
import { SETUP_COMPONENT_IDS } from '#lib/constants';
import {
	getActiveSetupInstall,
	installSetupComponent,
	listSetupComponents
} from '#lib/server/setup/components';
import { modelDownloadResponse } from '#lib/server/utils/model-download-response';
import type { ApiSetupStatus } from '#lib/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const status: ApiSetupStatus = {
		components: await listSetupComponents(),
		memoryGiB: Math.round(totalmem() / 1024 ** 3)
	};

	return json(status);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
	const id = SETUP_COMPONENT_IDS.find((candidate) => candidate === body?.id);

	if (!id) return json({ error: 'Unknown setup component.' }, { status: 400 });
	if (getActiveSetupInstall()) {
		return json({ error: 'A setup download is already running.' }, { status: 409 });
	}

	return modelDownloadResponse('Setup install', (onProgress) =>
		installSetupComponent(id, onProgress)
	);
};
