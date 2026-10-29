import { error } from '@sveltejs/kit';
import {
	SKILL_DESCRIPTION_MAX_LENGTH,
	SKILL_NAME_MAX_LENGTH,
	SKILL_NAME_PATTERN
} from '#lib/constants';
import type { ApiSkillRequest } from '#lib/types';

export function parseSkillRequest(body: ApiSkillRequest): ApiSkillRequest {
	const name = typeof body.name === 'string' ? body.name.trim() : '';

	if (name.length > SKILL_NAME_MAX_LENGTH || !SKILL_NAME_PATTERN.test(name)) {
		throw error(
			400,
			`Skill name must be 1-${SKILL_NAME_MAX_LENGTH} lowercase letters, numbers, or hyphens`
		);
	}

	if (typeof body.description !== 'string') {
		throw error(400, 'Skill description must be a string');
	}

	const instructions = typeof body.instructions === 'string' ? body.instructions.trim() : '';

	if (!instructions) {
		throw error(400, 'Skill instructions are required');
	}

	if (typeof body.modelInvocable !== 'boolean') {
		throw error(400, 'Skill model access must be a boolean');
	}

	return {
		name,
		description: body.description.trim().slice(0, SKILL_DESCRIPTION_MAX_LENGTH),
		instructions,
		modelInvocable: body.modelInvocable
	};
}
