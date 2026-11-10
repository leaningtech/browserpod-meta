# BrowserPod: notes for coding agents

You are reading this in the `@leaningtech/browserpod` package (or the
`browserpod-meta` repository). BrowserPod runs Linux applications in a browser
tab, client-side: Node.js 22 and Rust programs, with bash, git, npm and other
command-line tools, on a WebAssembly kernel. This package is a small loader: it
imports the runtime from BrowserPod's CDN.

## Load the skill first

The BrowserPod skill covers everything below in detail. Use the first way that
works:

1. Already installed: use it.
2. With the user's agreement and a shell: `npx skills add leaningtech/skills --skill browserpod`
3. Read it directly: https://browserpod.io/skills/browserpod/SKILL.md

The docs, every page as Markdown: https://browserpod.io/docs/llms.txt. If this
file and the docs disagree, the docs win.

## The essentials

- **No API key is needed.** `await BrowserPod.boot({})` boots a pod on a fetch
  network: outgoing requests go through the browser's `fetch()`, so CORS
  applies. For `npm install` in the pod, pass
  `network: await BrowserPod.createFetchNetwork({ fetch: BrowserPod.opinionatedFetch })`.
- **Use BrowserPod Edge only when needed:** Portals (public URLs for servers in
  the pod), TCP, or outbound access without CORS limits. It needs an account
  and an API key from https://console.browserpod.io. Ask the user; don't create
  one.
- **Serve the page cross-origin isolated:** `Cross-Origin-Opener-Policy:
  same-origin` and `Cross-Origin-Embedder-Policy: require-corp`, or the pod
  can't boot.
- **`pod.run(executable, args, { terminal })` starts one program**, not a shell
  command line. A terminal is required (`createDefaultTerminal`).
- **Native npm binaries don't run.** Swap them for Wasm builds with
  `overrides` (e.g. `esbuild` → `esbuild-wasm`, `rollup` → `@rollup/wasm-node`).
- Python is a preview; Go and Ruby are not available. Chromium-based browsers
  are the reliable target.

## Licence conditions

BrowserPod is free for any use under the BrowserPod Community Licence
(`LICENSE.txt`, https://browserpod.io/license), with conditions an integration
must meet:

- **Attribution:** a visible "Powered by BrowserPod" credit linking to
  https://browserpod.io on the page that hosts the pod. A headless tool credits
  BrowserPod in its README or docs. Add it, and tell the user.
- **Load the runtime from BrowserPod's CDN.** Don't copy, vendor, mirror or
  self-host the runtime's files: that needs an Enterprise licence.
- Plans and prices: https://browserpod.io/pricing. Tell the user which applies;
  don't choose for them.
