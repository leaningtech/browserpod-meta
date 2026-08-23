import { defineConfig } from 'vite';

// BrowserPod needs SharedArrayBuffer, which requires a cross-origin-isolated
// page. The DOPE bus also uses BroadcastChannel (same-origin tabs), so the
// isolation headers are the only server config this template needs.
export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  }
});
