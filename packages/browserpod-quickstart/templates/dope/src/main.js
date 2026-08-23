import { BrowserPod } from '@leaningtech/browserpod';
import { dope, gate } from './dope.js';
import { ZNix, validateManifest } from './znix.js';
import { boardCardSVG } from './board.js';
import manifest from './social_swarm.json';

// Boot the pod. VITE_BP_APIKEY comes from .env (see .env.example). The pod
// is the sandbox: everything the swarm asks this node to do runs inside it.
const pod = await BrowserPod.boot({
  apiKey: import.meta.env.VITE_BP_APIKEY,
  storageKey: 'dope-' + (new URLSearchParams(location.search).get('pod') || 'main'),
});

// Join the swarm. The bus is a BroadcastChannel: every tab on this origin
// hears every event. The node announces itself when a portal opens, and
// executes gated jobs. The policy is the bounded verb surface — deny by
// construction.
const { bus, node } = dope(pod, {
  name: 'node-' + Math.random().toString(36).slice(2, 8),
  policy: { allow: ['run'], deny: [] },
});

// The zNix box: a composed, addressed, bounded agent manifest. The board is
// the SVG eyes on it; the inbox is the escalation edge.
const box = new ZNix(manifest);
const boardEl = document.querySelector('#board');
const busEl = document.querySelector('#bus');
const consoleEl = document.querySelector('#console');
const inboxEl = document.querySelector('#inbox');
const statusEl = document.querySelector('#status');

boardEl.innerHTML = boardCardSVG(box, { ok: box.isValid, inbox: box.inbox.length });
const log = (el, line) => { el.textContent += line + '\n'; el.scrollTop = el.scrollHeight; };
const renderInbox = () => {
  inboxEl.textContent = box.inboxStatus().map((i) =>
    `[${i.kind}] ${i.from} · ${i.payload?.verb || i.route || ''}${i.verbs ? ' verbs=' + i.verbs.join(',') : ''}`
  ).join('\n') || '(empty — nothing escalated)';
};
renderInbox();

bus.on((msg) => {
  log(busEl, `[${new Date(msg.ts).toLocaleTimeString()}] ${msg.type} ${msg.node ? '· ' + msg.node : ''}`);
  if (msg.type === 'dope:job:done') log(busEl, '  → ' + JSON.stringify(msg.payload.result));
  if (msg.type === 'dope:job:blocked') log(busEl, '  → BLOCKED: ' + msg.payload.reason);
  // REACT mode: the box listens for swarm events on its pipeline route.
  if (box.triggers.on_bus_event && msg.type === box.triggers.on_bus_event.event) {
    box.trigger('on_bus_event', msg);
    renderInbox();
    boardEl.innerHTML = boardCardSVG(box, { ok: box.isValid, inbox: box.inbox.length });
  }
});

document.querySelector('#spawn').onclick = () => {
  const jobId = node.dispatch('*', 'run', { cmd: 'echo "micro from ' + node.id + '" && node --version' });
  log(busEl, `spawned ${jobId} → run`);
};

document.querySelector('#trigger').onclick = () => {
  const r = box.trigger('on_schedule', { cron: '*/5 * * * *' });
  log(busEl, 'trigger on_schedule → ' + JSON.stringify(r));
  renderInbox();
  boardEl.innerHTML = boardCardSVG(box, { ok: box.isValid, inbox: box.inbox.length });
};

document.querySelector('#resolve').onclick = () => {
  const first = box.inboxStatus()[0];
  if (first) { box.resolveInbox(first.index); log(busEl, 'resolved inbox ' + first.kind); }
  else log(busEl, 'inbox empty');
  renderInbox();
  boardEl.innerHTML = boardCardSVG(box, { ok: box.isValid, inbox: box.inbox.length });
};

document.querySelector('#portal').onclick = () => {
  if (node.portalUrl) { window.open(node.portalUrl, '_blank'); return; }
  log(statusEl, 'no portal yet — start a server in the pod first');
};

// Gate demo: show the bounded surface
log(busEl, 'gate("run") → ' + JSON.stringify(gate('run', {}, { allow: ['run'] })));
log(busEl, 'gate("write") → ' + JSON.stringify(gate('write', {}, { allow: ['run'] })));
log(busEl, 'manifest valid → ' + JSON.stringify(validateManifest(manifest)));
log(statusEl, 'node ' + node.id + ' · zNix ' + box.slug + ' · dope 0.1.0 · pod booted');
