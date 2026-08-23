/**
 * DOPE — Decentralized Orchestration Protocol for Execution.
 *
 * A tiny, zero-dependency protocol layer that makes any BrowserPod app a
 * node in a swarm. Three pillars, each ~30 lines:
 *
 *   1. BUS    — BroadcastChannel swarm comms. Every tab on this origin hears
 *               every micro event. No server, no polling, no setup.
 *   2. GATE   — the token-gate pattern: model output is untrusted input, so
 *               proposed actions execute only behind an explicit allowlist.
 *               Denied by construction, not by review.
 *   3. NODE   — portals are compute nodes. A pod that opens a portal can
 *               register itself as a worker; the coordinator (any tab) can
 *               dispatch jobs to it over the bus.
 *
 * The same architecture runs in production at ATLAS (Zero2oneZ/ATLAS):
 * micro_broadcast bus, token_gate, and a droplet/GPU worker pool. This file
 * is the browser-native distillation of that stack.
 */

export const DOPE_VERSION = '0.1.0';

// ─── 1. BUS — swarm communication ──────────────────────────────────────────
// One BroadcastChannel per app. Events are plain objects with a `type` field;
// anything else is dropped. The channel is the same-origin swarm bus: every
// tab that loaded this app is a member, and members can be pods, coordinators,
// or plain UI tabs.

// import.meta.env is Vite-only; guard so the protocol also runs in plain Node.
const BUS_NAME = 'dope:' + ((import.meta.env && import.meta.env.VITE_DOPE_BUS) || 'default');

export class DopeBus {
  constructor() {
    this.channel = new BroadcastChannel(BUS_NAME);
    this.listeners = new Set();
    this.channel.onmessage = (ev) => {
      const msg = ev.data;
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
      for (const fn of this.listeners) {
        try { fn(msg); } catch (e) { console.error('[dope:bus] listener error', e); }
      }
    };
  }

  /** Subscribe to all bus events. Returns an unsubscribe function. */
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Publish an event to every tab on this origin. */
  emit(type, payload = {}, meta = {}) {
    const msg = { type, payload, ts: Date.now(), node: meta.node || null, ...meta };
    this.channel.postMessage(msg);
    return msg;
  }

  close() { this.channel.close(); }
}

// ─── 2. GATE — bounded verb surface ────────────────────────────────────────
// The gate is a pure function: (verb, payload, policy) → {ok, reason}.
// A policy is a plain object, so it can live in a JSON file, be signed, or
// be shipped from a coordinator. The default policy allows nothing.

const DEFAULT_POLICY = { allow: [], deny: [] };

function matches(rule, verb) {
  if (rule === verb) return true;
  if (rule.endsWith('*')) return verb.startsWith(rule.slice(0, -1));
  return false;
}

export function gate(verb, payload, policy = DEFAULT_POLICY) {
  const allow = policy.allow || [];
  const deny = policy.deny || [];
  if (deny.some((r) => matches(r, verb))) {
    return { ok: false, reason: `verb ${verb} is denied by policy` };
  }
  if (allow.some((r) => matches(r, verb))) {
    return { ok: true };
  }
  return { ok: false, reason: `verb ${verb} is not in the allowlist` };
}

// ─── 3. NODE — portals as compute nodes ─────────────────────────────────────
// A pod that opens a portal becomes a worker. It announces itself on the bus
// with a node id; the coordinator replies with jobs; the worker runs them
// inside the pod and reports results. The pod's own filesystem is the only
// boundary — the gate decides what a job may do.

let nodeSeq = 0;

export class DopeNode {
  /**
   * @param {object} opts
   * @param {import('@leaningtech/browserpod').BrowserPod} opts.pod
   * @param {DopeBus} opts.bus
   * @param {object} [opts.policy]  gate policy for jobs this node accepts
   * @param {string} [opts.name]    node name (defaults to a random id)
   */
  constructor({ pod, bus, policy = DEFAULT_POLICY, name }) {
    this.pod = pod;
    this.bus = bus;
    this.policy = policy;
    this.id = name || `node-${Date.now().toString(36)}-${++nodeSeq}`;
    this.portalUrl = '';
    this.off = bus.on((msg) => this._onMessage(msg));
    pod.onPortal(({ url }) => {
      this.portalUrl = url;
      this._announce();
    });
  }

  _announce() {
    this.bus.emit('dope:node:hello', {
      node: this.id,
      portal: this.portalUrl,
      policy: this.policy,
      version: DOPE_VERSION,
    }, { node: this.id });
  }

  _onMessage(msg) {
    if (msg.type !== 'dope:job' || msg.payload?.node !== this.id) return;
    const { jobId, verb, payload } = msg.payload;
    const verdict = gate(verb, payload, this.policy);
    if (!verdict.ok) {
      this.bus.emit('dope:job:blocked', { jobId, node: this.id, reason: verdict.reason }, { node: this.id });
      return;
    }
    this._run(jobId, verb, payload);
  }

  async _run(jobId, verb, payload) {
    this.bus.emit('dope:job:started', { jobId, node: this.id }, { node: this.id });
    try {
      const result = await this._execute(verb, payload);
      this.bus.emit('dope:job:done', { jobId, node: this.id, result }, { node: this.id });
    } catch (err) {
      this.bus.emit('dope:job:failed', { jobId, node: this.id, error: String(err) }, { node: this.id });
    }
  }

  /** The one verb surface a node executes by default: run a shell line. */
  async _execute(verb, payload) {
    if (verb === 'run') {
      const terminal = await this.pod.createDefaultTerminal(document.createElement('div'));
      const proc = await this.pod.run('bash', ['-lc', String(payload.cmd || '')], { terminal });
      return { exit: proc.exitCode ?? null };
    }
    throw new Error('no executor for verb: ' + verb);
  }

  /** Coordinator side: dispatch a job to a node. */
  dispatch(nodeId, verb, payload) {
    const jobId = 'job-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    this.bus.emit('dope:job', { jobId, node: nodeId, verb, payload }, { node: this.id });
    return jobId;
  }

  close() { this.off(); }
}

// ─── Convenience: one-call setup ───────────────────────────────────────────
// `dope(pod)` returns { bus, node, gate } so a scaffolded app can start
// participating with two lines:
//
//   const pod = await BrowserPod.boot({ apiKey, storageKey });
//   const { bus, node } = dope(pod);

export function dope(pod, opts = {}) {
  const bus = new DopeBus();
  const node = new DopeNode({ pod, bus, ...opts });
  return { bus, node, gate };
}
