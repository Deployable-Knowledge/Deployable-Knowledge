import { fileURLToPath } from 'node:url';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { build, context, type BuildOptions } from 'esbuild';
import { defineConfig, normalizePath, type Plugin } from 'vite';

const UNWATCHED_RUNTIME_PATHS = ['./documents/', './app.db'].map((path) =>
	normalizePath(fileURLToPath(new URL(path, import.meta.url)))
);

const DIARIZATION_WORKER_BUILD: BuildOptions = {
	entryPoints: [
		fileURLToPath(new URL('./src/lib/server/transcription/community-1/worker.ts', import.meta.url))
	],
	outfile: fileURLToPath(new URL('./dist-workers/diarization-worker.mjs', import.meta.url)),
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node22',
	external: ['onnxruntime-node'],
	sourcemap: true,
	logLevel: 'warning'
};

function diarizationWorker(): Plugin {
	let serving = false;

	return {
		name: 'dk:diarization-worker',
		configResolved(config) {
			serving = config.command === 'serve';
		},
		async buildStart() {
			if (serving) return;
			await build(DIARIZATION_WORKER_BUILD);
		},
		async configureServer(server) {
			const watcher = await context(DIARIZATION_WORKER_BUILD);
			await watcher.rebuild();
			await watcher.watch();
			server.httpServer?.once('close', () => void watcher.dispose());
		}
	};
}

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), diarizationWorker()],
	optimizeDeps: { exclude: ['node-llama-cpp', '@matbee/libreoffice-converter', 'exceljs'] },
	ssr: { external: ['node-llama-cpp', '@matbee/libreoffice-converter', 'exceljs'] },
	server: {
		watch: {
			ignored: (path) =>
				UNWATCHED_RUNTIME_PATHS.some((runtimePath) => normalizePath(path).startsWith(runtimePath))
		}
	}
});
