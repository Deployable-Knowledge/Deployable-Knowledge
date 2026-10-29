import type { Skill } from '#lib/types';

const SKILL_COMMAND_PATTERN = /^\/([a-z0-9-]+)(?:\s+([\s\S]*))?$/;
const SKILL_QUERY_PATTERN = /^\/(\S*)$/;

interface SkillInvocation {
	skill: Skill | null;
	text: string;
}

export function resolveSkillInvocation(text: string, skills: readonly Skill[]): SkillInvocation {
	const trimmed = text.trim();
	const [, name, rest = ''] = SKILL_COMMAND_PATTERN.exec(trimmed) ?? [];
	const skill = skills.find((candidate) => candidate.name === name);
	return skill ? { skill, text: rest.trim() } : { skill: null, text: trimmed };
}

export function skillQuery(draft: string): string | null {
	return SKILL_QUERY_PATTERN.exec(draft)?.[1].toLowerCase() ?? null;
}

export function matchSkills(skills: readonly Skill[], query: string): Skill[] {
	const prefixed = skills.filter(({ name }) => name.startsWith(query));
	const contained = skills.filter(({ name }) => !name.startsWith(query) && name.includes(query));
	return [...prefixed, ...contained];
}
