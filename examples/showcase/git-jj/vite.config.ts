import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';
import type { ServerResponse } from 'node:http';

/** BrowserPod needs SharedArrayBuffer, which requires a cross-origin isolated page. */
const ISOLATION_HEADERS = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp',
	'Cross-Origin-Resource-Policy': 'cross-origin'
};

/**
 * `server.headers` does not reach the responses SvelteKit's dev handler writes, so
 * the same headers are pushed from middleware that runs ahead of it. In production
 * they come from static/_headers.
 */
function crossOriginIsolation(): Plugin {
	const apply = (response: ServerResponse) => {
		for (const [header, value] of Object.entries(ISOLATION_HEADERS)) {
			response.setHeader(header, value);
		}
	};
	return {
		name: 'bramble:cross-origin-isolation',
		configureServer(server) {
			server.middlewares.use((_request, response, next) => {
				apply(response);
				next();
			});
		},
		configurePreviewServer(server) {
			server.middlewares.use((_request, response, next) => {
				apply(response);
				next();
			});
		}
	};
}

export default defineConfig({
	plugins: [crossOriginIsolation(), tailwindcss(), sveltekit()],
	server: {
		headers: ISOLATION_HEADERS,
		// reference/ is a second SvelteKit app; keep it out of the watcher.
		watch: { ignored: ['**/reference/**'] }
	},
	preview: {
		headers: ISOLATION_HEADERS
	}
});
