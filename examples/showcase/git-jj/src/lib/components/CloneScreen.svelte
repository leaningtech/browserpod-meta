<script lang="ts">
	/** Pick a repository, pick the tool that fetches it, watch it land. */
	import Icon from './Icon.svelte';
	import { stripAnsi } from '$lib/pod/run';
	import type { Session } from '$lib/session.svelte';
	import { VCS_OPTIONS, validateRepoUrl, type VcsId } from '$lib/vcs';
	import {
		cloneWorkspace,
		forgetWorkspace,
		loadSavedWorkspace,
		reopenWorkspace,
		type SavedWorkspace,
		type Stage
	} from '$lib/workspace';

	let { session, onOpen }: { session: Session; onOpen: () => void } = $props();

	const EXAMPLES = [
		{
			owner: 'leaningtech',
			repo: 'webvm',
			ref: 'main',
			blurb: 'A Linux virtual machine that runs in the browser'
		},
		{
			owner: 'leaningtech',
			repo: 'browsercraft',
			ref: 'main',
			blurb: 'Minecraft 1.2.5 in the browser, via CheerpJ'
		}
	].map((entry) => ({ ...entry, url: `https://github.com/${entry.owner}/${entry.repo}` }));

	/** The lightest of the four, so the first clone a visitor tries is not the slowest. */
	const DEFAULT_EXAMPLE = EXAMPLES.find((e) => e.repo === 'svelte-browserpod-editor') ?? EXAMPLES[0];

	let url = $state(DEFAULT_EXAMPLE.url);
	let ref = $state(DEFAULT_EXAMPLE.ref);
	let backend = $state<VcsId>('git');

	let phase = $state<'idle' | 'working' | 'failed'>('idle');
	let stage = $state<Stage>('booting');
	let problem = $state('');
	let fieldError = $state('');

	let logLines = $state<string[]>([]);
	let tailLine = $state('');
	let logEl = $state<HTMLDivElement | null>(null);

	let saved = $state<SavedWorkspace | null>(loadSavedWorkspace());
	const isolated = typeof window !== 'undefined' && crossOriginIsolated;
	const hasApiKey = !!import.meta.env.VITE_BP_APIKEY;

	const stageLabel = $derived<Record<Stage, string>>({
		booting: 'Booting the sandbox',
		preparing: 'Installing jj into the pod',
		cloning: backend === 'jj' ? 'Cloning with jj' : 'Cloning with git',
		scanning: 'Reading the working tree',
		ready: 'Ready'
	});

	function pick(example: (typeof EXAMPLES)[number]) {
		url = example.url;
		ref = example.ref;
		fieldError = '';
	}

	/** Carriage returns rewrite the current line, so progress counts up in place. */
	let current = '';

	function applySegment(segment: string) {
		const at = segment.lastIndexOf('\r');
		current = at >= 0 ? segment.slice(at + 1) : current + segment;
	}

	function appendLog(chunk: string) {
		const parts = stripAnsi(chunk).split('\n');
		const finished: string[] = [];
		for (let i = 0; i < parts.length - 1; i++) {
			applySegment(parts[i]);
			finished.push(current);
			current = '';
		}
		applySegment(parts[parts.length - 1]);
		if (finished.length) logLines = [...logLines, ...finished].slice(-400);
		tailLine = current;
	}

	// Follow the tail while output streams in.
	$effect(() => {
		void logLines.length;
		void tailLine;
		if (logEl) logEl.scrollTop = logEl.scrollHeight;
	});

	function resetLog() {
		logLines = [];
		tailLine = '';
		current = '';
	}

	async function startClone(event?: SubmitEvent) {
		event?.preventDefault();
		if (phase === 'working') return;
		const urlProblem = validateRepoUrl(url);
		if (urlProblem) {
			fieldError = urlProblem;
			return;
		}
		fieldError = '';
		problem = '';
		resetLog();
		phase = 'working';
		try {
			const workspace = await cloneWorkspace(
				{ url, ref, backend },
				{ onLog: appendLog, onStage: (next) => (stage = next) },
				session.pod
			);
			session.adopt(workspace.pod, workspace.workdir, workspace.repo);
			await session.refreshTree();
			stage = 'ready';
			onOpen();
		} catch (error) {
			phase = 'failed';
			problem = error instanceof Error ? error.message : String(error);
		}
	}

	async function resume() {
		const target = saved;
		if (!target || phase === 'working') return;
		problem = '';
		resetLog();
		phase = 'working';
		try {
			const workspace = await reopenWorkspace(
				target,
				{ onLog: appendLog, onStage: (next) => (stage = next) },
				session.pod
			);
			if (!workspace) {
				saved = null;
				phase = 'failed';
				problem = 'That checkout is no longer on the pod. Clone it again.';
				return;
			}
			session.adopt(workspace.pod, workspace.workdir, workspace.repo);
			await session.refreshTree();
			stage = 'ready';
			onOpen();
		} catch (error) {
			phase = 'failed';
			problem = error instanceof Error ? error.message : String(error);
		}
	}

	function dismissSaved() {
		forgetWorkspace();
		saved = null;
	}

	const busy = $derived(phase === 'working');
</script>

<div class="flex min-h-full items-center justify-center px-5 py-10">
	<div class="w-full max-w-2xl">
		<!-- Wordmark -->
		<div class="mb-8 flex items-baseline gap-2.5">
			<span class="text-bramble"><Icon name="branch" size={19} strokeWidth={1.5} /></span>
			<h1 class="text-[19px] font-semibold tracking-tight text-fg">bramble</h1>
			<span class="text-[11.5px] text-fg-faint">browser repo explorer</span>
		</div>


		{#if saved && phase !== 'working'}
			<div class="mb-5 flex items-center gap-3 rounded-lg border border-bramble/25 bg-bramble/6 p-3">
				<span class="text-bramble"><Icon name="refresh" size={15} /></span>
				<div class="min-w-0 flex-1">
					<p class="truncate text-[12px] text-fg">{saved.name}</p>
					<p class="truncate text-[10.5px] text-fg-faint">
						{saved.backend} &middot; {saved.workdir}
					</p>
				</div>
				<button
					onclick={resume}
					class="rounded-md bg-bramble px-2.5 py-1.5 text-[11.5px] font-medium text-void transition hover:bg-bramble-soft"
				>
					Reopen
				</button>
				<button
					onclick={dismissSaved}
					aria-label="Forget this workspace"
					class="rounded p-1 text-fg-faint transition hover:bg-hover hover:text-fg"
				>
					<Icon name="close" size={12} />
				</button>
			</div>
		{/if}

		<form
			onsubmit={startClone}
			class="rounded-xl border border-edge bg-panel p-5 shadow-[0_24px_60px_-30px_rgba(169,112,255,0.35)]"
		>
			<label class="mb-1.5 block text-[10px] tracking-[0.16em] text-fg-faint uppercase" for="repo">
				Repository URL
			</label>
			<input
				id="repo"
				bind:value={url}
				disabled={busy}
				spellcheck="false"
				autocomplete="off"
				placeholder="https://github.com/owner/repo"
				oninput={() => (fieldError = '')}
				class="field focus:field-focus disabled:opacity-60"
			/>
			{#if fieldError}
				<p class="mt-1.5 text-[11px] text-thorn">{fieldError}</p>
			{/if}

			<p class="mt-4 mb-2 text-[10px] tracking-[0.16em] text-fg-faint uppercase">
				Or try one of ours
			</p>
			<div class="grid gap-1.5 sm:grid-cols-2">
				{#each EXAMPLES as example (example.url)}
					{@const picked = url.trim().replace(/\/+$/, '') === example.url}
					<button
						type="button"
						disabled={busy}
						onclick={() => pick(example)}
						aria-pressed={picked}
						class="group rounded-lg border px-2.5 py-2 text-left transition disabled:opacity-50 {picked
							? 'border-bramble/55 bg-bramble/8'
							: 'border-edge hover:border-bramble/35 hover:bg-hover'}"
					>
						<span class="flex items-baseline gap-1.5">
							<span class="truncate text-[11.5px] text-fg">{example.repo}</span>
							<span class="ml-auto shrink-0 text-[9.5px] text-fg-faint">{example.ref}</span>
						</span>
						<span class="mt-0.5 block text-[10.5px] leading-snug text-fg-faint">
							{example.blurb}
						</span>
					</button>
				{/each}
			</div>

			<div class="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
				<div>
					<label
						class="mb-1.5 block text-[10px] tracking-[0.16em] text-fg-faint uppercase"
						for="ref"
					>
						Branch or tag
					</label>
					<input
						id="ref"
						bind:value={ref}
						disabled={busy}
						spellcheck="false"
						autocomplete="off"
						placeholder="main"
						class="field focus:field-focus disabled:opacity-40"
					/>
					<p class="mt-1.5 text-[10.5px] text-fg-faint">
						Leave empty for the remote's default branch.
					</p>
				</div>

				<div>
					<span class="mb-1.5 block text-[10px] tracking-[0.16em] text-fg-faint uppercase">
						Fetch with
					</span>
					<div class="inline-flex rounded-md border border-edge p-0.5" role="group">
						{#each VCS_OPTIONS as option (option.id)}
							<button
								type="button"
								disabled={busy}
								onclick={() => (backend = option.id)}
								title={option.blurb}
								aria-pressed={backend === option.id}
								class="rounded px-3.5 py-1.5 text-[12px] transition disabled:opacity-60 {backend ===
								option.id
									? 'bg-bramble text-void'
									: 'text-fg-dim hover:bg-hover hover:text-fg'}"
							>
								{option.label}
							</button>
						{/each}
					</div>
				</div>
			</div>

			<button
				type="submit"
				disabled={busy || !hasApiKey || !isolated}
				class="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-bramble py-2.5 text-[12.5px] font-medium text-void transition hover:bg-bramble-soft disabled:cursor-not-allowed disabled:opacity-45"
			>
				{#if busy}
					<span class="spin-slow"><Icon name="spinner" size={14} /></span>
					{stageLabel[stage]}...
				{:else}
					<Icon name="branch" size={14} />
					Clone into a pod
				{/if}
			</button>

			{#if !hasApiKey}
				<p class="mt-3 flex items-start gap-2 text-[11px] text-thorn">
					<Icon name="alert" size={13} class="mt-px" />
					No BrowserPod API key. Copy <code class="text-fg">.env.example</code> to
					<code class="text-fg">.env</code> and set <code class="text-fg">VITE_BP_APIKEY</code>.
				</p>
			{:else if !isolated}
				<p class="mt-3 flex items-start gap-2 text-[11px] text-thorn">
					<Icon name="alert" size={13} class="mt-px" />
					This page is not cross-origin isolated, so SharedArrayBuffer is unavailable. Check the COOP/COEP
					headers.
				</p>
			{/if}
		</form>

		{#if problem}
			<p class="mt-4 flex items-start gap-2 rounded-lg border border-thorn/30 bg-thorn/8 p-3 text-[11.5px] text-thorn">
				<Icon name="alert" size={14} class="mt-px" />
				<span class="min-w-0 break-words">{problem}</span>
			</p>
		{/if}

		{#if logLines.length > 0 || tailLine || busy}
			<div class="mt-4 overflow-hidden rounded-lg border border-edge bg-void">
				<div class="flex items-center gap-2 border-b border-edge-soft px-3 py-1.5">
					<span class="text-[10px] tracking-[0.16em] text-fg-faint uppercase">Pod output</span>
					{#if busy}
						<span class="relative ml-auto h-px w-16 overflow-hidden bg-edge">
							<span class="sweep absolute inset-y-0 left-0 w-4 bg-bramble"></span>
						</span>
					{/if}
				</div>
				<div
					bind:this={logEl}
					class="max-h-56 overflow-y-auto px-3 py-2 text-[11px] leading-[1.55] whitespace-pre-wrap text-fg-dim"
				>
					{#each logLines as line, index (index)}
						<div class={line.startsWith('$ ') ? 'text-bramble-soft' : ''}>{line || ' '}</div>
					{/each}
					{#if tailLine}<div>{tailLine}</div>{/if}
				</div>
			</div>
		{/if}

	</div>
</div>
