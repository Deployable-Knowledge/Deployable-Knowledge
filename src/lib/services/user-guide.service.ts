import { API_USER_GUIDE } from '#lib/constants';
import type { UserGuideChapter, UserGuideFirstRunResponse } from '#lib/types';
import { apiFetch, apiPost } from '#lib/utils';

export class UserGuideService {
	static list() {
		return apiFetch<UserGuideChapter[]>(API_USER_GUIDE.BASE);
	}

	static claimFirstRun() {
		return apiPost<UserGuideFirstRunResponse, Record<string, never>>(API_USER_GUIDE.FIRST_RUN, {});
	}
}
