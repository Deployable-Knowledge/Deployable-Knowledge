import { fileURLToPath } from 'node:url';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { build, context, type BuildOptions } from 'esbuild';
import { defineConfig, normalizePath, type Plugin } from 'vite';

const UNWATCHED_RUNTIME_PATHS = ['./documents/', './app.db'].map((path) =>
	normalizePath(fileURLToPath(new URL(path, import.meta.url)))
);

const TRANSCRIPTION_WORKER_BUILD: BuildOptions = {
	entryPoints: [
		fileURLToPath(
			new URL('./src/lib/server/transcription/transcription-worker-entry.ts', import.meta.url)
		)
	],
	outfile: fileURLToPath(new URL('./dist-workers/transcription-worker.mjs', import.meta.url)),
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node22',
	external: ['@huggingface/transformers', 'onnxruntime-node'],
	sourcemap: true,
	logLevel: 'warning'
};

function transcriptionWorker(): Plugin {
	let serving = false;

	return {
		name: 'dk:transcription-worker',
		configResolved(config) {
			serving = config.command === 'serve';
		},
		async buildStart() {
			if (serving) return;
			await build(TRANSCRIPTION_WORKER_BUILD);
		},
		async configureServer(server) {
			const watcher = await context(TRANSCRIPTION_WORKER_BUILD);
			await watcher.rebuild();
			await watcher.watch();
			server.httpServer?.once('close', () => void watcher.dispose());
		}
	};
}

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: adapter(),
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
				experimental: { async: true }
			}
		}),
		transcriptionWorker()
	],
	optimizeDeps: { exclude: ['node-llama-cpp', '@matbee/libreoffice-converter', 'exceljs'] },
	ssr: { external: ['node-llama-cpp', '@matbee/libreoffice-converter', 'exceljs'] },
	server: {
		watch: {
			ignored: (path) =>
				UNWATCHED_RUNTIME_PATHS.some((runtimePath) => normalizePath(path).startsWith(runtimePath))
		}
	}
});
