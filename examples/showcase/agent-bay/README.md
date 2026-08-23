# Agent Bay

A mission-driven agent loop inside a [BrowserPod](https://browserpod.io) sandbox. Clone a repo, run a batch of steps against it, and write a verdict log — every mutation goes through a small gate that only allows writes inside the lanes the mission declares.

This is a demo of the "AI Agents environment" use case from the BrowserPod README: untrusted code running loose, isolated from the OS, but with a deterministic capability boundary instead of a free-for-all shell.

## Running it

```sh
npm install
cp .env.example .env   # then set VITE_BP_APIKEY
npm run dev
```

BrowserPod needs `SharedArrayBuffer`, so the page must be cross-origin isolated. `vite.config.ts` sets the COOP/COEP headers for dev and preview; `static/_headers` sets them for the static build.

## How it works

- **mission.json** — the task contract. Picked from the editor, or paste a mission file from anywhere:

  ```json
  {
    "name": "checkout + install + test",
    "clone": { "url": "https://github.com/leaningtech/browserpod-meta", "ref": "main" },
    "locks": ["agent-bay/**"],
    "steps": [
      { "label": "inspect", "run": "ls -la", "store": "listing" },
      { "label": "install", "run": "npm install --no-audit --no-fund" },
      { "label": "test", "run": "npm test || echo \"(no test script)\"" }
    ],
    "verdictPath": "agent-bay/verdicts.md"
  }
  ```

- **clone** — shallow `git clone` of the target repo, into a fresh `/repo`.
- **locks** — the lanes the agent may *write* to, as path prefixes relative to the repo root. Everything else is write-blocked. `.git` / `.jj` are always refused.
- **steps** — bash lines, run in order through `/bin/bash -lc` in `/repo`. A step that fails stops the mission. `@step:N@` in a later step expands to the stdout of step N (when that step set `"store"`).
- **verdicts** — on success, the mission writes `verdicts.md` (append-only style) into the sandbox at `verdictPath`.

## The gate

`src/lib/mission/gate.ts` embeds a small gate script that is installed into the sandbox and runs **before every mutation**: `node gate.js write <json>` refuses writes outside the locked lanes, `mkdir` refuses anything outside the lanes (except the gate's own dir), and `exec` refuses shell lines that try to reach outside the repo (`rm -rf /`, `..` escapes, and so on). The gate is a deterministic allowlist — the agent's capabilities are a bounded verb surface, denied by construction rather than by review.

The same design principle is used in production at [ATLAS](https://github.com/Zero2oneZ/ATLAS) as its token gate: model output is untrusted input, and proposed actions only execute behind an explicit, cheap allowlist check.

## Notes

- The pod persists per tab (`?pod=<key>` for a second window, like bramble).
- Every mission replays cleanly: the runner `rm -rf`s `/repo` first.
- Only public repos work today; the pod's git is unauthenticated.
