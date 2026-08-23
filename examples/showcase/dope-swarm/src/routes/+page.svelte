<script lang="ts">
	import { onMount } from 'svelte';
	import { bootPod } from '$lib/dope/boot';
	import { dope, gate, DOPE_VERSION, type DopeMessage } from '$lib/dope/protocol';
	import { ZNix, type InboxItem } from '$lib/dope/znix';
	import { boardCardSVG } from '$lib/dope/board';
	import socialManifest from '$lib/dope/social_swarm.json';

	let pod: import('@leaningtech/browserpod').BrowserPod | null = null;
	let bootError = '';
	let booting = false;
	let nodeId = '';
	let portalUrl = '';
	let events: DopeMessage[] = [];
	let jobs: Record<string, string> = {}; // jobId → status
	let policyText = JSON.stringify({ allow: ['run'], deny: [] }, null, 2);
	let policyError = '';

	// The zNix box: composed, addressed, bounded. Its board is the SVG eyes
	// on it; its inbox is the escalation edge where publishes pause.
	const box = new ZNix(socialManifest as never);
	let boardSvg = boardCardSVG(box, { ok: box.isValid, inbox: box.inbox.length });
	let inboxItems: InboxItem[] = box.inboxStatus();

	function fireTrigger(name: string, payload: Record<string, unknown> = {}) {
		const r = box.trigger(name, payload);
		events = [
			...events,
			{ type: 'znix:trigger', payload: { trigger: name, ...r }, ts: Date.now(), node: nodeId || 'local' }
		];
		inboxItems = box.inboxStatus();
		boardSvg = boardCardSVG(box, { ok: box.isValid, inbox: box.inbox.length });
	}

	function resolveInbox() {
		const first = box.inboxStatus()[0];
		if (first) box.resolveInbox(first.index);
		inboxItems = box.inboxStatus();
		boardSvg = boardCardSVG(box, { ok: box.isValid, inbox: box.inbox.length });
	}

	async function ensurePod() {
		if (pod) return pod;
		booting = true;
		bootError = '';
		try {
			pod = await bootPod();
			const { bus, node } = dope(pod, {
				name: 'node-' + Math.random().toString(36).slice(2, 8),
				policy: JSON.parse(policyText)
			});
			nodeId = node.id;
			bus.on((msg) => {
				events = [...events.slice(-200), msg];
				if (msg.type === 'dope:job') jobs[msg.payload.jobId as string] = 'queued';
				if (msg.type === 'dope:job:started') jobs[msg.payload.jobId as string] = 'running';
				if (msg.type === 'dope:job:done') jobs[msg.payload.jobId as string] = 'done';
				if (msg.type === 'dope:job:blocked') jobs[msg.payload.jobId as string] = 'blocked';
				if (msg.type === 'dope:job:failed') jobs[msg.payload.jobId as string] = 'failed';
				jobs = { ...jobs };
				// REACT mode: the box listens for swarm events on its route.
				if (box.triggers.on_bus_event && msg.type === box.triggers.on_bus_event.event) {
					fireTrigger('on_bus_event', { type: msg.type });
				}
			});
			// Re-announce so late tabs see this node.
			bus.emit('dope:node:hello', { node: nodeId, portal: '', policy: {}, version: DOPE_VERSION }, { node: nodeId });
		} catch (err) {
			bootError = err instanceof Error ? err.message : String(err);
		} finally {
			booting = false;
		}
		return pod;
	}

	function dispatch(verb: string, payload: Record<string, unknown>) {
		if (!pod) return;
		const { bus, node } = dope(pod, { policy: JSON.parse(policyText) });
		node.dispatch('*', verb, payload);
	}

	function testGate() {
		const policy = JSON.parse(policyText);
		const allowed = gate('run', {}, policy);
		const denied = gate('write', {}, policy);
		events = [
			...events,
			{
				type: 'gate:probe',
				payload: { run: allowed, write: denied },
				ts: Date.now(),
				node: 'local'
			}
		];
	}

	onMount(() => {
		ensurePod();
	});
</script>

<svelte:head>
	<title>DOPE Swarm — decentralized orchestration in the browser</title>
</svelte:head>

<main class="min-h-screen bg-zinc-950 text-zinc-200 font-mono p-6">
	<header class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-2xl font-bold text-zinc-50">DOPE Swarm</h1>
			<p class="text-zinc-500 text-sm">
				Decentralized Orchestration Protocol for Execution — every tab is a node, portals are
				compute, the gate is the boundary. Open this page in a second tab and watch the swarm.
			</p>
		</div>
		<div class="flex items-center gap-3">
			<span
				class="text-xs px-2 py-1 rounded {crossOriginIsolated ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'}"
			>
				{crossOriginIsolated ? 'cross-origin isolated' : 'NOT isolated — SharedArrayBuffer unavailable'}
			</span>
			<span class="text-xs text-zinc-500">dope {DOPE_VERSION}</span>
		</div>
	</header>

	<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
		<section class="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
			<h2 class="text-sm text-zinc-400 mb-2">this node</h2>
			<div class="text-xs space-y-1">
				<div><span class="text-zinc-500">id</span> <span class="text-emerald-300">{nodeId || 'booting…'}</span></div>
				<div>
					<span class="text-zinc-500">portal</span>
					{#if portalUrl}
						<a href={portalUrl} target="_blank" rel="noreferrer" class="text-indigo-400 hover:underline">{portalUrl}</a>
					{:else}
						<span class="text-zinc-600">none yet</span>
					{/if}
				</div>
				<div><span class="text-zinc-500">policy</span> <span class="text-amber-300">allow: run</span></div>
			</div>
			<textarea
				bind:value={policyText}
				class="w-full h-28 bg-black/50 border border-zinc-800 rounded text-xs p-2 text-amber-300 focus:outline-none focus:border-indigo-500 mt-2"
				spellcheck="false"
			></textarea>
			{#if policyError}<p class="text-red-400 text-xs mt-1">{policyError}</p>{/if}
			<div class="flex gap-2 mt-2">
				<button
					class="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs"
					disabled={!pod}
					onclick={() => dispatch('run', { cmd: 'echo "micro from ' + nodeId + '" && node --version' })}
				>
					spawn micro
				</button>
				<button
					class="px-3 py-1 rounded bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-xs"
					disabled={!pod}
					onclick={testGate}
				>
					probe gate
				</button>
			</div>
		</section>

		<section class="bg-zinc-900 border border-zinc-800 rounded-lg p-4 lg:col-span-2">
			<div class="flex items-center justify-between mb-2">
				<h2 class="text-sm text-zinc-400">swarm bus</h2>
				<span class="text-xs text-zinc-600">{events.length} events · {Object.keys(jobs).length} jobs</span>
			</div>
			<pre
				class="h-96 overflow-auto bg-black/50 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-300 whitespace-pre-wrap"
			>{events.length === 0 ? (booting ? 'booting pod…' : bootError || 'idle — open a second tab to see the swarm') : events
					.slice()
					.reverse()
					.map((e) => {
						const t = new Date(e.ts).toLocaleTimeString();
						const p = JSON.stringify(e.payload);
						return `[${t}] ${e.type}${e.node ? ' · ' + e.node : ''}${p !== '{}' ? ' ' + p : ''}`;
					})
					.join('\n')}</pre>
		</section>

		<section class="bg-zinc-900 border border-zinc-800 rounded-lg p-4 lg:col-span-3">
			<div class="flex items-center justify-between mb-2">
				<h2 class="text-sm text-zinc-400">zNix box · {box.slug}</h2>
				<span class="text-xs text-zinc-600">{box.compositionSummary().kinds.join(' + ')}</span>
			</div>
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
				<div class="bg-black/50 border border-zinc-800 rounded-lg p-3 flex items-center justify-center">
					{@html boardSvg}
				</div>
				<div class="flex flex-col">
					<div class="flex gap-2">
						<button
							class="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-xs"
							onclick={() => fireTrigger('on_schedule', { cron: '*/5 * * * *' })}
						>
							fire schedule trigger
						</button>
						<button
							class="px-3 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-xs"
							onclick={resolveInbox}
						>
							resolve inbox
						</button>
					</div>
					<div class="mt-3 flex-1">
						<span class="text-xs text-zinc-500">inbox ({inboxItems.length}) — the bounded edge: publishes pause here</span>
						<pre
							class="h-48 overflow-auto bg-black/50 border border-zinc-800 rounded-lg p-2 mt-1 text-xs text-amber-300 whitespace-pre-wrap"
						>{inboxItems.length === 0 ? '(empty — nothing escalated)' : inboxItems
								.map((i) => `[${i.kind}] ${i.from} · ${i.route || ''}${i.verbs ? ' verbs=' + i.verbs.join(',') : ''}`)
								.join('\n')}</pre>
					</div>
				</div>
			</div>
		</section>
	</div>

	{#if bootError}
		<p class="mt-3 text-xs text-red-400">{bootError}</p>
	{/if}
</main>
