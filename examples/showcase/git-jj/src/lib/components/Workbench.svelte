<script lang="ts">
	/** The IDE shell: tree on the left, editor on the right, one line of status. */
	import EditorPane from './EditorPane.svelte';
	import FileTree from './FileTree.svelte';
	import Icon from './Icon.svelte';
	import type { Session } from '$lib/session.svelte';

	let { session, onLeave }: { session: Session; onLeave: () => void } = $props();

	let sidebarWidth = $state(248);
	let dragging = $state(false);

	const MIN_SIDEBAR = 170;
	const MAX_SIDEBAR = 520;

	function startDrag(event: PointerEvent) {
		event.preventDefault();
		dragging = true;
		const move = (moveEvent: PointerEvent) => {
			sidebarWidth = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, moveEvent.clientX));
		};
		const stop = () => {
			dragging = false;
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', stop);
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', stop);
	}

	/** Ctrl/Cmd+S anywhere in the app saves the active file. */
	function onKeydown(event: KeyboardEvent) {
		if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
		event.preventDefault();
		void session.save();
	}

	const fileCount = $derived(session.tree.filter((entry) => !entry.dir).length);
</script>

<svelte:window
	onkeydown={onKeydown}
	onbeforeunload={(event) => {
		// Unsaved buffers live only in this tab; the pod has the saved copy.
		if (!session.hasUnsaved) return;
		event.preventDefault();
	}}
/>

<div class="flex h-full min-h-0 flex-col bg-void">
	<header class="flex h-11 shrink-0 items-center gap-3 border-b border-edge-soft bg-panel px-3">
		<span class="text-bramble"><Icon name="branch" size={15} strokeWidth={1.5} /></span>
		<span class="text-[12.5px] font-semibold tracking-tight text-fg">bramble</span>

		<span class="h-4 w-px bg-edge"></span>

		<span class="truncate text-[12px] text-fg">{session.repo?.name}</span>
		{#if session.repo}
			<span
				class="rounded border border-bramble/35 px-1.5 py-px text-[10px] tracking-wide text-bramble-soft"
			>
				{session.repo.backend}
			</span>
			{#if session.repo.ref}
				<span class="rounded border border-edge px-1.5 py-px text-[10px] text-fg-dim">
					{session.repo.ref}
				</span>
			{/if}
		{/if}

		<span class="ml-auto hidden truncate text-[10.5px] text-fg-faint sm:block">
			{session.workdir}
		</span>

		<button
			onclick={() => void session.save()}
			disabled={!session.dirty}
			title="Save the active file (Ctrl/Cmd+S)"
			class="flex items-center gap-1.5 rounded-md border border-edge px-2 py-1 text-[11px] text-fg-dim transition hover:border-bramble/50 hover:text-fg disabled:opacity-40"
		>
			<Icon name="save" size={12} />
			Save
		</button>
		<button
			onclick={onLeave}
			title="Clone another repository"
			class="flex items-center gap-1.5 rounded-md border border-edge px-2 py-1 text-[11px] text-fg-dim transition hover:border-bramble/50 hover:text-fg"
		>
			<Icon name="arrow-left" size={12} />
			New clone
		</button>
	</header>

	<div class="flex min-h-0 flex-1">
		<aside class="min-h-0 shrink-0" style="width: {sidebarWidth}px">
			<FileTree {session} />
		</aside>

		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			role="separator"
			aria-orientation="vertical"
			aria-label="Resize the file tree"
			onpointerdown={startDrag}
			class="w-px shrink-0 cursor-col-resize bg-edge-soft transition-colors hover:bg-bramble/60 {dragging
				? 'bg-bramble'
				: ''}"
		></div>

		<main class="min-h-0 min-w-0 flex-1">
			<EditorPane {session} />
		</main>
	</div>

	<footer
		class="flex h-6 shrink-0 items-center gap-3 border-t border-edge-soft bg-panel px-3 text-[10.5px] text-fg-faint"
	>
		{#if session.error}
			<span class="flex items-center gap-1.5 truncate text-thorn">
				<Icon name="alert" size={11} />
				{session.error}
			</span>
		{:else if session.activePath}
			<span class="truncate text-fg-dim">{session.activePath}</span>
			{#if session.dirty}
				<span class="flex items-center gap-1 text-bramble">
					<span class="h-1.5 w-1.5 rounded-full bg-bramble"></span>
					unsaved
				</span>
			{:else}
				<span class="text-fg-faint">saved</span>
			{/if}
		{:else}
			<span>no file open</span>
		{/if}

		<span class="ml-auto flex items-center gap-3">
			{#if session.busy}
				<span class="flex items-center gap-1.5 text-bramble-soft">
					<span class="spin-slow"><Icon name="spinner" size={10} /></span>
					working
				</span>
			{/if}
			<span>{fileCount} files</span>
			<span>{session.tabs.length} open</span>
		</span>
	</footer>
</div>
