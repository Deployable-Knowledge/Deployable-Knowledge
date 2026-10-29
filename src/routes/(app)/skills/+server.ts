import { error, json } from '@sveltejs/kit';

import type { ApiSkillRequest } from '#lib/types';
import { SkillsRepository } from '#lib/server/repositories';
import { parseSkillRequest } from '#lib/server/skills/skill-values';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => json(await SkillsRepository.list());

export const POST: RequestHandler = async ({ request }) => {
	const values = parseSkillRequest((await request.json()) as ApiSkillRequest);

	if (await SkillsRepository.findByName(values.name)) {
		throw error(409, `A skill named /${values.name} already exists`);
	}

	return json(await SkillsRepository.create(values), { status: 201 });
};
