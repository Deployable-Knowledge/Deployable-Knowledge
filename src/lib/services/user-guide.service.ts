import { API_USER_GUIDE } from '#lib/constants';
import type { UserGuideChapter } from '#lib/types';
import { apiFetch } from '#lib/utils';

export class UserGuideService {
	static list() {
		return apiFetch<UserGuideChapter[]>(API_USER_GUIDE);
	}
}
