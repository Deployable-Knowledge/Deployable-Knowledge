import type { Component } from 'svelte';
import type { ModelIconId } from '#lib/constants';
import GemmaIcon from './GemmaIcon.svelte';
import NomicIcon from './NomicIcon.svelte';

export { GemmaIcon, NomicIcon };

export const MODEL_ICONS: Record<ModelIconId, Component<{ class?: string }>> = {
	gemma: GemmaIcon,
	nomic: NomicIcon
};
