<script lang="ts">
	/** The IDE shell: tree on the left, editor on the right, one line of status. */
	import EditorPane from './EditorPane.svelte';
	import FileTree from './FileTree.svelte';
	import Icon from './Icon.svelte';
	import TerminalPanel from './TerminalPanel.svelte';
	import type { Session } from '$lib/session.svelte';

	let { session, onLeave }: { session: Session; onLeave: () => void } = $props();

	let sidebarWidth = $state(248);
	let dragging = $state(false);

	let terminalOpen = $state(false);
	/** Set on the first open, never cleared: hiding the panel must not throw its shells away. */
	let terminalStarted = $state(false);
	let terminalHeight = $state(280);
	let draggingTerminal = $state(false);

	const MIN_SIDEBAR = 170;
	const MAX_SIDEBAR = 520;
	const MIN_TERMINAL = 120;
	/** Leaves room for the editor above it, whatever the window height is. */
	const EDITOR_HEADROOM = 220;

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

	function startTerminalDrag(event: PointerEvent) {
		event.preventDefault();
		draggingTerminal = true;
		const move = (moveEvent: PointerEvent) => {
			const max = Math.max(MIN_TERMINAL, window.innerHeight - EDITOR_HEADROOM);
			terminalHeight = Math.min(max, Math.max(MIN_TERMINAL, window.innerHeight - moveEvent.clientY));
		};
		const stop = () => {
			draggingTerminal = false;
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', stop);
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', stop);
	}

	function toggleTerminal() {
		terminalOpen = !terminalOpen;
		terminalStarted ||= terminalOpen;
	}

	/** Ctrl/Cmd+S saves the active file; Ctrl/Cmd+` toggles the terminal. */
	function onKeydown(event: KeyboardEvent) {
		if (!(event.ctrlKey || event.metaKey)) return;
		if (event.key === '`') {
			event.preventDefault();
			toggleTerminal();
			return;
		}
		if (event.key.toLowerCase() !== 's') return;
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
			onclick={toggleTerminal}
			title="Terminal (Ctrl/Cmd+`)"
			class="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition {terminalOpen
				? 'border-bramble/50 text-fg'
				: 'border-edge text-fg-dim hover:border-bramble/50 hover:text-fg'}"
		>
			<Icon name="terminal" size={12} />
			Terminal
		</button>
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

	{#if terminalStarted}
		<!-- Hidden rather than unmounted: the shells and their scrollback outlive a toggle. -->
		<div
			class="flex shrink-0 flex-col"
			style="height: {terminalHeight}px; {terminalOpen ? '' : 'display: none;'}"
		>
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<div
				role="separator"
				aria-orientation="horizontal"
				aria-label="Resize the terminal"
				onpointerdown={startTerminalDrag}
				title="Drag to resize the terminal"
				class="relative h-px shrink-0 cursor-row-resize bg-edge-soft transition-colors
					after:absolute after:inset-x-0 after:-top-0.75 after:h-1.75 after:content-['']
					hover:bg-bramble/60 {draggingTerminal ? 'bg-bramble' : ''}"
			></div>
			<div class="min-h-0 flex-1">
				<TerminalPanel {session} open={terminalOpen} onClose={() => (terminalOpen = false)} />
			</div>
		</div>
	{/if}

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
