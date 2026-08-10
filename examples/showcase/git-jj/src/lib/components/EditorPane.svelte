<script lang="ts">
	/**
	 * Tab strip and Monaco, adapted from browsercode's EditorPane. One model per open
	 * file keeps undo history alive across tab switches; view states park the cursor
	 * and scroll position per path.
	 */
	import { onDestroy, onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import type * as Monaco from 'monaco-editor';
	import Icon from './Icon.svelte';
	import { fileGlyph } from '$lib/editor/file-icons';
	import type { Session } from '$lib/session.svelte';

	let { session }: { session: Session } = $props();

	let container = $state<HTMLDivElement | null>(null);
	let monacoMod = $state.raw<typeof import('$lib/editor/monaco') | null>(null);
	let editor = $state.raw<Monaco.editor.IStandaloneCodeEditor | null>(null);
	let destroyed = false;

	const viewStates = new SvelteMap<string, Monaco.editor.ICodeEditorViewState | null>();
	let renderedPath = '';

	const FONT_QUERY = '(min-width: 640px)';
	const fontSizeFor = (desktop: boolean) => (desktop ? 12.8 : 11.5);

	onMount(() => {
		const media = window.matchMedia(FONT_QUERY);
		const onMediaChange = () => editor?.updateOptions({ fontSize: fontSizeFor(media.matches) });
		media.addEventListener('change', onMediaChange);

		// Monaco is heavy and browser only, so load it after mount.
		void import('$lib/editor/monaco').then((mod) => {
			if (destroyed || !container) return;
			monacoMod = mod;
			editor = mod.monaco.editor.create(container, {
				model: null,
				theme: 'bramble',
				automaticLayout: true,
				fontSize: fontSizeFor(media.matches),
				fontFamily:
					"ui-monospace, 'SF Mono', 'JetBrains Mono', 'Cascadia Code', Menlo, Consolas, monospace",
				fontLigatures: false,
				minimap: { enabled: false },
				scrollBeyondLastLine: false,
				padding: { top: 8, bottom: 8 },
				lineNumbersMinChars: 3,
				renderLineHighlight: 'all',
				smoothScrolling: true,
				scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
				fixedOverflowWidgets: true,
				tabSize: 2
			});

			// Mirror every edit back into the tab it belongs to.
			editor.onDidChangeModelContent(() => {
				const tab = session.tabs.find((entry) => entry.path === renderedPath);
				if (!tab || !editor) return;
				const value = editor.getValue();
				// Our own setValue on tab load fires this too, so ignore that.
				if (tab.content === value) return;
				tab.content = value;
			});

			// Registered here so Monaco does not swallow it before Workbench sees it.
			editor.addCommand(mod.monaco.KeyMod.CtrlCmd | mod.monaco.KeyCode.KeyS, () => {
				void session.save();
			});
		});

		return () => media.removeEventListener('change', onMediaChange);
	});

	/** The Monaco model backing `path`, created on first use. */
	function modelFor(mod: typeof import('$lib/editor/monaco'), path: string, content: string) {
		const uri = mod.monaco.Uri.file(path);
		return (
			mod.monaco.editor.getModel(uri) ??
			mod.monaco.editor.createModel(content, mod.languageFor(path), uri)
		);
	}

	// Park the outgoing view state, attach the incoming model, restore its cursor.
	$effect(() => {
		const tab = session.tabs.find((entry) => entry.path === session.activePath);
		if (!editor || !monacoMod) return;
		if (!tab || tab.blocked) {
			if (renderedPath) viewStates.set(renderedPath, editor.saveViewState());
			editor.setModel(null);
			renderedPath = '';
			return;
		}
		if (tab.path === renderedPath) {
			// A content change from the session side, pushed into the model.
			const model = editor.getModel();
			if (model && model.getValue() !== tab.content) model.setValue(tab.content);
			return;
		}
		if (renderedPath) viewStates.set(renderedPath, editor.saveViewState());
		const model = modelFor(monacoMod, tab.path, tab.content);
		if (model.getValue() !== tab.content) model.setValue(tab.content);
		editor.setModel(model);
		const viewState = viewStates.get(tab.path);
		if (viewState) editor.restoreViewState(viewState);
		renderedPath = tab.path;
		editor.focus();
	});

	// Dispose models whose tab has closed or been renamed away.
	$effect(() => {
		const open = new Set(session.tabs.map((tab) => tab.path));
		if (!monacoMod || !editor) return;
		for (const model of monacoMod.monaco.editor.getModels()) {
			const path = model.uri.path.slice(1);
			if (open.has(path) || model === editor.getModel()) continue;
			model.dispose();
			viewStates.delete(path);
		}
	});

	// Monaco leaks DOM nodes and workers when it is not disposed.
	onDestroy(() => {
		destroyed = true;
		editor?.dispose();
		editor = null;
		monacoMod?.monaco.editor.getModels().forEach((model) => model.dispose());
	});

	const activeTab = $derived(session.activeTab);
</script>

<div class="flex h-full min-h-0 flex-col overflow-hidden">
	<div class="flex h-8 shrink-0 items-stretch overflow-x-auto border-b border-edge-soft bg-panel">
		{#if session.tabs.length === 0}
			<div class="flex items-center gap-1.5 px-3 text-[10px] tracking-[0.14em] text-fg-faint uppercase">
				Editor
			</div>
		{/if}
		{#each session.tabs as tab (tab.path)}
			{@const active = session.activePath === tab.path}
			{@const dirty = tab.content !== tab.saved}
			{@const glyph = fileGlyph(tab.path)}
			<div
				class="group relative flex shrink-0 items-center border-r border-edge-soft transition {active
					? 'bg-pit text-fg'
					: 'text-fg-faint hover:text-fg-dim'}"
			>
				{#if active}
					<span class="absolute inset-x-0 top-0 h-px bg-bramble"></span>
				{/if}
				<button
					onclick={() => void session.open(tab.path)}
					title={tab.path}
					class="inline-flex h-8 items-center gap-1.5 pl-3 text-[11.5px]"
				>
					<span
						class="grid h-3.5 w-4 shrink-0 place-items-center text-[8.5px] font-bold tracking-tighter"
						style="color: {glyph.color}">{glyph.label}</span
					>
					<span class="max-w-44 truncate">{tab.path.split('/').pop()}</span>
				</button>
				<button
					onclick={() => session.close(tab.path)}
					aria-label="Close {tab.path}"
					class="inline-flex h-8 items-center px-2 text-fg-faint transition hover:text-fg"
				>
					{#if dirty}
						<span class="h-1.5 w-1.5 rounded-full bg-bramble group-hover:hidden"></span>
						<span class="hidden group-hover:block"><Icon name="close" size={10} /></span>
					{:else}
						<Icon name="close" size={10} />
					{/if}
				</button>
			</div>
		{/each}
	</div>

	<div class="relative min-h-0 flex-1 overflow-hidden bg-pit">
		<div bind:this={container} class="h-full w-full" class:invisible={!!activeTab?.blocked}></div>

		{#if activeTab?.blocked}
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-pit px-6">
				<Icon name="shield" size={20} class="text-fg-faint" />
				<p class="text-center text-[12px] text-fg-dim">{activeTab.blocked}</p>
				<p class="text-center text-[11px] text-fg-faint">{activeTab.path}</p>
			</div>
		{:else if session.tabs.length === 0}
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-pit">
				<Icon name="file" size={22} class="text-fg-faint/60" />
				<p class="text-[11.5px] text-fg-faint">Pick a file from the working tree.</p>
				<p class="text-[10.5px] text-fg-faint/70">
					Ctrl/Cmd+S writes the active file back into the pod.
				</p>
			</div>
		{:else if !editor}
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-pit">
				<span class="spin-slow text-bramble"><Icon name="spinner" size={18} /></span>
				<span class="text-[11px] text-fg-faint">Loading editor...</span>
			</div>
		{/if}
	</div>
</div>
