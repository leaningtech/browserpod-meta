<script lang="ts">
	import Icon from './Icon.svelte';
	import { nudgeLayout, openShell } from '$lib/pod/terminal';
	import type { Session } from '$lib/session.svelte';

	let {
		session,
		open,
		onClose
	}: { session: Session; open: boolean; onClose: () => void } = $props();

	type Tab = { id: number };

	let nextId = 1;
	let tabs = $state<Tab[]>([]);
	let activeId = $state(0);

	// Being shown with no tabs left means the last one was closed: start a fresh shell.
	$effect(() => {
		if (open && tabs.length === 0) add();
	});

	function select(id: number) {
		activeId = id;
		// The pane was laid out while hidden, and the renderer only refits on a resize.
		setTimeout(nudgeLayout, 0);
	}

	function add() {
		const id = nextId++;
		tabs = [...tabs, { id }];
		select(id);
	}

	function close(id: number) {
		// Only the pane goes; the shell behind it runs until the pod is torn down.
		const index = tabs.findIndex((tab) => tab.id === id);
		tabs = tabs.filter((tab) => tab.id !== id);
		if (!tabs.length) {
			onClose();
			return;
		}
		if (activeId === id) select((tabs[index] ?? tabs.at(-1))!.id);
	}

	/** One shell per mounted pane, in the tool the checkout was cloned with. */
	function pane(node: HTMLElement) {
		if (!session.pod) return;
		void openShell(session.pod, node, session.workdir, session.repo?.backend ?? 'git').catch(
			(error) => console.error('Could not start a shell:', error)
		);
	}

	/** Turns every other way this pane can change size into the resize it listens for. */
	function refit(node: HTMLElement) {
		let frame = 0;
		const observer = new ResizeObserver(() => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(nudgeLayout);
		});
		observer.observe(node);
		return {
			destroy() {
				cancelAnimationFrame(frame);
				observer.disconnect();
			}
		};
	}
</script>

<div class="flex h-full min-h-0 flex-col bg-void">
	<div class="flex h-8 shrink-0 items-center gap-px overflow-x-auto bg-panel pr-1">
		{#each tabs as tab (tab.id)}
			<div
				class="group flex h-full shrink-0 items-center gap-1.5 border-b-2 px-3 text-[11px] transition
					{activeId === tab.id
					? 'border-bramble text-fg'
					: 'border-transparent text-fg-faint hover:text-fg-dim'}"
			>
				<button onclick={() => select(tab.id)} class="flex items-center gap-1.5">
					<Icon name="terminal" size={11} />
					bash {tab.id}
				</button>
				<button
					onclick={() => close(tab.id)}
					aria-label="Close bash {tab.id}"
					title="Close this shell"
					class="opacity-0 transition hover:text-thorn focus-visible:opacity-100 group-hover:opacity-70"
				>
					<Icon name="close" size={10} />
				</button>
			</div>
		{/each}

		<button
			onclick={add}
			title="New terminal"
			aria-label="New terminal"
			class="ml-1 shrink-0 rounded p-1 text-fg-faint transition hover:bg-hover hover:text-fg"
		>
			<Icon name="plus" size={12} />
		</button>

		<button
			onclick={onClose}
			title="Hide the terminal (Ctrl+`)"
			aria-label="Hide the terminal"
			class="ml-auto shrink-0 rounded p-1 text-fg-faint transition hover:bg-hover hover:text-fg"
		>
			<Icon name="chevron-down" size={12} />
		</button>
	</div>

	<!-- Stacked and hidden rather than unmounted, so a hidden pane keeps its scrollback
	     and is already laid out at the right size when it comes back. -->
	<div use:refit class="relative min-h-0 flex-1 overflow-hidden">
		{#each tabs as tab (tab.id)}
			<div
				use:pane
				class="absolute inset-0 overflow-hidden p-2"
				class:invisible={activeId !== tab.id}
			></div>
		{/each}
	</div>
</div>
