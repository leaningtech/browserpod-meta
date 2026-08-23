# DOPE Swarm

**DOPE — Decentralized Orchestration Protocol for Execution.** A multi-tab swarm demo on [BrowserPod](https://browserpod.io): every tab that opens this page is a node, portals are compute, a small gate is the boundary between the swarm and the pod, and a **zNix** manifest is the box the swarm works inside.

This is the browser-native distillation of the production stack at [ATLAS](https://github.com/Zero2oneZ/ATLAS) — its micro_broadcast bus, token gate, and portal/worker pool — plus the [zNix manifest runtime](https://github.com/Zero2oneZ/niXstring-zNix-z3) (composed · addressed · bounded), reduced to a few hundred lines of zero-dependency protocol code any BrowserPod app can adopt.

## Running it

```sh
npm install
cp .env.example .env   # then set VITE_BP_APIKEY
npm run dev
```

Then **open the page in two tabs**. Each tab boots its own pod, joins the same BroadcastChannel bus, and becomes a node. Hit *spawn micro* in one tab and watch the other tab's bus light up. The page ships a `social-swarm-demo` zNix: fire the schedule trigger, watch `swarm.publish` pause in the Inbox, then resolve it — that's the bounded edge working.

## The stack

### 1. BUS — swarm communication

One `BroadcastChannel` per app. Every tab on the origin hears every event — no server, no polling, no setup.

```ts
const bus = new DopeBus();
bus.on((msg) => console.log(msg.type, msg.payload));
```

### 2. GATE — bounded verb surface

The token-gate pattern: proposed actions execute only behind an explicit allowlist. Denied by construction, not by review. The demo's policy is editable live — remove `run` from the allowlist and jobs get blocked in front of you.

```ts
gate('run', {}, { allow: ['run'] });    // { ok: true }
gate('write', {}, { allow: ['run'] });  // { ok: false, reason: 'verb write is not in the allowlist' }
```

### 3. NODE — portals as compute nodes

A pod that opens a portal announces itself on the bus as a worker. Any tab can dispatch a gated job to it; the node runs it inside the pod and reports the result.

```ts
const { bus, node } = dope(pod, { policy: { allow: ['run'], deny: [] } });
node.dispatch('*', 'run', { cmd: 'echo hello' });  // every node runs it
```

### 4. ZNIX — the bounded agent box

A zNix is a **composition** of heterogeneous compute (agents/services/schedules/pipelines), **addressed** behind one slug+endpoint, and **bounded** by a fixed verb toolset — at the edge it **escalates to the Inbox** instead of improvising. `src/lib/dope/znix.ts` is the browser port of the zNix manifest runtime; `board.ts` renders any manifest as the portable SVG behavior card you see on the page.

```ts
const box = new ZNix(socialManifest);
box.trigger('on_schedule', { cron: '*/5 * * * *' });
// swarm.publish is in require_confirm → the run pauses, Inbox gets an item.
box.resolveInbox(0);
```

## The protocol files

`src/lib/dope/protocol.ts` is the whole DOPE protocol — bus, gate, node, and the one-call `dope(pod)` setup. `znix.ts` is the box. Both ship as the **`dope` quickstart template** (`create-browserpod-quickstart my-app --template dope`), so any app scaffolded from it is preloaded for swarm communication, decentralized compute, gated execution — and a zNix manifest box with SVG board.

## Notes

- The pod persists per tab (`?pod=<key>` for a second window).
- Jobs are fire-and-forget over the bus today; a coordinator tab can track them by `jobId` (the demo shows the job lifecycle in the bus feed).
- The gate policy and the zNix manifest are plain JSON — swap the manifest file to ship a different box without touching code.
