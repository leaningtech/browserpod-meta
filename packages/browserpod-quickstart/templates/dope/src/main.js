import { BrowserPod } from '@leaningtech/browserpod';
import { dope, gate } from './dope.js';

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

// UI
const busEl = document.querySelector('#bus');
const consoleEl = document.querySelector('#console');
const statusEl = document.querySelector('#status');
const log = (el, line) => { el.textContent += line + '\n'; el.scrollTop = el.scrollHeight; };

bus.on((msg) => {
  log(busEl, `[${new Date(msg.ts).toLocaleTimeString()}] ${msg.type} ${msg.node ? '· ' + msg.node : ''}`);
  if (msg.type === 'dope:job:done') log(busEl, '  → ' + JSON.stringify(msg.payload.result));
  if (msg.type === 'dope:job:blocked') log(busEl, '  → BLOCKED: ' + msg.payload.reason);
});

document.querySelector('#spawn').onclick = () => {
  // A micro: a gated job dispatched to every node on the bus.
  const jobId = node.dispatch('*', 'run', { cmd: 'echo "micro from ' + node.id + '" && node --version' });
  log(busEl, `spawned ${jobId} → run`);
};

document.querySelector('#portal').onclick = () => {
  if (node.portalUrl) { window.open(node.portalUrl, '_blank'); return; }
  log(statusEl, 'no portal yet — start a server in the pod first');
};

// Gate demo: show the bounded surface
log(busEl, 'gate("run") → ' + JSON.stringify(gate('run', {}, { allow: ['run'] })));
log(busEl, 'gate("write") → ' + JSON.stringify(gate('write', {}, { allow: ['run'] })));
log(statusEl, 'node ' + node.id + ' · dope 0.1.0 · pod booted');
