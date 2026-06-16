import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// BrowserPod needs cross-origin isolation (SharedArrayBuffer). On Cloudflare
// these come from static/_headers; for local dev/preview we set them here so
// the dev server matches production.
const browserPodHeaders = {
	'Cross-Origin-Embedder-Policy': 'require-corp',
	'Cross-Origin-Opener-Policy': 'same-origin'
};

// Make sure _headers ends up in the build output (dist) so Cloudflare applies
// the isolation headers to the served document, not just to static assets.
const copyHeaders = () => ({
	name: 'copy-headers',
	closeBundle() {
		const src = resolve(import.meta.dirname, 'static', '_headers');
		const dest = resolve(import.meta.dirname, 'dist', '_headers');
		if (existsSync(src)) copyFileSync(src, dest);
	}
});

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), copyHeaders()],
	server: {
		headers: browserPodHeaders
	},
	preview: {
		headers: browserPodHeaders
	}
});
