import { SKILL_NAME_MAX_LENGTH } from '#lib/constants';
import type { AgentTool } from './types';
import { createToolResult } from './result';
import { clampText, readObject } from '../utils/values';

type UseSkillData = {
	name: string;
	instructions: string;
};

export const useSkillTool: AgentTool<UseSkillData> = {
	id: 'use_skill',
	label: 'Skills',
	description: 'Lets the model load one of your skills when a request matches it.',
	modes: ['document', 'notebook'],
	keepResultOnCompact: true,
	definition: {
		description:
			'Load the full instructions of a skill listed under "Available skills". Call it before answering when a skill matches the request, then follow the returned instructions.',
		parameters: {
			type: 'object',
			properties: {
				name: {
					type: 'string',
					description: 'The skill name exactly as listed, without the leading slash.'
				}
			},
			required: ['name'],
			additionalProperties: false
		}
	},

	async execute(argumentsValue, context) {
		const requested = clampText(readObject(argumentsValue).name, SKILL_NAME_MAX_LENGTH + 1);
		const name = requested.replace(/^\//, '');
		const available = context.skills ?? [];
		const skill = available.find((candidate) => candidate.name === name);

		if (!skill) {
			const names = available.map((candidate) => candidate.name).join(', ');
			throw new Error(`use_skill: unknown skill "${name}". Available skills: ${names}`);
		}

		return createToolResult(
			{ name: skill.name, instructions: skill.instructions },
			{ content: `Skill /${skill.name} instructions:\n\n${skill.instructions}` }
		);
	}
};
