import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "esnext",
    rollupOptions: {
      input: {
        main: "./index.html",
        docs: "./docs.html",
      },
    },
  },
  optimizeDeps: { esbuildOptions: { target: "esnext" } },
  server: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
});
