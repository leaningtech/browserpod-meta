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

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		headers: browserPodHeaders
	},
	preview: {
		headers: browserPodHeaders
	}
});
