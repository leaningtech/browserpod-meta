# PawnHub

## Cloudflare Pages

This repo is ready to deploy to Cloudflare Pages as a static site.

Use these Pages settings:

- Build command: `npm run build`
- Build output directory: `dist`

Environment variables:

- `VITE_BP_APIKEY`
  Required if you want `Multiplayer Online` to be available.
  Single-player works without it.

Notes:

- `.node-version` pins the Cloudflare Pages build image to Node `22.16.0`.
- `public/_headers` adds `Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy`, matching the local Vite dev server headers this app already relies on.
- Cloudflare Pages will serve `single-player.html` at `/single-player` automatically.
