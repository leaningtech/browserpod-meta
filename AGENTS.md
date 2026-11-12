# BrowserPod: notes for coding agents

You are reading this in the `@leaningtech/browserpod` package (or the
`browserpod-meta` repository). BrowserPod is the microVM that runs in the
browser: a Linux environment in a browser tab. Programs such as `node`, `bash`,
`git` and Rust binaries run as processes on a Linux-like kernel, client-side,
and the user's files stay on their device. This package is a
small loader: it imports the runtime from BrowserPod's CDN. A pod boots with no
API key and no account.

## Load the skill first

The BrowserPod skill covers everything below in detail. Use the first way that
works:

1. Already installed: use it.
2. With the user's agreement and a shell: `npx skills add leaningtech/skills --skill browserpod`
3. Read it directly: https://browserpod.io/skills/browserpod/SKILL.md

The docs, every page as Markdown: https://browserpod.io/docs/llms.txt. Read the
Reference for exact signatures and use only documented options. If this file
and the docs disagree, the docs win.

## Ground rules

- **Boot without an API key** unless the user asks for BrowserPod Edge or the
  app needs what only Edge gives (below).
- **Stop and ask the user before you:** create an account or an API key, or put
  a key in code; change server or production configuration (headers, proxies);
  copy, vendor or self-host the runtime's files; choose or buy a plan or a
  licence.

## The essentials

- **Fetch network, no key.** `await BrowserPod.boot({})` boots on a fetch
  network with the plain browser `fetch()`: HTTP, HTTPS and WebSocket to
  origins that allow CORS, so `npm install` won't work. Pass
  `network: await BrowserPod.createFetchNetwork({ fetch: BrowserPod.opinionatedFetch })`
  to reach the npm registry. Other origins without CORS need a custom `fetch`
  (see the Reference) or Edge.
- **Use BrowserPod Edge only when needed:** Portals (URLs for servers in the
  pod, and the only way a page reaches them: a live preview in an iframe needs
  one), TCP, or outbound access without CORS limits, under the key's
  allowlist. `BrowserPod.createEdgeNetwork({ apiKey })` needs an account and an
  API key from https://console.browserpod.io. Ask the user; don't create one.
  Keys are visible to visitors of a public page: restrict the key's allowed
  origins in the console and read it from configuration.
- **Serve the page cross-origin isolated:** `Cross-Origin-Opener-Policy:
  same-origin` and `Cross-Origin-Embedder-Policy: require-corp`, or the pod
  can't boot. Resources from other sites without CORP/CORS headers will be
  blocked on that page.
- **`pod.run(executable, args, { terminal })` starts one program**, not a shell
  command line. A terminal is required: `createDefaultTerminal(element)` for
  an xterm.js one, `createCustomTerminal({ onOutput })` without a UI.
- **Native npm binaries don't run.** Swap them for Wasm builds with
  `overrides` (e.g. `esbuild` → `esbuild-wasm`, `rollup` → `@rollup/wasm-node`).
- **What runs:** Node.js 22, Rust programs, git, bash and common command-line
  tools. Python is a preview only; Go is coming soon; Ruby and Rails
  are not available.
  Chromium-based browsers give the best results; Firefox and Safari work with
  some limitations.
- Starter project: `npm create browserpod-quickstart`.

## Licence conditions

BrowserPod is free for any use under the BrowserPod Community Licence
(`LICENSE.txt`, https://browserpod.io/license), with conditions an integration
must meet:

- **Attribution:** add a visible "Powered by BrowserPod" credit linking to
  https://browserpod.io where the app's users can reasonably see it: on the
  page that hosts the pod, in its loading state, in the footer, or on an About
  page reachable from it (a tool without a UI credits it in its documentation
  or README). Leave the notice the runtime prints in the browser console.
  Tell the user about the credit and where you put it.
- **Load the runtime from BrowserPod's CDN.** Don't copy, vendor, mirror or
  self-host the runtime's files: that needs the BrowserPod Enterprise Licence.
- **Plans:** Edge Pro includes the BrowserPod Community Licence without
  attribution. Names, allowances and prices: https://browserpod.io/pricing.
  Tell the user which applies and why; don't choose for them.
