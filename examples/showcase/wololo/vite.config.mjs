import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Ensure Cloudflare's _headers (cross-origin isolation) lands in the build
// output, rather than relying on Vite's implicit public/ copy.
const copyHeaders = () => ({
  name: 'copy-headers',
  closeBundle() {
    const src = resolve(import.meta.dirname, 'public', '_headers');
    const dest = resolve(import.meta.dirname, 'dist', '_headers');
    if (existsSync(src)) copyFileSync(src, dest);
  },
});

export default defineConfig({
  plugins: [copyHeaders()],
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
});
