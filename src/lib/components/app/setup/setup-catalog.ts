import AudioLines from '@lucide/svelte/icons/audio-lines';
import ListOrdered from '@lucide/svelte/icons/list-ordered';
import ScanText from '@lucide/svelte/icons/scan-text';
import Waypoints from '@lucide/svelte/icons/waypoints';
import type { Component } from 'svelte';
import type { SetupComponentId } from '#lib/constants';

export interface SetupComponentDetails {
	icon: Component<{ class?: string }>;
	name: string;
	sizeBytes: number;
}

export const SETUP_COMPONENT_DETAILS: Record<SetupComponentId, SetupComponentDetails> = {
	ocr: { name: 'Text recognition', icon: ScanText, sizeBytes: 23_466_654 },
	transcription: { name: 'Speech transcription', icon: AudioLines, sizeBytes: 153_621_062 },
	reranker: { name: 'Search reranker', icon: ListOrdered, sizeBytes: 36_596_448 },
	embedding: { name: 'Semantic search', icon: Waypoints, sizeBytes: 146_146_432 }
};
