import type { Component } from 'svelte';
import { MODEL_ICONS } from '#lib/components/app/icons';
import type { DownloadableModel } from '#lib/constants';

export interface LocalModelCardData {
	fileName: string;
	name: string;
	vendor: string;
	icon: Component<{ class?: string }> | null;
	description: string | null;
	downloadable: boolean;
	minRamGiB: number | null;
	license: string | null;
	licenseUrl: string | null;
}

export function catalogModelCard(
	model: DownloadableModel,
	minRamGiB: number | null
): LocalModelCardData {
	return {
		fileName: model.fileName,
		name: model.name,
		vendor: model.vendor,
		icon: MODEL_ICONS[model.icon],
		description: model.description,
		downloadable: true,
		minRamGiB,
		license: model.license,
		licenseUrl: model.licenseUrl
	};
}
