import { json } from '@sveltejs/kit';

import type { UserGuideFirstRunResponse } from '#lib/types';
import { claimUserGuideFirstRun } from '#lib/server/database/app-state';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () =>
	json({ open: await claimUserGuideFirstRun() } satisfies UserGuideFirstRunResponse);
