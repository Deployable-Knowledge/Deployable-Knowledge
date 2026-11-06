import { asc, eq } from 'drizzle-orm';
import { db } from '#lib/server/database/database';
import { profiles, type AssistantProfile } from '#lib/server/database/schema';
import { sanitizeGpuMode } from '#lib/server/utils/profile-values';

// Profiles saved while CUDA was a compute device option can still hold `cuda`.
function withSupportedGpuMode(profile: AssistantProfile): AssistantProfile {
	return { ...profile, gpuMode: sanitizeGpuMode(profile.gpuMode) };
}

export class ProfilesRepository {
	static async list() {
		const rows = await db.select().from(profiles).orderBy(asc(profiles.name));
		return rows.map(withSupportedGpuMode);
	}

	static async find(id: string) {
		const row = await db.select().from(profiles).where(eq(profiles.id, id)).get();
		return row && withSupportedGpuMode(row);
	}
}
