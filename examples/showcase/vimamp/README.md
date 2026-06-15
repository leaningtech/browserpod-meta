# VimAmp

VimAmp runs `vim-wasm` in the browser with BrowserPod-backed project files under `/vimamp`.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env`:

```txt
VITE_BP_APIKEY=your_key_here
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=acree-ai/acree-trinity-mini:free
```

3. Start locally:

```bash
npm run dev
```

## Runtime

- Entry options: `Open Editor` or `Learn Vim`.
- Entry Help menu includes `Ask AI` and `Docs`.
- Docs page route: `/docs.html`.
- BrowserPod boots when API key + cross-origin isolation are available.
- Editor defaults to `/vimamp/note.txt`.
- Learn mode uses `/vimamp/vim-training.txt`.
- `:BPSave` syncs the active Vim buffer to BrowserPod.

## Terminal

- Toggle terminal from View menu or shortcut.
- Supported shell commands include:
  - `help`, `pwd`, `cd`, `ls`, `cat`, `open`, `save`, `mkdir`, `touch`, `mv`, `rm`
  - `npm ...`
  - `node <file.js>`
- `node -e` and `npm exec` are intentionally blocked in this UI command path.

## Notes

- `vite.config.js` sets COOP/COEP headers required by `vim-wasm`.
- If BrowserPod is unavailable, Vim still runs in standalone mode.
