# Showcase deployment — Cloudflare Pages

Each showcase app is deployed as its own Cloudflare Pages project on its own
subdomain of `browserpod.io`. Every app is a separate origin, so each gets its
own Pages project and custom domain configured in the Cloudflare dashboard.

## Subdomain → app mapping

| Subdomain | Folder | Build command | Output dir |
| --- | --- | --- | --- |
| `nodebooks.browserpod.io` | `browserpod-nodebooks` | `npm run build` | `build` |
| `packagepod.browserpod.io` | `packagepod` | `npm run build` | `dist` |
| `pawnhub.browserpod.io` | `pawnhub` | `npm run build` | `dist` |
| `say-something.browserpod.io` | `say-something` | `npm run build` | `dist` |
| `trapeze.browserpod.io` | `trapeze` | `npm run build` | `dist` |
| `vimamp.browserpod.io` | `vimamp` | `npm run build` | `dist` |
| `wololo.browserpod.io` | `wololo` | `npm run build` | `dist` |

For each project, set the **root directory** to the folder above (the apps live
in a monorepo, so the build runs from inside that subfolder).

`browserpod-nodebooks` is a SvelteKit app using `@sveltejs/adapter-static`; its
output dir is `build`, not `dist`. The rest are plain Vite apps that build to
`dist`.

## Cross-origin headers

Every app ships a `_headers` file that Cloudflare Pages applies to all routes:

```
/*
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: cross-origin
  Content-Security-Policy: frame-ancestors 'self' https://browserpod.io https://*.browserpod.io
```

- **COEP / COOP** make the page cross-origin isolated, which BrowserPod needs
  for `SharedArrayBuffer`.
- **CORP: cross-origin** lets the app's own assets be loaded from another origin.
- **CSP frame-ancestors** lets the app be embedded in an iframe on
  `browserpod.io` and its subdomains (the docs/demos site), while still
  blocking embedding by arbitrary third parties.

For Vite apps the file lives at `public/_headers` (copied to `dist/` on build).
For the SvelteKit app it lives at `static/_headers` (copied to `build/`).

## API key

Every app reads a BrowserPod API key. Six read it at **build time** from
`VITE_BP_APIKEY`, so set that as a build environment variable on the Pages
project. See each app's `.env.example`.

`trapeze` is the exception: it reads the key **server-side** via a Pages
Function (`functions/api/bp-key.js`) from `BP_APIKEY`, so set `BP_APIKEY` (not
`VITE_`-prefixed) as a Pages environment variable. This keeps the key out of the
client bundle.

`vimamp`'s "Ask AI" feature additionally uses an OpenRouter proxy that only runs
in the Vite dev/preview server; it is not wired up on a static Pages deploy.
