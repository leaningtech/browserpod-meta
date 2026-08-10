<script lang="ts">
	/**
	 * Working tree browser, adapted from browsercode's FileTreePanel: same nesting,
	 * inline create and rename inputs, and delete confirmation.
	 */
	import { SvelteSet } from 'svelte/reactivity';
	import Icon from './Icon.svelte';
	import { fileGlyph, isTintedFolder } from '$lib/editor/file-icons';
	import type { Session } from '$lib/session.svelte';

	let { session }: { session: Session } = $props();

	type TreeNode = { name: string; path: string; children?: TreeNode[] };

	/** Nests the flat entry list. Directories go in first, so empty ones still show. */
	function buildTree(files: string[], dirs: string[]): TreeNode[] {
		const root: TreeNode[] = [];
		function insert(path: string, isDir: boolean) {
			const parts = path.split('/');
			let current = root;
			let pathSoFar = '';
			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
				const isLeafFile = !isDir && i === parts.length - 1;
				let node = current.find((entry) => entry.name === part);
				if (!node) {
					node = isLeafFile ? { name: part, path } : { name: part, path: pathSoFar, children: [] };
					current.push(node);
				}
				if (!isLeafFile) current = node.children ??= [];
			}
		}
		for (const dir of dirs) insert(dir, true);
		for (const file of files) insert(file, false);
		sortNodes(root);
		return root;
	}

	/** Folders first, then alphabetical, at every level. */
	function sortNodes(nodes: TreeNode[]) {
		nodes.sort((a, b) =>
			!!a.children === !!b.children ? a.name.localeCompare(b.name) : a.children ? -1 : 1
		);
		for (const node of nodes) if (node.children) sortNodes(node.children);
	}

	const fileTree = $derived(
		buildTree(
			session.tree.filter((entry) => !entry.dir).map((entry) => entry.path),
			session.tree.filter((entry) => entry.dir).map((entry) => entry.path)
		)
	);

	const expanded = new SvelteSet(['src', 'src/lib', 'app', 'lib']);

	function toggleFolder(path: string) {
		if (expanded.has(path)) expanded.delete(path);
		else expanded.add(path);
	}

	function collapseAll() {
		expanded.clear();
	}

	let pendingCreate = $state<{ kind: 'file' | 'folder'; parent: string } | null>(null);
	let renaming = $state<{ path: string; isDir: boolean } | null>(null);
	let actionName = $state('');
	let actionError = $state('');
	let actionBusy = $state(false);
	let confirmDelete = $state<{ path: string; isDir: boolean } | null>(null);
	let deleteBusy = $state(false);
	let deleteError = $state('');
	let menu = $state<{ x: number; y: number; path: string; isDir: boolean } | null>(null);

	const deleteChildCount = $derived.by(() => {
		if (!confirmDelete?.isDir) return 0;
		const prefix = `${confirmDelete.path}/`;
		return session.tree.filter((entry) => !entry.dir && entry.path.startsWith(prefix)).length;
	});

	const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

	/** Whether `name` is taken among the direct children of `parent`. */
	function siblingExists(parent: string, name: string): boolean {
		const target = parent ? `${parent}/${name}` : name;
		return session.tree.some(
			(entry) => entry.path === target || entry.path.startsWith(`${target}/`)
		);
	}

	/** An error message for a proposed name, or '' when it is valid. */
	function validateName(name: string, parent: string): string {
		if (!name) return 'Name is required';
		if (name === '.' || name === '..') return 'Invalid name';
		if (/[/\\]/.test(name)) return 'Name cannot contain slashes';
		if (siblingExists(parent, name)) return `"${name}" already exists here`;
		return '';
	}

	/** Starts inline creation. Without `parent`, targets the active file's folder. */
	function startCreate(kind: 'file' | 'folder', parent?: string) {
		if (!session.ready) return;
		closeMenu();
		renaming = null;
		const target = parent ?? (session.activePath ? parentOf(session.activePath) : '');
		pendingCreate = { kind, parent: target };
		actionName = '';
		actionError = '';
		if (target) expanded.add(target);
	}

	function startRename(path: string, isDir: boolean) {
		closeMenu();
		pendingCreate = null;
		renaming = { path, isDir };
		actionName = path.split('/').pop() ?? '';
		actionError = '';
	}

	function cancelAction() {
		if (actionBusy) return;
		pendingCreate = null;
		renaming = null;
		actionError = '';
	}

	async function commitCreate() {
		if (!pendingCreate || actionBusy) return;
		const name = actionName.trim();
		const error = validateName(name, pendingCreate.parent);
		if (error) {
			actionError = error;
			return;
		}
		const { kind, parent } = pendingCreate;
		const path = parent ? `${parent}/${name}` : name;
		actionBusy = true;
		const failure =
			kind === 'file' ? await session.createFile(path) : await session.createFolder(path);
		actionBusy = false;
		if (failure) {
			actionError = failure;
			return;
		}
		pendingCreate = null;
		if (kind === 'folder') expanded.add(path);
	}

	async function commitRename() {
		if (!renaming || actionBusy) return;
		const target = renaming;
		const name = actionName.trim();
		if (name === (target.path.split('/').pop() ?? '')) {
			renaming = null;
			return;
		}
		const parent = parentOf(target.path);
		const error = validateName(name, parent);
		if (error) {
			actionError = error;
			return;
		}
		const to = parent ? `${parent}/${name}` : name;
		actionBusy = true;
		const failure = await session.rename(target.path, to);
		actionBusy = false;
		if (failure) {
			actionError = failure;
			return;
		}
		if (target.isDir && expanded.has(target.path)) {
			expanded.delete(target.path);
			expanded.add(to);
		}
		renaming = null;
	}

	function requestDelete(path: string, isDir: boolean) {
		closeMenu();
		deleteError = '';
		confirmDelete = { path, isDir };
	}

	async function performDelete() {
		if (!confirmDelete || deleteBusy) return;
		deleteBusy = true;
		const failure = await session.remove(confirmDelete.path);
		deleteBusy = false;
		if (failure) {
			deleteError = failure;
			return;
		}
		confirmDelete = null;
	}

	function openMenu(event: MouseEvent, path: string, isDir: boolean) {
		if (!session.ready) return;
		event.preventDefault();
		event.stopPropagation();
		// Clamped so the menu never spills off the viewport.
		menu = {
			x: Math.min(event.clientX, window.innerWidth - 188),
			y: Math.min(event.clientY, window.innerHeight - 176),
			path,
			isDir
		};
	}

	function closeMenu() {
		menu = null;
	}

	/** Focuses an inline input, selecting the name without its extension. */
	function focusInput(el: HTMLInputElement) {
		el.focus();
		const dot = el.value.lastIndexOf('.');
		el.setSelectionRange(0, dot > 0 ? dot : el.value.length);
	}
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key !== 'Escape') return;
		closeMenu();
		cancelAction();
		if (!deleteBusy) confirmDelete = null;
	}}
/>

{#snippet nameInput(pad: number, tint: string, label: string, onCommit: () => void)}
	<div class="flex flex-col gap-1 py-0.5 pr-2" style="padding-left: {pad}rem">
		<div class="flex items-center gap-1.5">
			<span
				class="grid h-3.5 w-4 shrink-0 place-items-center text-[8.5px] font-bold"
				style="color: {tint}">{label}</span
			>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				use:focusInput
				bind:value={actionName}
				disabled={actionBusy}
				spellcheck="false"
				autocomplete="off"
				onkeydown={(event) => {
					if (event.key === 'Enter') onCommit();
					else if (event.key === 'Escape') cancelAction();
				}}
				onblur={cancelAction}
				oninput={() => (actionError = '')}
				class="min-w-0 flex-1 rounded border bg-void px-1.5 py-0.5 text-[11.5px] text-fg outline-none disabled:opacity-60 {actionError
					? 'border-thorn/60'
					: 'border-bramble/60'}"
			/>
		</div>
		{#if actionError}
			<p class="pl-5.5 text-[10px] leading-tight text-thorn/90">{actionError}</p>
		{/if}
	</div>
{/snippet}

{#snippet menuItem(icon: 'file-plus' | 'folder-plus' | 'pencil' | 'trash', label: string, onSelect: () => void, danger = false)}
	<button
		type="button"
		role="menuitem"
		onclick={onSelect}
		class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11.5px] transition {danger
			? 'text-thorn/80 hover:bg-thorn/10 hover:text-thorn'
			: 'text-fg-dim hover:bg-hover hover:text-fg'}"
	>
		<Icon name={icon} size={13} />
		<span class="truncate">{label}</span>
	</button>
{/snippet}

{#snippet treeNodes(nodes: TreeNode[], depth: number, parentPath: string)}
	{#if pendingCreate && pendingCreate.parent === parentPath}
		{@render nameInput(
			0.5 + depth * 0.75,
			pendingCreate.kind === 'folder' ? '#a970ff' : fileGlyph(actionName).color,
			pendingCreate.kind === 'folder' ? 'D' : fileGlyph(actionName).label,
			commitCreate
		)}
	{/if}
	{#each nodes as node (node.path)}
		{#if node.children}
			{#if renaming?.path === node.path}
				{@render nameInput(0.5 + depth * 0.75, '#a970ff', 'D', commitRename)}
			{:else}
				<button
					onclick={() => toggleFolder(node.path)}
					oncontextmenu={(event) => openMenu(event, node.path, true)}
					class="group flex w-full items-center gap-1 py-[3px] pr-2 text-left text-[11.5px] text-fg-dim transition hover:bg-hover/70 hover:text-fg"
					style="padding-left: {0.35 + depth * 0.75}rem"
				>
					<Icon
						name={expanded.has(node.path) ? 'chevron-down' : 'chevron-right'}
						size={11}
						class="text-fg-faint group-hover:text-bramble-soft"
					/>
					<span
						class="truncate {isTintedFolder(node.name) ? 'text-bramble-soft/80' : ''}"
						class:font-medium={isTintedFolder(node.name)}>{node.name}</span
					>
				</button>
			{/if}
			{#if expanded.has(node.path)}
				{@render treeNodes(node.children, depth + 1, node.path)}
			{/if}
		{:else if renaming?.path === node.path}
			{@render nameInput(
				0.5 + depth * 0.75,
				fileGlyph(actionName).color,
				fileGlyph(actionName).label,
				commitRename
			)}
		{:else}
			{@const glyph = fileGlyph(node.name)}
			{@const active = session.activePath === node.path}
			<button
				onclick={() => void session.open(node.path)}
				oncontextmenu={(event) => openMenu(event, node.path, false)}
				title={node.path}
				class="flex w-full items-center gap-1.5 border-l-2 py-[3px] pr-2 text-left text-[11.5px] transition {active
					? 'border-bramble bg-bramble/12 text-fg'
					: 'border-transparent text-fg-dim hover:bg-hover/70 hover:text-fg'}"
				style="padding-left: {0.35 + depth * 0.75}rem"
			>
				<span
					class="grid h-3.5 w-4 shrink-0 place-items-center text-[8.5px] font-bold tracking-tighter"
					style="color: {glyph.color}">{glyph.label}</span
				>
				<span class="truncate">{node.name}</span>
				{#if session.isDirty(node.path)}
					<span class="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-bramble"></span>
				{/if}
			</button>
		{/if}
	{/each}
{/snippet}

<div class="flex h-full min-h-0 flex-col bg-panel">
	<div class="flex h-8 shrink-0 items-center gap-0.5 border-b border-edge-soft px-2">
		<span class="mr-auto truncate text-[10px] tracking-[0.14em] text-fg-faint uppercase">
			Working tree
		</span>
		<button
			onclick={() => startCreate('file')}
			title="New file"
			aria-label="New file"
			class="rounded p-1 text-fg-faint transition hover:bg-hover hover:text-bramble-soft"
		>
			<Icon name="file-plus" size={13} />
		</button>
		<button
			onclick={() => startCreate('folder')}
			title="New folder"
			aria-label="New folder"
			class="rounded p-1 text-fg-faint transition hover:bg-hover hover:text-bramble-soft"
		>
			<Icon name="folder-plus" size={13} />
		</button>
		<button
			onclick={collapseAll}
			title="Collapse all"
			aria-label="Collapse all"
			class="rounded p-1 text-fg-faint transition hover:bg-hover hover:text-bramble-soft"
		>
			<Icon name="panel-left" size={13} />
		</button>
		<button
			onclick={() => void session.refreshTree()}
			title="Refresh from the pod"
			aria-label="Refresh"
			class="rounded p-1 text-fg-faint transition hover:bg-hover hover:text-bramble-soft"
		>
			<Icon name="refresh" size={13} class={session.busy ? 'spin-slow' : ''} />
		</button>
	</div>

	<!-- Right-clicking the empty area targets the repository root. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="min-h-0 flex-1 overflow-y-auto py-1"
		oncontextmenu={(event) => openMenu(event, '', true)}
	>
		{@render treeNodes(fileTree, 0, '')}
		{#if fileTree.length === 0}
			<p class="px-3 py-2 text-[11px] text-fg-faint">Empty working tree.</p>
		{/if}
	</div>
</div>

{#if menu}
	{@const target = menu}
	<button
		type="button"
		aria-label="Close menu"
		class="fixed inset-0 z-40 cursor-default"
		onclick={closeMenu}
		oncontextmenu={(event) => {
			event.preventDefault();
			closeMenu();
		}}
	></button>
	<div
		role="menu"
		tabindex="-1"
		class="fixed z-50 w-44 rounded-lg border border-edge bg-raised p-1 shadow-[0_16px_48px_rgba(0,0,0,0.6)]"
		style="left: {target.x}px; top: {target.y}px;"
	>
		{#if target.isDir}
			{@render menuItem('file-plus', 'New file', () => startCreate('file', target.path))}
			{@render menuItem('folder-plus', 'New folder', () => startCreate('folder', target.path))}
		{/if}
		{#if target.path}
			{#if target.isDir}
				<div class="my-1 h-px bg-edge-soft"></div>
			{/if}
			{@render menuItem('pencil', 'Rename', () => startRename(target.path, target.isDir))}
			{@render menuItem('trash', 'Delete', () => requestDelete(target.path, target.isDir), true)}
		{/if}
	</div>
{/if}

{#if confirmDelete}
	{@const entryName = confirmDelete.path.split('/').pop()}
	<div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
		<div class="w-full max-w-sm rounded-xl border border-edge bg-raised p-5">
			<h3 class="mb-2 text-[13px] font-semibold text-fg">
				Delete {confirmDelete.isDir ? 'folder' : 'file'} "{entryName}"?
			</h3>
			<p class="mb-4 text-[11.5px] leading-relaxed text-fg-dim">
				{#if deleteChildCount > 0}
					It holds {deleteChildCount} file{deleteChildCount === 1 ? '' : 's'}. This removes them from
					the pod and cannot be undone.
				{:else}
					This removes it from the pod and cannot be undone.
				{/if}
			</p>
			{#if deleteError}
				<p class="mb-3 text-[11px] text-thorn">{deleteError}</p>
			{/if}
			<div class="flex justify-end gap-2">
				<button
					type="button"
					disabled={deleteBusy}
					onclick={() => (confirmDelete = null)}
					class="rounded-md px-3 py-1.5 text-[11.5px] text-fg-dim transition hover:bg-hover hover:text-fg disabled:opacity-50"
				>
					Cancel
				</button>
				<button
					type="button"
					disabled={deleteBusy}
					onclick={performDelete}
					class="rounded-md bg-thorn/90 px-3 py-1.5 text-[11.5px] font-medium text-void transition hover:bg-thorn disabled:opacity-60"
				>
					{deleteBusy ? 'Deleting...' : 'Delete'}
				</button>
			</div>
		</div>
	</div>
{/if}
