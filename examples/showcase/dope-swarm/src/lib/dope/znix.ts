/**
 * zNix — the bounded agent box.
 *
 * A zNix is a composition of heterogeneous computation — agents, services,
 * schedules, pipelines — wired into explicit routes, published behind one
 * address, and released to run within a fixed toolset. At the edge it
 * escalates to the Inbox instead of improvising.
 *
 * Browser-native port of the zNix manifest runtime
 * (github.com/Zero2oneZ/niXstring-zNix-z3): same validation rules, same
 * trigger/pipeline/inbox semantics, zero dependencies. A manifest is a plain
 * JSON file, so it can be checked into a repo, fetched from a URL, or shipped
 * from a coordinator.
 *
 * This is the orchestration layer that sits ON TOP of the DOPE protocol
 * (protocol.ts): DOPE is the transport (bus/gate/node), zNix is the box
 * (manifest/triggers/inbox).
 */

export interface ZNixManifest {
	id: string;
	version: string;
	owner: string;
	scope: string;
	modes: string[];
	address: { slug: string; endpoint: string };
	composition: Record<string, Array<Record<string, unknown>>>;
	toolset: { verbs: string[]; max_autonomy?: boolean; escalate_to: string };
	routes?: Record<string, string>;
	triggers?: Record<string, Record<string, string>>;
	inbox_rules?: { auto_approve?: string[]; require_confirm?: string[] };
	[key: string]: unknown;
}

const REQUIRED_FIELDS: Array<keyof ZNixManifest> = [
	'id',
	'version',
	'owner',
	'scope',
	'modes',
	'address',
	'composition',
	'toolset'
];
const COMPOSITION_KINDS = ['agents', 'services', 'schedules', 'pipelines', 'interfaces', 'files'];

export function validateManifest(m: unknown): { ok: boolean; errors: string[] } {
	const errors: string[] = [];
	if (!m || typeof m !== 'object') return { ok: false, errors: ['manifest must be an object'] };
	const manifest = m as ZNixManifest;
	for (const key of REQUIRED_FIELDS) {
		if (manifest[key] == null) errors.push(`missing required field: ${String(key)}`);
	}
	if (errors.length) return { ok: false, errors };

	const { address, composition, toolset, modes } = manifest;
	if (!address?.slug) errors.push('address.slug is required');
	if (!address?.endpoint) errors.push('address.endpoint is required');

	const kinds = COMPOSITION_KINDS.filter((k) => (composition?.[k] || []).length > 0);
	if (kinds.length < 2) errors.push(`zNix must be COMPOSED: at least 2 distinct compute kinds, found ${kinds.length}`);

	if (!toolset?.verbs || toolset.verbs.length === 0) errors.push('toolset.verbs is required and must not be empty');
	if (!toolset?.escalate_to) errors.push('toolset.escalate_to is required');
	if (!modes || modes.length === 0) errors.push('modes must contain CREATE or REACT');

	return { ok: errors.length === 0, errors };
}

export interface InboxItem {
	kind: string;
	from: string;
	id: string;
	payload: Record<string, unknown>;
	verbs?: string[];
	route?: string;
	index: number;
}

export interface TriggerResult {
	ok: boolean;
	runId?: string;
	route?: string;
	blocked?: boolean;
	step?: string;
	pending?: boolean;
	verbs?: string[];
	inbox?: number;
	error?: string;
}

export class ZNix {
	readonly manifest: ZNixManifest;
	readonly id: string;
	readonly slug: string;
	readonly endpoint: string;
	readonly owner: string;
	readonly scope: string;
	readonly modes: string[];
	readonly verbs: string[];
	readonly escalateTo: string;
	readonly routes: Record<string, string>;
	readonly triggers: Record<string, Record<string, string>>;
	readonly inboxRules: { auto_approve?: string[]; require_confirm?: string[] };
	readonly composition: Record<string, Record<string, unknown>[]>;
	inbox: InboxItem[] = [];

	constructor(manifest: ZNixManifest) {
		const v = validateManifest(manifest);
		if (!v.ok) throw new Error('invalid zNix manifest: ' + v.errors.join('; '));
		this.manifest = manifest;
		this.id = manifest.id;
		this.slug = manifest.address.slug;
		this.endpoint = manifest.address.endpoint;
		this.owner = manifest.owner;
		this.scope = manifest.scope;
		this.modes = manifest.modes;
		this.verbs = manifest.toolset.verbs;
		this.escalateTo = manifest.toolset.escalate_to;
		this.routes = manifest.routes || {};
		this.triggers = manifest.triggers || {};
		this.inboxRules = manifest.inbox_rules || {};
		this.composition = (manifest.composition || {}) as Record<string, Record<string, unknown>[]>;
	}

	get isValid(): boolean {
		const kinds = COMPOSITION_KINDS.filter((k) => (this.composition[k] || []).length > 0);
		return kinds.length >= 2 && Boolean(this.slug) && this.verbs.length > 0;
	}

	compositionSummary(): { kinds: string[]; count: number } {
		const kinds = COMPOSITION_KINDS.filter((k) => (this.composition[k] || []).length > 0);
		return { kinds, count: kinds.reduce((n, k) => n + (this.composition[k] || []).length, 0) };
	}

	/** Bounded dispatch: a pipeline step runs only if a toolset verb names it. */
	trigger(name: string, payload: Record<string, unknown> = {}): TriggerResult {
		const t = this.triggers[name];
		if (!t) return { ok: false, error: `trigger not defined: ${name}` };
		const route = t.route;
		const pipeline = (this.composition.pipelines || []).find((p) => (p.name as string) === route);
		const runId = 'run-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);

		if (pipeline) {
			const blockedStep = (pipeline.steps as string[]).find((step) => {
				return !this.verbs.some((v) => v === step || v.endsWith('.' + step));
			});
			if (blockedStep) {
				this.inbox.push({
					kind: 'verb_blocked',
					from: name,
					id: runId,
					route,
					payload: { trigger: name, verb: blockedStep },
					index: this.inbox.length
				});
				return { ok: false, runId, blocked: true, step: blockedStep, inbox: this.inbox.length };
			}
		}

		const pending = (this.inboxRules.require_confirm || []).filter((v) => this.verbs.includes(v));
		if (pending.length) {
			this.inbox.push({
				kind: 'confirm_required',
				from: name,
				id: runId,
				route,
				payload,
				verbs: pending,
				index: this.inbox.length
			});
			return { ok: false, runId, pending: true, verbs: pending, inbox: this.inbox.length };
		}

		return { ok: true, runId, route };
	}

	inboxStatus(): InboxItem[] {
		return this.inbox;
	}

	resolveInbox(index: number): boolean {
		const i = this.inbox.findIndex((item) => item.index === index);
		if (i === -1) return false;
		this.inbox.splice(i, 1);
		// Re-index so the indexes stay dense.
		this.inbox.forEach((item, n) => (item.index = n));
		return true;
	}
}
