import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// Everything main.js imports (../sloth.js, ../lib/*, ../decks/*, ../pod-modules)
// lives inside this sloth/ directory, so the dev server reads from here.
const appRoot = resolve(here);

// https://vitejs.dev/config/
export default defineConfig({
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
