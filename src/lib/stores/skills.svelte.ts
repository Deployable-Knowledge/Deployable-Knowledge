import { SkillsService } from '#lib/services';
import type { ApiSkillRequest, Skill } from '#lib/types';

class SkillsStore {
	private _skills = $state<Skill[]>([]);
	error = $state<string | null>(null);

	get skills(): readonly Skill[] {
		return this._skills;
	}

	async load(): Promise<void> {
		this.error = null;
		try {
			this._skills = await SkillsService.list();
		} catch (error) {
			this.error = message(error);
		}
	}

	async create(value: ApiSkillRequest): Promise<void> {
		const skill = await SkillsService.create(value);
		this._skills = sortByName([...this._skills, skill]);
	}

	async update(id: string, value: ApiSkillRequest): Promise<void> {
		const skill = await SkillsService.update(id, value);
		this._skills = sortByName(this._skills.map((item) => (item.id === id ? skill : item)));
	}

	async remove(id: string): Promise<void> {
		await SkillsService.delete(id);
		this._skills = this._skills.filter((skill) => skill.id !== id);
	}
}

function sortByName(skills: Skill[]): Skill[] {
	return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export const skillsStore = new SkillsStore();
