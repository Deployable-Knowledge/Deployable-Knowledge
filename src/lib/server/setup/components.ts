import {
	LOCAL_MODEL_PROVIDER_ID,
	SETUP_COMPONENT_IDS,
	type SetupComponentId
} from '#lib/constants';
import type { ApiSetupComponentStatus } from '#lib/types';
import { localEmbeddingProvider } from '#lib/server/embeddings/registry';
import { installOcrData, isOcrDataInstalled } from '#lib/server/rag/chunk/ocr-data';
import { refreshStaleEmbeddings } from '#lib/server/rag/embedding';
import { getActiveEmbedding, isEmbeddingModelInstalled } from '#lib/server/rag/embedding-model';
import { getActiveCrossEncoder } from '#lib/server/rag/search/cross-encoders/registry';
import {
	installTranscriptionModel,
	isTranscriptionModelInstalled
} from '#lib/server/transcription/transcription-model';
import type { DownloadProgressHandler } from '#lib/server/utils/download-progress';

type SetupInstaller = {
	isInstalled: () => boolean | Promise<boolean>;
	install: (onProgress: DownloadProgressHandler) => Promise<void>;
};

async function installEmbeddingModel(onProgress: DownloadProgressHandler): Promise<void> {
	const { provider, settings } = await getActiveEmbedding();
	if (provider.id !== LOCAL_MODEL_PROVIDER_ID) return;

	await localEmbeddingProvider.download(settings.model, onProgress);
	refreshStaleEmbeddings();
}

const INSTALLERS: Record<SetupComponentId, SetupInstaller> = {
	ocr: { isInstalled: isOcrDataInstalled, install: installOcrData },
	transcription: {
		isInstalled: isTranscriptionModelInstalled,
		install: installTranscriptionModel
	},
	reranker: {
		isInstalled: () => getActiveCrossEncoder().isInstalled(),
		install: (onProgress) => getActiveCrossEncoder().prepare(onProgress)
	},
	embedding: { isInstalled: isEmbeddingModelInstalled, install: installEmbeddingModel }
};

let activeInstall: SetupComponentId | null = null;

export function getActiveSetupInstall(): SetupComponentId | null {
	return activeInstall;
}

export function listSetupComponents(): Promise<ApiSetupComponentStatus[]> {
	return Promise.all(
		SETUP_COMPONENT_IDS.map(async (id) => ({ id, installed: await INSTALLERS[id].isInstalled() }))
	);
}

export async function installSetupComponent(
	id: SetupComponentId,
	onProgress: DownloadProgressHandler
): Promise<void> {
	if (activeInstall) throw new Error('A setup download is already running.');

	activeInstall = id;
	try {
		await INSTALLERS[id].install(onProgress);
	} finally {
		activeInstall = null;
	}
}
