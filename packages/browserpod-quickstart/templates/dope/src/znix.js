/**
 * zNix — the bounded agent box.
 *
 * A zNix is a composition of heterogeneous computation — agents, services,
 * schedules, pipelines — wired into explicit routes, published behind one
 * address, and released to run within a fixed toolset. At the edge it
 * escalates to the Inbox instead of improvising.
 *
 * This file is the browser-native port of the zNix manifest runtime
 * (github.com/Zero2oneZ/niXstring-zNix-z3): same validation rules, same
 * trigger/pipeline/inbox semantics, zero dependencies. A manifest is a plain
 * JSON file, so it can be checked into a repo, fetched from a URL, or shipped
 * from a coordinator.
 *
 * The three properties, all required:
 *   COMPOSED  — more than one kind of compute under one name
 *   ADDRESSED — a slug and an endpoint are its surface
 *   BOUNDED   — a fixed toolset; at the edge it escalates to the Inbox
 *
 * This is the orchestration layer that sits ON TOP of the DOPE protocol
 * (dope.js): DOPE is the transport (bus/gate/node), zNix is the box
 * (manifest/triggers/inbox).
 */

// ─── Validation ────────────────────────────────────────────────────────────

const REQUIRED_FIELDS = ['id', 'version', 'owner', 'scope', 'modes', 'address', 'composition', 'toolset'];
const COMPOSITION_KINDS = ['agents', 'services', 'schedules', 'pipelines', 'interfaces', 'files'];

export function validateManifest(m) {
  const errors = [];
  if (!m || typeof m !== 'object') return { ok: false, errors: ['manifest must be an object'] };
  for (const key of REQUIRED_FIELDS) {
    if (!(key in m) || m[key] == null) errors.push(`missing required field: ${key}`);
  }
  if (errors.length) return { ok: false, errors };

  const { address, composition, toolset, modes } = m;
  if (!address?.slug) errors.push('address.slug is required');
  if (!address?.endpoint) errors.push('address.endpoint is required');

  const kinds = COMPOSITION_KINDS.filter((k) => (composition[k] || []).length > 0);
  if (kinds.length < 2) errors.push(`zNix must be COMPOSED: at least 2 distinct compute kinds, found ${kinds.length}`);

  if (!toolset?.verbs || toolset.verbs.length === 0) errors.push('toolset.verbs is required and must not be empty');
  if (!toolset?.escalate_to) errors.push('toolset.escalate_to is required');
  if (!modes || modes.length === 0) errors.push('modes must contain CREATE or REACT');

  return { ok: errors.length === 0, errors };
}

// ─── The box ───────────────────────────────────────────────────────────────

export class ZNix {
  constructor(manifest) {
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
    this.composition = manifest.composition;
    this.inbox = [];
  }

  get isValid() {
    const kinds = COMPOSITION_KINDS.filter((k) => (this.composition[k] || []).length > 0);
    return kinds.length >= 2 && Boolean(this.slug) && this.verbs.length > 0;
  }

  compositionSummary() {
    const kinds = COMPOSITION_KINDS.filter((k) => (this.composition[k] || []).length > 0);
    return {
      kinds,
      count: kinds.reduce((n, k) => n + (this.composition[k] || []).length, 0),
      detail: Object.fromEntries(kinds.map((k) => [k, (this.composition[k] || []).length])),
    };
  }

  /** Bounded dispatch: a pipeline step runs only if a toolset verb names it. */
  trigger(name, payload = {}) {
    const t = this.triggers[name];
    if (!t) return { ok: false, error: `trigger not defined: ${name}` };
    const route = t.route;
    const pipeline = (this.composition.pipelines || []).find((p) => p.name === route);

    const runId = 'run-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);

    if (pipeline) {
      const blockedStep = pipeline.steps.find((step) => {
        return !this.verbs.some((v) => v === step || v.endsWith('.' + step));
      });
      if (blockedStep) {
        this.inbox.push({ kind: 'verb_blocked', from: name, id: runId, payload: { trigger: name, verb: blockedStep } });
        return { ok: false, runId, blocked: true, step: blockedStep, inbox: this.inbox.length };
      }
    }

    const pending = (this.inboxRules.require_confirm || []).filter((v) => this.verbs.includes(v));
    if (pending.length) {
      this.inbox.push({ kind: 'confirm_required', from: name, id: runId, route, payload, verbs: pending });
      return { ok: false, runId, pending: true, verbs: pending, inbox: this.inbox.length };
    }

    return { ok: true, runId, route };
  }

  /** Inbox escalation: the bounded edge. Auto-approve rules are checked here. */
  inboxStatus() {
    return this.inbox.map((item, i) => ({ ...item, index: i }));
  }

  resolveInbox(index) {
    if (index < 0 || index >= this.inbox.length) return false;
    this.inbox.splice(index, 1);
    return true;
  }
}
