import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { env } from '@huggingface/transformers';

const TRANSFORMERS_CACHE_DIR = resolve(process.cwd(), '.cache', 'transformersjs');

env.allowRemoteModels = true;
env.cacheDir = TRANSFORMERS_CACHE_DIR;
env.localModelPath = TRANSFORMERS_CACHE_DIR;

type ModelSource = {
	nameOrPath: string;
	options: { cache_dir?: string; revision?: string; local_files_only?: boolean };
};

export type CachedModel = {
	isInstalled: () => boolean;
	source: () => ModelSource;
};

// Loading by hub id asks huggingface.co which optional files a model has, even when every file is
// already cached, so it fails without a connection. A model whose files are all on disk is loaded
// from its cache directory instead, which never touches the network.
export function cachedModel(
	modelId: string,
	files: readonly string[],
	revision?: string
): CachedModel {
	const directory = join(TRANSFORMERS_CACHE_DIR, modelId, revision ?? '');
	const isInstalled = () => files.every((file) => existsSync(join(directory, file)));

	return {
		isInstalled,
		source: () =>
			isInstalled()
				? { nameOrPath: directory, options: { local_files_only: true } }
				: { nameOrPath: modelId, options: { cache_dir: TRANSFORMERS_CACHE_DIR, revision } }
	};
}
