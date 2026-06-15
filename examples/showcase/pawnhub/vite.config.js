import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const cloudflareMetaFiles = ['_headers', '_redirects'];

const copyCloudflareMetaFiles = () => ({
  name: 'copy-cloudflare-meta-files',
  closeBundle() {
    for (const fileName of cloudflareMetaFiles) {
      const source = resolve(__dirname, 'public', fileName);
      const destination = resolve(__dirname, 'dist', fileName);
      if (existsSync(source)) {
        copyFileSync(source, destination);
      }
    }
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [copyCloudflareMetaFiles()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        singlePlayer: resolve(__dirname, 'single-player.html'),
      },
    },
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
});
