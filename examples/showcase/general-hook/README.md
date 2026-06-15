# General Hook

General Hook is a browser-based mock API and webhook tool built with BrowserPod.

It lets you:

- create mock API routes manually
- upload existing API definitions and convert them into routes
- generate OpenAPI YAML from scratch
- run a webhook receiver with a public URL

The UI uses a ZX Spectrum-inspired visual style, including the loading overlay shown when a server boots.

## Project Structure

The application now lives at the repository root.

Key paths:

- `src/main.js` for app state, startup flow, and UI logic
- `src/openapi.js` for import/export parsing and OpenAPI generation
- `src/style.css` for the Spectrum-themed UI
- `public/project/` for the generated mock server runtime
- `public/webhook/` for the webhook receiver runtime
- `docs.html` for the in-app docs page

## Requirements

- Node.js 18+ recommended
- npm
- a BrowserPod API key

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Create an env file from the example:

```bash
cp .env.example .env
```

3. Add your BrowserPod API key:

```bash
VITE_BP_APIKEY=your_key_here
```

4. Start the dev server:

```bash
npm run dev
```

5. Build for production:

```bash
npm run build
```

## Available Scripts

From the repository root:

- `npm run dev` starts the Vite dev server
- `npm run build` creates a production build in `dist/`
- `npm run preview` serves the production build locally

## Git Readiness

This repository already contains a `.git` directory at the root.

To keep the first commit clean, the root `.gitignore` excludes:

- `node_modules/`
- build output such as `dist/`
- local env files
- macOS metadata like `.DS_Store`

Recommended next steps:

```bash
git status
git add .
git commit -m "Initial project import"
```

## Notes

- The app expects `VITE_BP_APIKEY` at build/runtime through Vite env handling.
- `node_modules/` and `dist/` should not be committed.
