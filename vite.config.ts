import { fileURLToPath } from 'node:url';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, normalizePath } from 'vite';

const UNWATCHED_RUNTIME_PATHS = ['./documents/', './app.db'].map((path) =>
	normalizePath(fileURLToPath(new URL(path, import.meta.url)))
);

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
		})
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
