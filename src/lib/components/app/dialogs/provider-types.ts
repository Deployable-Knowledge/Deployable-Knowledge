import Cpu from '@lucide/svelte/icons/cpu';
import type { Component } from 'svelte';
import { AnthropicIcon, OpenAiIcon } from '#lib/components/app/icons';
import type { CustomProviderType } from '#lib/constants';
import type { ApiProviderInfo } from '#lib/types';

type ProviderIcon = Component<{ class?: string }>;

export interface CustomProviderTypeOption {
	baseUrlPlaceholder: string;
	description: string;
	icon: ProviderIcon;
	label: string;
	requestPath: string;
}

export const CUSTOM_PROVIDER_TYPE_OPTIONS: Record<CustomProviderType, CustomProviderTypeOption> = {
	openai: {
		baseUrlPlaceholder: 'https://api.openai.com/v1',
		description:
			'Any server that implements the Chat Completions API, such as OpenAI, OpenRouter, Ollama, LM Studio, vLLM, or llama.cpp server.',
		icon: OpenAiIcon,
		label: 'OpenAI-compatible',
		requestPath: '/chat/completions'
	},
	anthropic: {
		baseUrlPlaceholder: 'https://api.anthropic.com',
		description: 'A server that implements the Anthropic Messages API.',
		icon: AnthropicIcon,
		label: 'Anthropic',
		requestPath: '/v1/messages'
	}
};

export function providerIcon(provider: ApiProviderInfo): ProviderIcon {
	return provider.custom ? CUSTOM_PROVIDER_TYPE_OPTIONS[provider.custom.type].icon : Cpu;
}
