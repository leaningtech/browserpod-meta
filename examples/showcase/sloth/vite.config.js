import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PAGES } from './scripts/pages.config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
// Everything main.js imports (../sloth.js, ../lib/*, ../decks/*, ../pod-modules)
// lives inside this sloth/ directory, so the dev server reads from here.
const appRoot = resolve(here);

// https://vitejs.dev/config/
// Cloudflare Pages serves app.html at /app and the landing pages at their
// slugs. This gives the dev and preview
// servers the same address, so links between the pages work locally.
const appRoute = (req, _res, next) => {
  if (req.url === '/app' || req.url.startsWith('/app?')) {
    req.url = req.url.replace('/app', '/app.html');
  }
  const slug = req.url.slice(1).split('?')[0];
  if (PAGES.some((page) => page.slug === slug)) {
    req.url = req.url.replace(`/${slug}`, `/${slug}.html`);
  }
  next();
};
const cleanAppUrl = () => ({
  name: 'clean-app-url',
  configureServer(server) { server.middlewares.use(appRoute); },
  configurePreviewServer(server) { server.middlewares.use(appRoute); }
});

export default defineConfig({
  plugins: [cleanAppUrl()],
  build: {
    rollupOptions: {
      // The static home page plus the app page that boots the terminal.
      input: {
        main: resolve(here, 'index.html'),
        app: resolve(here, 'app.html'),
        ...Object.fromEntries(PAGES.map((page) => [page.slug, resolve(here, `${page.slug}.html`)]))
      }
    }
  },
  server: {
    fs: {
      allow: [appRoot]
    },
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  }
});
