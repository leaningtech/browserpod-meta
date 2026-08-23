import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			pages: 'dist',
			assets: 'dist',
			fallback: '200.html'
		}),
		prerender: { handleUnseenRoutes: 'ignore' }
	}
};

export default config;
