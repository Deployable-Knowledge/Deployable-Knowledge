import { API_CHAT_PREFERENCES } from '#lib/constants';
import type { ChatPreferences } from '#lib/types';
import { apiFetch, apiPatch } from '#lib/utils';

export class ChatPreferencesService {
	static get() {
		return apiFetch<ChatPreferences>(API_CHAT_PREFERENCES);
	}

	static update(values: ChatPreferences) {
		return apiPatch<ChatPreferences, ChatPreferences>(API_CHAT_PREFERENCES, values);
	}
}
