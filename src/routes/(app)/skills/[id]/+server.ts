import { error, json } from '@sveltejs/kit';

import type { ApiSkillRequest } from '#lib/types';
import { SkillsRepository } from '#lib/server/repositories';
import { parseSkillRequest } from '#lib/server/skills/skill-values';

import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const values = parseSkillRequest((await request.json()) as ApiSkillRequest);
	const existing = await SkillsRepository.findByName(values.name);

	if (existing && existing.id !== params.id) {
		throw error(409, `A skill named /${values.name} already exists`);
	}

	const skill = await SkillsRepository.update(params.id, values);

	if (!skill) {
		throw error(404, 'Skill not found');
	}

	return json(skill);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const skill = await SkillsRepository.delete(params.id);

	if (!skill) {
		throw error(404, 'Skill not found');
	}

	return json(skill);
};
