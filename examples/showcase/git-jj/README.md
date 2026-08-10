# bramble

A browser repo explorer. Clone a public repository with **git** or **jj**, then browse and edit its working tree in Monaco. No build step and no dev server: clone, explore, edit, save.

Everything runs inside a [BrowserPod](https://browserpod.io) sandbox. The clone is a real `git clone` or `jj git clone` running as a subprocess in the pod, edits are written back to the pod's filesystem, and that filesystem is persisted in IndexedDB, so a reload drops you back into the checkout you left.

## Running it

```sh
npm install
cp .env.example .env   # then set VITE_BP_APIKEY
npm run dev
```

BrowserPod needs `SharedArrayBuffer`, so the page must be cross-origin isolated. `vite.config.ts` sets the COOP and COEP headers for dev and preview, `static/_headers` sets them for the static build. The clone screen reports `crossOriginIsolated: true` when they are in place.

`npm run build` writes a static site to `dist/`, `npm run check` runs svelte-check.

## Structure

```text
src/lib/
  pod/boot.ts           boot or reopen the pod; BrowserPod is imported dynamically, client only
  pod/run.ts            run a subprocess, stream its output, recover an exit code
  pod/fs.ts             read and write files, plus mkdir, rename, delete, recursive list
  vcs/index.ts          VcsBackend, implemented for git and jj
  workspace.ts          clone and reopen, and the localStorage pointer to the last checkout
  session.svelte.ts     runes store: pod, workdir, tree, tabs, active file, dirty
  editor/               Monaco setup and per filetype glyphs
  components/           CloneScreen, Workbench, FileTree, EditorPane
```

A few things worth knowing before changing the pod layer. `pod.run` exposes no exit status, so `run()` wraps commands in `bash -c` and parses a marker line carrying `$?`. The file API has no `readdir`, so the tree comes from two pruned `find` passes, and rename and delete run `mv` and `rm -rf`. Clones land in a staging directory and are only moved into place once they succeed, so a failed clone leaves the previous checkout alone.

`reference/browsercode` is a read-only checkout of browsercode, kept as the source for the pod plumbing this app adapts. It is gitignored, excluded from `tsconfig.json` and the Vite watcher, and Tailwind's scanner is pinned to `src/`. One wrinkle: svelte-check globs the whole project for `svelte.config.js`, finds the ones inside that checkout, and prints warnings while loading their Vite configs; the check itself still only covers `src/`.
