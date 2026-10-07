import { defineConfig } from "vite";

// For SharedArrayBuffer.
const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  server: { headers: isolation },
  preview: { headers: isolation },
});
