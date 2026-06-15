import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5174,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  build: {
    minify: false
  }
})
