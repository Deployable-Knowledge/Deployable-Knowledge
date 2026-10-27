import { redirect } from '@sveltejs/kit';
import { isSetupComplete } from '#lib/server/database/app-state';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	if (await isSetupComplete()) throw redirect(302, '/');
};
