# DOPE Swarm

**DOPE — Decentralized Orchestration Protocol for Execution.** A multi-tab swarm demo on [BrowserPod](https://browserpod.io): every tab that opens this page is a node, portals are compute, and a small gate is the boundary between the swarm and the pod.

This is the browser-native distillation of the production stack at [ATLAS](https://github.com/Zero2oneZ/ATLAS) — its micro_broadcast bus, token gate, and portal/worker pool — reduced to ~150 lines of zero-dependency protocol code that any BrowserPod app can adopt.

## Running it

```sh
npm install
cp .env.example .env   # then set VITE_BP_APIKEY
npm run dev
```

Then **open the page in two tabs**. Each tab boots its own pod, joins the same BroadcastChannel bus, and becomes a node. Hit *spawn micro* in one tab and watch the other tab's bus light up.

## The three pillars

### 1. BUS — swarm communication

One `BroadcastChannel` per app. Every tab on the origin hears every event — no server, no polling, no setup. Events are plain objects with a `type`; anything else is dropped.

```ts
const bus = new DopeBus();
bus.on((msg) => console.log(msg.type, msg.payload));
bus.emit('dope:job', { jobId, node: 'node-abc', verb: 'run', payload: { cmd: 'node --version' } });
```

### 2. GATE — bounded verb surface

The token-gate pattern: model output is untrusted input, so proposed actions execute only behind an explicit allowlist. Denied by construction, not by review. A policy is a plain object — it can live in a JSON file, be signed, or be shipped from a coordinator.

```ts
gate('run', {}, { allow: ['run'] });    // { ok: true }
gate('write', {}, { allow: ['run'] });  // { ok: false, reason: 'verb write is not in the allowlist' }
```

### 3. NODE — portals as compute nodes

A pod that opens a portal announces itself on the bus as a worker. Any tab can dispatch a gated job to it; the node runs it inside the pod and reports the result. The pod's filesystem is the only boundary — the gate decides what a job may do.

```ts
const { bus, node } = dope(pod, { policy: { allow: ['run'], deny: [] } });
node.dispatch('*', 'run', { cmd: 'echo hello' });  // every node runs it
```

## The protocol file

`src/lib/dope/protocol.ts` is the whole protocol — bus, gate, node, and the one-call `dope(pod)` setup. The same protocol ships as the **`dope` quickstart template** (`create-browserpod-quickstart my-app --template dope`), so any app scaffolded from it is preloaded for swarm communication, decentralized compute, and gated execution.

## Notes

- The pod persists per tab (`?pod=<key>` for a second window).
- Jobs are fire-and-forget over the bus today; a coordinator tab can track them by `jobId` (the demo shows the job lifecycle in the bus feed).
- The gate policy is editable live in the demo — try removing `run` from the allowlist and watch jobs get blocked.
