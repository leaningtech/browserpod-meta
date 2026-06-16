# BrowserPod Nodebooks

A single-page app for running Node.js cells with markdown notes in a live
[BrowserPod](https://browserpod.io) sandbox — a Jupyter-style notebook for
JavaScript. Each code cell runs as a fresh `node` process, but the sandbox
filesystem persists between cells, so files you write in one cell are visible
in the next.

This is a standalone, Node-only version of the Workbooks feature from the
BrowserPod console.

## Setup

```sh
npm install
cp .env.example .env   # then add your BrowserPod API key
npm run dev
```

The app reads your BrowserPod API key from the `VITE_BP_APIKEY` environment
variable. Get a key at https://browserpod.io.

## Usage

- Pick a template to seed a notebook, or start blank.
- Add code or note cells, reorder them, and run cells individually or all at
  once.
- When a cell starts a server, a portal URL appears at the top — open it to
  reach the running app.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run preview` — preview the production build
- `npm run check` — type-check
