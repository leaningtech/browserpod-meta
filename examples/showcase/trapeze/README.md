# Trapeze PDF Studio

BrowserPod-backed PDF editing studio with a static Vite launcher and an inner Node app that boots inside a BrowserPod workspace.

## Local development

1. Install dependencies:

```bash
npm install
```

2. Create a local env file from the example and set your BrowserPod API key:

```bash
cp .env.example .env
```

3. Start the launcher:

```bash
npm run dev
```

The inner editor server is not run locally on your machine. The launcher copies the files in `public/project` into the BrowserPod workspace and runs `npm install` plus `node main.js` inside the pod when you click `Launch Studio`.

## Git-ready structure

- Generated output is ignored via `.gitignore`.
- The vendored inner `node_modules` directory is intentionally excluded.
- The inner app lockfile is copied into the pod so installs are repeatable.

## Cloudflare Pages

This project is prepared for Cloudflare Pages static hosting:

- `wrangler.toml` points Pages at `dist`.
- `public/_headers` sets `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`, which BrowserPod needs in production.
- The required build-time environment variable is `VITE_BP_APIKEY`.

### Build

```bash
npm run build
```

### Preview with Wrangler

```bash
npm run pages:dev
```

### Deploy

```bash
npm run pages:deploy
```

You can also connect the repo directly in the Cloudflare dashboard and use:

- Build command: `npm run build`
- Build output directory: `dist`
- Environment variable: `VITE_BP_APIKEY`
