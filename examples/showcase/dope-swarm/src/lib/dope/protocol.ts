/**
 * DOPE — Decentralized Orchestration Protocol for Execution.
 *
 * The browser-native distillation of the ATLAS swarm stack (Zero2oneZ/ATLAS):
 * micro_broadcast bus, token_gate, and a portal/worker pool. Three pillars:
 *
 *   1. BUS    — BroadcastChannel swarm comms. Every tab on this origin hears
 *               every micro event. No server, no polling, no setup.
 *   2. GATE   — the token-gate pattern: model output is untrusted input, so
 *               proposed actions execute only behind an explicit allowlist.
 *               Denied by construction, not by review.
 *   3. NODE   — portals are compute nodes. A pod that opens a portal registers
 *               itself as a worker; any tab can dispatch gated jobs to it.
 *
 * This file is the same protocol as the `dope` quickstart template
 * (packages/browserpod-quickstart/templates/dope/src/dope.js), typed for the
 * showcase. Keep the two in sync when the protocol evolves.
 */

import type { BrowserPod } from '@leaningtech/browserpod';

export const DOPE_VERSION = '0.1.0';

// ─── 1. BUS — swarm communication ──────────────────────────────────────────

// import.meta.env is Vite-only; guard so the protocol also runs in plain Node.
const BUS_NAME = 'dope:' + ((import.meta.env && import.meta.env.VITE_DOPE_BUS) || 'default');

export interface DopeMessage {
	type: string;
	payload: Record<string, unknown>;
	ts: number;
	node: string | null;
}

export class DopeBus {
	readonly channel: BroadcastChannel;
	private listeners = new Set<(msg: DopeMessage) => void>();

	constructor() {
		this.channel = new BroadcastChannel(BUS_NAME);
		this.channel.onmessage = (ev) => {
			const msg = ev.data as DopeMessage;
			if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
			for (const fn of this.listeners) {
				try {
					fn(msg);
				} catch (e) {
					console.error('[dope:bus] listener error', e);
				}
			}
		};
	}

	/** Subscribe to all bus events. Returns an unsubscribe function. */
	on(fn: (msg: DopeMessage) => void): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	/** Publish an event to every tab on this origin. */
	emit(type: string, payload: Record<string, unknown> = {}, meta: { node?: string | null } = {}): DopeMessage {
		const msg: DopeMessage = { type, payload, ts: Date.now(), node: meta.node ?? null };
		this.channel.postMessage(msg);
		return msg;
	}

	close(): void {
		this.channel.close();
	}
}

// ─── 2. GATE — bounded verb surface ────────────────────────────────────────

export interface GatePolicy {
	/** Verbs allowed, e.g. ['run', 'read:*']. A trailing `*` is a prefix match. */
	allow: string[];
	/** Verbs refused even if allowed. Deny wins. */
	deny: string[];
}

export const DEFAULT_POLICY: GatePolicy = { allow: [], deny: [] };

export type GateVerdict = { ok: true } | { ok: false; reason: string };

function matches(rule: string, verb: string): boolean {
	if (rule === verb) return true;
	if (rule.endsWith('*')) return verb.startsWith(rule.slice(0, -1));
	return false;
}

export function gate(verb: string, _payload: unknown, policy: GatePolicy = DEFAULT_POLICY): GateVerdict {
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

export interface DopeNodeOptions {
	pod: BrowserPod;
	bus: DopeBus;
	policy?: GatePolicy;
	name?: string;
	/** Executor for a verb. Defaults to `run` → bash -lc in the pod. */
	executor?: (verb: string, payload: Record<string, unknown>) => Promise<unknown>;
}

let nodeSeq = 0;

export class DopeNode {
	readonly id: string;
	readonly pod: BrowserPod;
	readonly bus: DopeBus;
	readonly policy: GatePolicy;
	portalUrl = '';
	private off: () => void;
	private executor: (verb: string, payload: Record<string, unknown>) => Promise<unknown>;

	constructor({ pod, bus, policy = DEFAULT_POLICY, name, executor }: DopeNodeOptions) {
		this.pod = pod;
		this.bus = bus;
		this.policy = policy;
		this.id = name || `node-${Date.now().toString(36)}-${++nodeSeq}`;
		this.executor = executor ?? this._defaultExecutor.bind(this);
		this.off = bus.on((msg) => this._onMessage(msg));
		pod.onPortal(({ url }) => {
			this.portalUrl = url;
			this._announce();
		});
	}

	private _announce(): void {
		this.bus.emit(
			'dope:node:hello',
			{ node: this.id, portal: this.portalUrl, policy: this.policy, version: DOPE_VERSION },
			{ node: this.id }
		);
	}

	private _onMessage(msg: DopeMessage): void {
		if (msg.type !== 'dope:job' || msg.payload?.node !== this.id) return;
		const { jobId, verb, payload } = msg.payload as { jobId: string; verb: string; payload: Record<string, unknown> };
		const verdict = gate(verb, payload, this.policy);
		if (!verdict.ok) {
			this.bus.emit('dope:job:blocked', { jobId, node: this.id, reason: verdict.reason }, { node: this.id });
			return;
		}
		this._run(jobId, verb, payload);
	}

	private async _run(jobId: string, verb: string, payload: Record<string, unknown>): Promise<void> {
		this.bus.emit('dope:job:started', { jobId, node: this.id }, { node: this.id });
		try {
			const result = await this.executor(verb, payload);
			this.bus.emit('dope:job:done', { jobId, node: this.id, result }, { node: this.id });
		} catch (err) {
			this.bus.emit('dope:job:failed', { jobId, node: this.id, error: String(err) }, { node: this.id });
		}
	}

	/** The one verb surface a node executes by default: run a shell line. */
	private async _defaultExecutor(verb: string, payload: Record<string, unknown>): Promise<unknown> {
		if (verb === 'run') {
			const terminal = await this.pod.createDefaultTerminal(document.createElement('div'));
			const proc = await this.pod.run('bash', ['-lc', String(payload.cmd || '')], { terminal });
			return { exit: (proc as { exitCode?: number }).exitCode ?? null };
		}
		throw new Error('no executor for verb: ' + verb);
	}

	/** Coordinator side: dispatch a job to a node. Returns the job id. */
	dispatch(nodeId: string, verb: string, payload: Record<string, unknown>): string {
		const jobId = 'job-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
		this.bus.emit('dope:job', { jobId, node: nodeId, verb, payload }, { node: this.id });
		return jobId;
	}

	close(): void {
		this.off();
	}
}

// ─── Convenience: one-call setup ───────────────────────────────────────────

export function dope(pod: BrowserPod, opts: Omit<DopeNodeOptions, 'pod' | 'bus'> = {}): {
	bus: DopeBus;
	node: DopeNode;
	gate: typeof gate;
} {
	const bus = new DopeBus();
	const node = new DopeNode({ pod, bus, ...opts });
	return { bus, node, gate };
}
