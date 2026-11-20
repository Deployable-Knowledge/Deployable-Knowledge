import type { Component } from 'svelte';
import type { ModelIconId } from '#lib/constants';
import AnthropicIcon from './AnthropicIcon.svelte';
import GemmaIcon from './GemmaIcon.svelte';
import NomicIcon from './NomicIcon.svelte';
import OpenAiIcon from './OpenAiIcon.svelte';

export { AnthropicIcon, GemmaIcon, NomicIcon, OpenAiIcon };

export const MODEL_ICONS: Record<ModelIconId, Component<{ class?: string }>> = {
	gemma: GemmaIcon,
	nomic: NomicIcon
};
