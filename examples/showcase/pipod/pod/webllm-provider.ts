import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BRIDGE_DIR = process.env.WEBLLM_BRIDGE_DIR || "/home/user/bridge";
const MODEL_ID = process.env.WEBLLM_MODEL || "Qwen3.5-4B-Q4_K_M";
const CONTEXT = Number(process.env.WEBLLM_CONTEXT || 32768);
const MAX_TOKENS = Number(process.env.WEBLLM_MAX_TOKENS || 4096);
const BASE_URL = "http://webllm.bridge/v1";
const REQUEST_FILE = join(BRIDGE_DIR, "request.json");
const POLL_MS = 40;
const PORTAL_FILE = process.env.PIPOD_PORTAL_FILE || "/home/user/.pipod-portal";
const PORTALS = process.env.PIPOD_PORTALS !== "0";
const REASONING = process.env.WEBLLM_REASONING === "1";

// Condensed from PI.md
const GUIDANCE = [
  "## Your environment",
  "You run inside PiPod: a Linux-like sandbox (BrowserPod) running in the user's browser tab, compiled to WebAssembly. The CPU is effectively Wasm, not x86_64 or arm64.",
  "Available: bash, git, node 22, npm, pnpm, rg, fd, curl, wget, tar, unzip and coreutils. python3 has only its standard library (no pip). There is no Rust or Go toolchain.",
  "`timeout` is broken here: it never runs its command. Use a tool's own time limit instead, for example `curl --max-time 5`.",
  "",
  "## Native npm packages",
  "Packages with native binaries do not run. Before installing, add `overrides` to package.json (for pnpm, in pnpm-workspace.yaml):",
  "- esbuild: \"npm:esbuild-wasm@*\"",
  "- rollup: \"npm:@rollup/wasm-node@*\"",
  "- @parcel/watcher: \"npm:@parcel/watcher-wasm@*\"",
  "Add the esbuild and rollup overrides up front for Vite 7 and earlier. Vite 8.2+ instead needs `@rolldown/binding-wasm32-wasi` in devDependencies, at the installed rolldown version.",
  "Next.js: add `@next/swc-wasm-nodejs` at exactly the `next` version, override @parcel/watcher, and never use Turbopack (use `next dev --webpack` on Next 16+).",
  "Errors mentioning `.node` files, node-gyp, or modules like `@esbuild/linux-x64` mean a native binary: fix them with overrides, not --ignore-scripts.",
  "Avoid sharp, sqlite3, bcrypt and node-sass. Prefer pure-JS packages such as bcryptjs, sass and sql.js.",
  "",
  "## Servers",
  "Never run a server in the foreground or with a plain `&`: the bash tool waits for all output to close, so it would never return.",
  "Start it detached, with output to a log and stdin from /dev/null, then check the log:",
  "`cd /home/user/my-app && nohup npm run dev > /tmp/my-app.log 2>&1 < /dev/null &`",
  "`sleep 3 && tail -20 /tmp/my-app.log`",
  "Bind servers to 0.0.0.0, for example `vite --host 0.0.0.0` or `app.listen(3000, '0.0.0.0')`. Test them inside the pod with `curl -s --max-time 5 http://localhost:PORT`.",
  "Before restarting a server, find it with `ps` and `kill` it so its port is free.",
  ...(PORTALS
    ? [
        "When a server starts listening, a tool result will end with a line like `PiPod portal: port 3000 is live at https://...`.",
        "Give the user that exact URL. Never give them a localhost URL, because it does not work outside the pod.",
        "",
        "## Network",
        "Outbound access is limited to an allowlist that includes the npm registry, github.com and raw.githubusercontent.com (not api.github.com or codeload.github.com). Other hosts fail with ENOTFOUND.",
      ]
    : [
        "Servers have no public URL in this session, so the user cannot open them. Say the server is running inside the pod and show that it responds with curl.",
        "",
        "## Network",
        "npm install works. Other sites only work if they allow requests from a web page (CORS), so most will fail.",
      ]),
].join("\n");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readPortal() {
  try {
    return readFileSync(PORTAL_FILE, "utf-8").trim();
  } catch {
    return "";
  }
}

// Ends with a lone & (not &&)
const BACKGROUNDS = /(^|[^&])&\s*($|[;\n)])/;

function removeRequest(id: string) {
  try {
    const current = JSON.parse(readFileSync(REQUEST_FILE, "utf-8"));
    if (current?.id === id) rmSync(REQUEST_FILE, { force: true });
  } catch {}
}

async function* responses(id: string, signal?: AbortSignal) {
  for (let seq = 0; ; ) {
    if (signal?.aborted) return;
    const file = join(BRIDGE_DIR, `res-${id}-${seq}.json`);
    if (existsSync(file)) {
      let msg: any;
      try {
        msg = JSON.parse(readFileSync(file, "utf-8"));
      } catch {
        await sleep(POLL_MS);
        continue;
      }
      rmSync(file, { force: true });
      seq++;
      yield msg;
      if (msg.done) return;
    } else {
      await sleep(POLL_MS);
    }
  }
}

function bridgeResponse(body: any, signal?: AbortSignal): Response {
  const id = randomUUID();
  mkdirSync(BRIDGE_DIR, { recursive: true });
  const tmp = `${REQUEST_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify({ id, body }));
  renameSync(tmp, REQUEST_FILE);
  signal?.addEventListener("abort", () => removeRequest(id), { once: true });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sse = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        for await (const msg of responses(id, signal)) {
          for (const ev of msg.events || []) sse(ev);
          if (msg.error) sse({ error: { message: msg.error } });
          if (msg.done) {
            if (!body.stream && msg.final) controller.enqueue(enc.encode(JSON.stringify(msg.final)));
            if (body.stream) controller.enqueue(enc.encode("data: [DONE]\n\n"));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        removeRequest(id);
      }
    },
  });

  const type = body.stream ? "text/event-stream" : "application/json";
  return new Response(stream, { status: 200, headers: { "content-type": type } });
}

// Route bridge URLs to files
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
  if (typeof url === "string" && url.startsWith(BASE_URL)) {
    if (!url.startsWith(`${BASE_URL}/chat/completions`)) {
      return new Response(JSON.stringify({ object: "list", data: [{ id: MODEL_ID, object: "model" }] }), {
        headers: { "content-type": "application/json" },
      });
    }
    const raw = init?.body ?? (input instanceof Request ? await input.text() : "{}");
    return bridgeResponse(JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)), init?.signal);
  }
  return realFetch(input, init);
}) as typeof fetch;

export default function (pi: any) {
  pi.on("before_agent_start", async (event: any) => ({
    systemPrompt: `${event.systemPrompt}\n\n${GUIDANCE}`,
  }));

  // Page writes the latest portal
  let portalTimer: ReturnType<typeof setInterval> | undefined;
  pi.on("session_start", async (_event: any, ctx: any) => {
    if (!ctx.hasUI) return;
    let shown = "";
    const show = () => {
      const text = readPortal();
      if (text && text !== shown) ctx.ui.setStatus("pipod-portal", (shown = text));
    };
    clearInterval(portalTimer);
    portalTimer = setInterval(show, 1000);
    portalTimer.unref?.();
    show();
  });
  pi.on("session_shutdown", async () => clearInterval(portalTimer));

  // Tell the model new portals
  let told = readPortal();
  pi.on("tool_result", async (event: any) => {
    let text = readPortal();
    // Portals open just after launch
    if (text === told && event.toolName === "bash" && BACKGROUNDS.test(String(event.input?.command ?? ""))) {
      for (let i = 0; i < 20 && text === told; i++) {
        await sleep(250);
        text = readPortal();
      }
    }
    const match = /^Port (\d+): (\S+)$/.exec(text);
    if (!match || text === told) return;
    told = text;
    const note = `PiPod portal: port ${match[1]} is live at ${match[2]}`;
    return { content: [...(event.content ?? []), { type: "text", text: `\n\n${note}` }] };
  });

  pi.registerProvider("webllm", {
    baseUrl: BASE_URL,
    apiKey: "webllm",
    api: "openai-completions",
    models: [
      {
        id: MODEL_ID,
        name: `${MODEL_ID} (in browser)`,
        reasoning: REASONING,
        input: ["text"],
        contextWindow: CONTEXT,
        maxTokens: MAX_TOKENS,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ],
  });
}
