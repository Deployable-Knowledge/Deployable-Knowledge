import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { db } from '#lib/server/database/database';
import { skills, type NewSkill } from '#lib/server/database/schema';

type SkillValues = Pick<NewSkill, 'name' | 'description' | 'instructions' | 'modelInvocable'>;

export class SkillsRepository {
	static list() {
		return db.select().from(skills).orderBy(asc(skills.name));
	}

	static find(id: string) {
		return db.select().from(skills).where(eq(skills.id, id)).get();
	}

	static findByName(name: string) {
		return db.select().from(skills).where(eq(skills.name, name)).get();
	}

	static async create(values: SkillValues) {
		const timestamp = new Date();
		const [row] = await db
			.insert(skills)
			.values({ id: randomUUID(), ...values, createdAt: timestamp, updatedAt: timestamp })
			.returning();
		return row;
	}

	static async update(id: string, values: SkillValues) {
		const [row] = await db
			.update(skills)
			.set({ ...values, updatedAt: new Date() })
			.where(eq(skills.id, id))
			.returning();
		return row;
	}

	static async delete(id: string) {
		const [row] = await db.delete(skills).where(eq(skills.id, id)).returning();
		return row;
	}
}
