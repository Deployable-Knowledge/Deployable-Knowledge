import { API_SKILLS } from '#lib/constants';
import type { ApiSkillRequest, Skill } from '#lib/types';
import { apiDelete, apiFetch, apiPatch, apiPost } from '#lib/utils';

export class SkillsService {
	static list() {
		return apiFetch<Skill[]>(API_SKILLS.BASE);
	}

	static create(value: ApiSkillRequest) {
		return apiPost<Skill, ApiSkillRequest>(API_SKILLS.BASE, value);
	}

	static update(id: string, value: ApiSkillRequest) {
		return apiPatch<Skill, ApiSkillRequest>(API_SKILLS.byId(id), value);
	}

	static delete(id: string) {
		return apiDelete<Skill>(API_SKILLS.byId(id));
	}
}
