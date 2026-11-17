import { defineConfig } from 'vite';

const headers = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin'
};

// https://vitejs.dev/config/
export default defineConfig({
  server: { headers },
  preview: { headers }
});
