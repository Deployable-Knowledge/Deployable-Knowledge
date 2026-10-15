import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	buildNotebookCollection,
	type ImportedNotebookFile
} from '#lib/server/notebooks/import-notebook-collection';
import { isNotebookPageImportPath } from '#lib/server/notebooks/import-notebook-page';
import { NotebooksRepository } from '#lib/server/repositories/notebooks.repository';

const USER_MANUAL_FOLDER = 'user-manual';
const USER_MANUAL_TITLE = 'Deployable Knowledge User Manual';

async function readUserManualFiles(folder: string): Promise<ImportedNotebookFile[] | null> {
	const entries = await readdir(folder, { withFileTypes: true }).catch(
		(error: NodeJS.ErrnoException) => {
			if (error.code === 'ENOENT') return null;
			throw error;
		}
	);
	if (!entries) return null;

	const pageNames = entries
		.filter((entry) => entry.isFile() && isNotebookPageImportPath(entry.name))
		.map((entry) => entry.name);

	return Promise.all(
		pageNames.map(async (sourceName) => ({
			sourceName,
			data: await readFile(join(folder, sourceName))
		}))
	);
}

/**
 * Loads the starter content from `seed/` into a database that has never been
 * used. The check runs on every startup but only acts while the notebook tables
 * are untouched, so it fires once per new `app.db` and never refills a library
 * the user has since emptied.
 */
export async function seedDatabase(seedFolder: string): Promise<void> {
	if (!(await NotebooksRepository.isUninitialized())) return;

	const manualFolder = join(seedFolder, USER_MANUAL_FOLDER);
	const files = await readUserManualFiles(manualFolder);
	if (!files) {
		console.warn(`[seed] ${manualFolder} not found; starting without the user manual.`);
		return;
	}

	const manual = buildNotebookCollection(USER_MANUAL_TITLE, files);
	await NotebooksRepository.createWithPages(manual.title, manual.pages);
}
