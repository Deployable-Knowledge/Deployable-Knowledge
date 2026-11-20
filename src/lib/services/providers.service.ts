import { API_PROVIDERS } from '#lib/constants';
import type {
	ApiCustomProviderCreateRequest,
	ApiCustomProviderRequest,
	ApiProviderInfo
} from '#lib/types';
import { apiDelete, apiFetch, apiPatch, apiPost } from '#lib/utils';

export class ProvidersService {
	static list() {
		return apiFetch<ApiProviderInfo[]>(API_PROVIDERS.BASE);
	}

	static listModels(id: string) {
		return apiFetch<string[]>(API_PROVIDERS.byId(id));
	}

	static create(value: ApiCustomProviderCreateRequest) {
		return apiPost<ApiProviderInfo, ApiCustomProviderCreateRequest>(API_PROVIDERS.BASE, value);
	}

	static update(id: string, value: ApiCustomProviderRequest) {
		return apiPatch<ApiProviderInfo, ApiCustomProviderRequest>(API_PROVIDERS.byId(id), value);
	}

	static delete(id: string) {
		return apiDelete<ApiProviderInfo>(API_PROVIDERS.byId(id));
	}
}
