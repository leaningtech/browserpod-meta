import adapter from '@sveltejs/adapter-static';

// No `preprocess`: vite-plugin-svelte handles `lang="ts"` on its own, and a configured
// preprocessor makes svelte-check hunt for a Vite config beside every .svelte file it
// can see, including the ones in reference/.
/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			pages: 'dist',
			assets: 'dist',
			fallback: '200.html'
		}),
		// One client rendered route; only the shell is prerendered.
		prerender: { handleUnseenRoutes: 'ignore' }
	},
	vitePlugin: { exclude: ['**/reference/**'] }
};

export default config;
