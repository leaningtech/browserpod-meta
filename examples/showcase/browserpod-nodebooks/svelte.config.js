import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		// Static export for Cloudflare Pages. The app is a single client-rendered
		// page, so we prerender it and fall back to index.html for any other path.
		// Output to dist/ so the Pages output directory matches the other Vite
		// apps in this showcase (adapter-static defaults to build/).
		adapter: adapter({
			pages: 'dist',
			assets: 'dist',
			fallback: 'index.html'
		})
	}
};

export default config;
