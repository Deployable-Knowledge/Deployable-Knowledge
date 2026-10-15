export const LOCAL_MODEL_PROVIDER_ID = 'llamacpp';

export type ModelIconId = 'gemma' | 'nomic';

// Gemma weights ship under use-restricted terms rather than an open-source license,
// so the terms have to be reachable before a user starts a multi-gigabyte download.
const GEMMA_LICENSE = 'Gemma Terms of Use';
const GEMMA_LICENSE_URL = 'https://ai.google.dev/gemma/terms';

export interface DownloadableModel {
	name: string;
	vendor: string;
	description: string;
	icon: ModelIconId;
	repo: string;
	fileName: string;
	license: string;
	licenseUrl: string;
}

export interface LocalModel extends DownloadableModel {
	minRamGiB: number;
}

export const LOCAL_MODELS: readonly LocalModel[] = [
	{
		name: 'Gemma 4 E2B',
		vendor: 'Google',
		description: 'Lighter effective-2B variant for lower-RAM machines.',
		icon: 'gemma',
		repo: 'unsloth/gemma-4-E2B-it-GGUF',
		fileName: 'gemma-4-E2B-it-Q4_K_M.gguf',
		minRamGiB: 8,
		license: GEMMA_LICENSE,
		licenseUrl: GEMMA_LICENSE_URL
	},
	{
		name: 'Gemma 4 E4B',
		vendor: 'Google',
		description: 'Runs CPU-only at readable speed on a modern laptop.',
		icon: 'gemma',
		repo: 'unsloth/gemma-4-E4B-it-GGUF',
		fileName: 'gemma-4-E4B-it-Q4_K_M.gguf',
		minRamGiB: 16,
		license: GEMMA_LICENSE,
		licenseUrl: GEMMA_LICENSE_URL
	},
	{
		name: 'Gemma 4 26B A4B',
		vendor: 'Google',
		description: 'Meant for high end computers with dedicated GPUs.',
		icon: 'gemma',
		repo: 'bartowski/google_gemma-4-26B-A4B-it-GGUF',
		fileName: 'google_gemma-4-26B-A4B-it-Q4_K_M.gguf',
		minRamGiB: 32,
		license: GEMMA_LICENSE,
		licenseUrl: GEMMA_LICENSE_URL
	}
];

export const findLocalModelByFile = (fileName: string): LocalModel | null =>
	LOCAL_MODELS.find((model) => model.fileName === fileName) ?? null;
