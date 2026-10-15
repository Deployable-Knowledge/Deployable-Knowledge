import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import packageMetadata from '../package.json';
import { getThemeSettings } from '#lib/server/database/app-state';
import { bootstrapSchema } from '#lib/server/database/bootstrap-schema';
import { configureDatabase } from '#lib/server/database/database';
import { createLogger, initializeLogging } from '#lib/server/logging';
import { seedDatabase } from '#lib/server/database/seed-database';
import { applyVulkanDevice } from '#lib/server/providers/vulkan-devices';
import { refreshStaleEmbeddings } from '#lib/server/rag/embedding';

const log = createLogger('application');

// The theme lives in the database, so it cannot be read before paint the way a
// localStorage value can. Stamping it onto <html> during render keeps the boot
// script synchronous and the first paint correctly themed.
export const handle: Handle = async ({ event, resolve }) => {
	const theme = await getThemeSettings();

	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace('%dk.themeColor%', theme.color).replace('%dk.themeMode%', theme.mode)
	});
};

export const handleError: HandleServerError = ({ error, event, kind }) => {
	if (kind !== 'unknown') return;
	log.error('Unhandled request error', { route: event.route.id }, error);
};

export const init: ServerInit = async () => {
	await initializeLogging();
	log.info('Server started', {
		runtimeMode: process.env.NODE_ENV === 'development' ? 'development' : 'production',
		version: packageMetadata.version
	});

	await configureDatabase();

	// The desktop app has no `drizzle-kit` CLI to run `predev`, so it points the
	// server at the migrations it shipped with and lets it catch the database up
	// before anything touches it.
	const migrationsFolder = process.env.DK_MIGRATIONS_DIR?.trim();
	if (migrationsFolder) await bootstrapSchema(migrationsFolder);

	await seedDatabase(process.env.DK_SEED_DIR?.trim() || 'seed');

	await applyVulkanDevice();

	// Resumes a re-embed that an earlier run left unfinished.
	refreshStaleEmbeddings();
};
