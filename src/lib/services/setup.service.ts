import { API_SETUP, type SetupComponentId } from '#lib/constants';
import type { ApiDocumentIngestProgress, ApiSetupStatus } from '#lib/types';
import { apiFetch, apiPost } from '#lib/utils';
import { streamModelDownload } from './model-download';

export class SetupService {
	static getStatus() {
		return apiFetch<ApiSetupStatus>(API_SETUP.COMPONENTS);
	}

	static install(
		id: SetupComponentId,
		onProgress: (progress: ApiDocumentIngestProgress) => void
	): Promise<void> {
		return streamModelDownload(API_SETUP.COMPONENTS, { id }, 'Downloading', onProgress);
	}

	static complete() {
		return apiPost<void, Record<string, never>>(API_SETUP.COMPLETE, {});
	}
}
