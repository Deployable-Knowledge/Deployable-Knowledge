import { json } from '@sveltejs/kit';

import { listUserGuideChapters } from '#lib/server/user-guide/user-guide';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => json(listUserGuideChapters());
