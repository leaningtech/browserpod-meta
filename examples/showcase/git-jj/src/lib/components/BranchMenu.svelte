<script lang="ts">
	/** The branch pill in the header, opened into a switcher. */
	import Icon from './Icon.svelte';
	import type { Session } from '$lib/session.svelte';

	let { session }: { session: Session } = $props();

	let open = $state(false);
	let loading = $state(false);
	let branches = $state<string[]>([]);
	let problem = $state('');
	let root = $state<HTMLDivElement | null>(null);

	const backendLabel = $derived(session.repo?.backend === 'jj' ? 'bookmark' : 'branch');

	async function toggle() {
		if (open) {
			open = false;
			return;
		}
		open = true;
		problem = '';
		loading = true;
		try {
			branches = await session.listBranches();
			if (!branches.length) problem = `No ${backendLabel}s found`;
		} catch (error) {
			branches = [];
			problem = error instanceof Error ? error.message : String(error);
		} finally {
			loading = false;
		}
	}

	async function pick(name: string) {
		if (session.switchingTo) return;
		if (name === session.branch) {
			open = false;
			return;
		}
		problem = '';
		const failure = await session.switchBranch(name);
		if (failure) {
			problem = failure;
			return;
		}
		open = false;
	}

	function onWindowPointerDown(event: PointerEvent) {
		if (open && root && !root.contains(event.target as Node)) open = false;
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if (open && event.key === 'Escape') open = false;
	}
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeydown} />

<div class="relative" bind:this={root}>
	<button
		onclick={toggle}
		title="Switch {backendLabel}"
		aria-haspopup="listbox"
		aria-expanded={open}
		class="flex items-center gap-1 rounded border px-1.5 py-px text-[10px] transition {open
			? 'border-bramble/50 text-fg'
			: 'border-edge text-fg-dim hover:border-bramble/50 hover:text-fg'}"
	>
		{#if session.switchingTo}
			<span class="spin-slow"><Icon name="spinner" size={9} /></span>
			{session.switchingTo}
		{:else}
			<Icon name="branch" size={9} />
			{session.branch || 'detached'}
			<Icon name="chevron-down" size={8} />
		{/if}
	</button>

	{#if open}
		<div
			role="listbox"
			aria-label="Switch {backendLabel}"
			class="absolute top-full left-0 z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-edge bg-panel py-1 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.7)]"
		>
			{#if loading}
				<div class="flex items-center gap-2 px-3 py-2 text-[11px] text-fg-faint">
					<span class="spin-slow"><Icon name="spinner" size={11} /></span>
					Reading {backendLabel}s...
				</div>
			{:else}
				{#each branches as name (name)}
					{@const current = name === session.branch}
					<button
						role="option"
						aria-selected={current}
						disabled={!!session.switchingTo}
						onclick={() => void pick(name)}
						class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11.5px] transition disabled:opacity-50 {current
							? 'text-bramble-soft'
							: 'text-fg-dim hover:bg-hover hover:text-fg'}"
					>
						<span class="w-3 shrink-0">
							{#if session.switchingTo === name}
								<span class="spin-slow"><Icon name="spinner" size={11} /></span>
							{:else if current}
								<Icon name="check" size={11} />
							{/if}
						</span>
						<span class="truncate">{name}</span>
					</button>
				{/each}
			{/if}
			{#if problem}
				<p class="flex items-start gap-1.5 px-3 py-1.5 text-[10.5px] break-words text-thorn">
					<Icon name="alert" size={11} class="mt-px shrink-0" />
					<span class="min-w-0">{problem}</span>
				</p>
			{/if}
		</div>
	{/if}
</div>
