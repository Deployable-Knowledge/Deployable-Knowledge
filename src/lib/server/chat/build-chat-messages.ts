import { CHAT_HISTORY_MESSAGE_LIMIT } from '#lib/constants';
import type { SessionMessage, Skill } from '#lib/server/database/schema';
import type { ProviderChatMessage } from '#lib/server/providers/provider';
import { toolRegistry } from '#lib/server/tools';
import {
	ACTIVE_SKILL_SYSTEM_PROMPT,
	AGENT_SYSTEM_PROMPT,
	CONVERSATIONAL_SYSTEM_PROMPT,
	DOCUMENT_CONTEXT_SYSTEM_PROMPT,
	REFERENCE_MATERIAL_INSTRUCTION,
	SKILL_CATALOG_SYSTEM_PROMPT
} from '#lib/server/agent/prompts';

type ChatInput = {
	history: SessionMessage[];
	userMessage: string;
	context: string;
	toolNames: readonly string[];
	skill: Skill | null;
	skillCatalog: readonly Skill[];
};

export function createNotebookMessages({
	history,
	userMessage,
	context,
	toolNames,
	skill,
	skillCatalog
}: ChatInput): ProviderChatMessage[] {
	const request = context
		? `Reference material (background knowledge — do not reprint it):\n\n${context}\n\n${REFERENCE_MATERIAL_INSTRUCTION}\n\nRequest: ${userMessage}`
		: userMessage;
	const system = [
		CONVERSATIONAL_SYSTEM_PROMPT,
		activeSkillPrompt(skill),
		...toolPrompts(toolNames),
		skillCatalogPrompt(skillCatalog)
	];
	return chatMessages(system, history, request);
}

// When the search already ran for this prompt (auto-search), the model works
// from the retrieved context instead of being told to search.
export function createDocumentMessages({
	history,
	userMessage,
	context,
	toolNames,
	skill,
	skillCatalog,
	systemPrompt,
	persona,
	autoSearch
}: ChatInput & {
	systemPrompt: string;
	persona: string;
	autoSearch: boolean;
}): ProviderChatMessage[] {
	const system = [
		systemPrompt,
		persona.trim() ? `Persona: ${persona.trim()}` : '',
		activeSkillPrompt(skill),
		...toolPrompts(toolNames),
		skillCatalogPrompt(skillCatalog),
		autoSearch ? DOCUMENT_CONTEXT_SYSTEM_PROMPT : ''
	];
	return chatMessages(
		system,
		history,
		context ? `${context}\n\nRequest: ${userMessage}` : userMessage
	);
}

function activeSkillPrompt(skill: Skill | null): string {
	return skill ? `${ACTIVE_SKILL_SYSTEM_PROMPT}\n\n/${skill.name}\n${skill.instructions}` : '';
}

function skillCatalogPrompt(skills: readonly Skill[]): string {
	if (!skills.length) return '';
	const entries = skills.map(({ name, description }) =>
		description ? `- ${name}: ${description}` : `- ${name}`
	);
	return [SKILL_CATALOG_SYSTEM_PROMPT, ...entries].join('\n');
}

function toolPrompts(toolNames: readonly string[]): string[] {
	return toolNames.length ? [AGENT_SYSTEM_PROMPT, ...toolRegistry.instructions(toolNames)] : [];
}

function chatMessages(
	system: string[],
	history: SessionMessage[],
	request: string
): ProviderChatMessage[] {
	const systemContent = system
		.map((part) => part.trim())
		.filter(Boolean)
		.join('\n\n');

	return [
		...(systemContent ? [{ role: 'system' as const, content: systemContent }] : []),
		...history
			.slice(-CHAT_HISTORY_MESSAGE_LIMIT)
			.flatMap(({ role, content }) =>
				role === 'user' || role === 'assistant' ? [{ role, content }] : []
			),
		{ role: 'user', content: request }
	];
}
