<script lang="ts">
	import { bootPod } from '$lib/pod/boot';
	import { runMission, type MissionReport } from '$lib/mission/runner';
	import { EXAMPLE_MISSIONS } from '$lib/mission/examples';
	import type { Mission } from '$lib/mission/types';

	let pod: import('@leaningtech/browserpod').BrowserPod | null = null;
	let bootError = '';
	let booting = false;
	let running = false;
	let report: MissionReport | null = null;
	let consoleLines = '';
	let portalUrl = '';
	let missionText = JSON.stringify(EXAMPLE_MISSIONS[0], null, 2);
	let parseError = '';

	async function ensurePod() {
		if (pod) return pod;
		booting = true;
		bootError = '';
		try {
			pod = await bootPod();
			pod.onPortal(({ url }) => {
				portalUrl = url;
			});
		} catch (err) {
			bootError = err instanceof Error ? err.message : String(err);
		} finally {
			booting = false;
		}
		return pod;
	}

	function parseMission(text: string): Mission | null {
		try {
			const parsed = JSON.parse(text);
			if (!parsed || typeof parsed !== 'object' || !parsed.name || !parsed.clone?.url || !Array.isArray(parsed.steps)) {
				parseError = 'Mission needs a name, a clone.url and a non-empty steps array.';
				return null;
			}
			parseError = '';
			return parsed as Mission;
		} catch (err) {
			parseError = err instanceof Error ? err.message : String(err);
			return null;
		}
	}

	function appendConsole(line: string) {
		consoleLines += line + '\n';
	}

	async function run() {
		const parsed = parseMission(missionText);
		if (!parsed) return;
		const p = await ensurePod();
		if (!p) return;

		running = true;
		report = null;
		consoleLines = '';
		appendConsole('▶ mission: ' + parsed.name);
		appendConsole('  clone ' + parsed.clone.url + (parsed.clone.ref ? ` (${parsed.clone.ref})` : ''));
		appendConsole('  locks: ' + (parsed.locks.join(', ') || '(none — writes blocked)'));

		try {
			const r = await runMission(p, parsed);
			report = r;
			for (const s of r.steps) {
				appendConsole(`  ${s.status.toUpperCase()} ${s.label} (exit ${s.exitCode})`);
				if (s.blockedReason) appendConsole(`    blocked: ${s.blockedReason}`);
				else if (s.output.trim()) appendConsole('    ' + s.output.trim().split('\n').slice(-3).join('\n    '));
			}
			appendConsole(
				'verdict: ' +
					(r.cloneFailed ?? (r.steps.some((s) => s.status === 'failed') ? 'failed' : 'done'))
			);
		} catch (err) {
			appendConsole('run error: ' + (err instanceof Error ? err.message : String(err)));
		} finally {
			running = false;
		}
	}

	function useExample(i: number) {
		missionText = JSON.stringify(EXAMPLE_MISSIONS[i], null, 2);
		parseError = '';
	}
</script>

<svelte:head>
	<title>Agent Bay — gated agent jobs in the browser</title>
</svelte:head>

<main class="min-h-screen bg-zinc-950 text-zinc-200 font-mono p-6">
	<header class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-2xl font-bold text-zinc-50">Agent Bay</h1>
			<p class="text-zinc-500 text-sm">
				A mission-driven agent loop in a BrowserPod sandbox. Every write and exec goes
				through the gate; anything outside the locked lanes is refused.
			</p>
		</div>
		<div class="flex items-center gap-3">
			<span
				class="text-xs px-2 py-1 rounded {crossOriginIsolated ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'}"
			>
				{crossOriginIsolated ? 'cross-origin isolated' : 'NOT isolated — SharedArrayBuffer unavailable'}
			</span>
			<button
				class="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
				disabled={running || !crossOriginIsolated}
				onclick={run}
			>
				{running ? 'running…' : 'Run mission'}
			</button>
		</div>
	</header>

	<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
		<section class="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
			<div class="flex items-center justify-between mb-2">
				<h2 class="text-sm text-zinc-400">mission.json</h2>
				<div class="flex gap-1">
					{#each EXAMPLE_MISSIONS as _, i}
						<button class="text-xs px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700" onclick={() => useExample(i)}>
							example {i + 1}
						</button>
					{/each}
				</div>
			</div>
			<textarea
				bind:value={missionText}
				class="w-full h-96 bg-black/50 border border-zinc-800 rounded text-xs p-3 text-emerald-300 focus:outline-none focus:border-indigo-500"
				spellcheck="false"
			></textarea>
			{#if parseError}<p class="text-red-400 text-xs mt-2">{parseError}</p>{/if}
		</section>

		<section class="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col">
			<div class="flex items-center justify-between mb-2">
				<h2 class="text-sm text-zinc-400">console</h2>
				{#if portalUrl}
					<a href={portalUrl} target="_blank" rel="noreferrer" class="text-xs text-indigo-400 hover:underline">
						portal: {portalUrl}
					</a>
				{/if}
			</div>
			<pre
				class="flex-1 h-96 overflow-auto bg-black/50 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-300 whitespace-pre-wrap"
			>{consoleLines || (running ? 'bootstrapping pod…' : bootError || 'idle — write a mission, then run')}</pre>
		</section>
	</div>

	{#if report}
		<section class="mt-4 bg-zinc-900 border border-zinc-800 rounded-lg p-4">
			<h2 class="text-sm text-zinc-400 mb-2">verdicts</h2>
			<table class="w-full text-xs">
				<thead>
					<tr class="text-zinc-500 text-left">
						<th class="py-1">step</th>
						<th>status</th>
						<th>exit</th>
						<th class="w-1/2">output (tail)</th>
					</tr>
				</thead>
				<tbody>
					{#each report.steps as s (s.label + s.status)}
						<tr class="border-t border-zinc-800">
							<td class="py-1 pr-2">{s.label}</td>
							<td class="py-1 pr-2">
								<span
									class="px-1.5 rounded text-xs {s.status === 'ok' ? 'bg-emerald-900/50 text-emerald-300' : s.status === 'blocked' ? 'bg-amber-900/50 text-amber-300' : 'bg-red-900/50 text-red-300'}"
								>
									{s.status}
								</span>
							</td>
							<td class="py-1 pr-2">{s.exitCode}</td>
							<td class="py-1 text-zinc-400 whitespace-pre-wrap">
								{s.blockedReason ?? s.output.trim().split('\n').slice(-3).join('\n')}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="text-xs text-zinc-500 mt-2">
				verdict log written to <code class="text-emerald-400">/repo/{report.verdictPath}</code> in the sandbox
			</p>
		</section>
	{/if}

	{#if bootError}
		<p class="mt-3 text-xs text-red-400">{bootError}</p>
	{/if}
</main>
