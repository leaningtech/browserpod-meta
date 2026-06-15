import { defineConfig } from 'vite';

const browserPodHeaders = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin'
};

export default defineConfig({
  server: {
    headers: browserPodHeaders
  },
  preview: {
    headers: browserPodHeaders
  }
});
