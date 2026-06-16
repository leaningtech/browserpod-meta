<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import Icon from '@iconify/svelte';
	import CodeMirror from 'svelte-codemirror-editor';
	import { javascript } from '@codemirror/lang-javascript';
	import { lineNumbers } from '@codemirror/view';
	import { oneDark } from '@codemirror/theme-one-dark';

	import type {
		BrowserPod as BrowserPodType,
		Terminal as PodTerminal,
		Process as PodProcess,
		TextFile
	} from '@leaningtech/browserpod';
	import {
		notebookTemplates,
		type NotebookTemplate,
		type WorkbookCell as TemplateCell
	} from '$lib/notebookTemplates';

	let BrowserPod: typeof BrowserPodType | undefined;
	let pod: BrowserPodType | undefined;
	let podReady = $state(false);
	let bootError = $state('');
	let portalUrl = $state('');
	let isUnmounting = false;
	const isProd = import.meta.env.PROD;

	type CellStatus = 'idle' | 'running' | 'done' | 'error';
	type CellKind = 'code' | 'markdown';

	type Cell = {
		id: number;
		kind: CellKind;
		source: string;
		status: CellStatus;
		runCount: number;
		hasOutput: boolean;
		editing: boolean;
		outputEl?: HTMLDivElement;
		terminal?: PodTerminal;
		process?: PodProcess;
	};

	let nextCellId = 1;
	let cells = $state<Cell[]>([]);
	let runningAll = $state(false);
	let activeTemplate = $state<NotebookTemplate | null>(null);
	let showTemplatePicker = $state(false);

	function makeCell(kind: CellKind = 'code', source = ''): Cell {
		return {
			id: nextCellId++,
			kind,
			source,
			status: 'idle',
			runCount: 0,
			hasOutput: false,
			editing: kind === 'markdown' ? source.trim() === '' : false
		};
	}

	function fromTemplateCell(tc: TemplateCell): Cell {
		return makeCell(tc.kind, tc.source);
	}

	// Tiny markdown renderer — handles headings, **bold**, *italic*, `code`, and paragraphs.
	// Templates only use this small subset, and pulling in a full md parser isn't worth it.
	function escapeHtml(s: string): string {
		return s
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function renderMarkdown(src: string): string {
		const lines = src.replace(/\r\n/g, '\n').split('\n');
		const out: string[] = [];
		let para: string[] = [];

		const flushPara = () => {
			if (para.length === 0) return;
			out.push('<p>' + inline(para.join(' ')) + '</p>');
			para = [];
		};

		const inline = (raw: string): string => {
			let s = escapeHtml(raw);
			// `code`
			s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
			// **bold**
			s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
			// *italic*
			s = s.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
			return s;
		};

		for (const line of lines) {
			const heading = line.match(/^(#{1,6})\s+(.*)$/);
			if (heading) {
				flushPara();
				const level = heading[1].length;
				out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
				continue;
			}
			if (line.trim() === '') {
				flushPara();
				continue;
			}
			para.push(line);
		}
		flushPara();
		return out.join('\n');
	}

	async function bootPod() {
		try {
			if (!BrowserPod) {
				const mod = await import('@leaningtech/browserpod');
				BrowserPod = mod.BrowserPod;
			}
			if (isUnmounting) return;

			const apiKey = import.meta.env.VITE_BP_APIKEY || '';
			if (!apiKey) {
				bootError =
					'No BrowserPod API key found. Set VITE_BP_APIKEY in a .env file (see .env.example) and restart the dev server.';
				return;
			}

			pod = await BrowserPod.boot({
				apiKey,
				apiDomain: !isProd ? 'main.browserpods.io' : undefined,
				storageKey: 'nodebooks'
			} as Parameters<typeof BrowserPod.boot>[0]);

			if (isUnmounting) return;

			pod.onPortal(({ url }) => {
				portalUrl = url;
			});

			await pod.createDirectory('/home/user/notebook', { recursive: true });

			podReady = true;
		} catch (err) {
			bootError = err instanceof Error ? err.message : String(err);
		}
	}

	async function ensureTerminal(cell: Cell) {
		if (!pod || cell.terminal || !cell.outputEl) return;
		cell.terminal = await pod.createDefaultTerminal(cell.outputEl);
	}

	async function runCell(cell: Cell) {
		if (!pod || cell.kind !== 'code' || cell.status === 'running') return;

		cell.hasOutput = true;
		await tick();
		await ensureTerminal(cell);
		if (!cell.terminal) return;

		try {
			const filePath = `/home/user/notebook/cell-${cell.id}.js`;
			const file = (await pod.createFile(filePath, 'utf-8')) as TextFile;
			await file.write(cell.source);
			await file.close();

			cell.status = 'running';
			cell.runCount += 1;

			const proc = await pod.run('node', [filePath], {
				terminal: cell.terminal,
				cwd: '/home/user',
				echo: false
			});
			cell.process = proc;

			// pod.run resolves once the process exits; reflect that in status.
			Promise.resolve(proc)
				.then(() => {
					if (cell.status === 'running') cell.status = 'done';
				})
				.catch(() => {
					cell.status = 'error';
				});

			window.dispatchEvent(new Event('resize'));
		} catch (err) {
			cell.status = 'error';
			console.error('[nodebooks] run failed', err);
		}
	}

	async function runAll() {
		if (runningAll) return;
		runningAll = true;
		try {
			for (const cell of cells) {
				if (cell.kind === 'code') await runCell(cell);
			}
		} finally {
			runningAll = false;
		}
	}

	function addCell(kind: CellKind = 'code', afterId?: number) {
		const fresh = makeCell(kind);
		if (afterId == null) {
			cells.push(fresh);
		} else {
			const idx = cells.findIndex((c) => c.id === afterId);
			cells.splice(idx + 1, 0, fresh);
		}
	}

	function deleteCell(id: number) {
		const idx = cells.findIndex((c) => c.id === id);
		if (idx === -1) return;
		cells.splice(idx, 1);
	}

	function moveCell(id: number, dir: -1 | 1) {
		const idx = cells.findIndex((c) => c.id === id);
		const target = idx + dir;
		if (idx === -1 || target < 0 || target >= cells.length) return;
		const [c] = cells.splice(idx, 1);
		cells.splice(target, 0, c);
	}

	function clearOutput(cell: Cell) {
		if (cell.outputEl) cell.outputEl.innerHTML = '';
		cell.terminal = undefined;
		cell.hasOutput = false;
		cell.status = 'idle';
	}

	function statusLabel(c: Cell) {
		switch (c.status) {
			case 'running':
				return 'running…';
			case 'done':
				return `ran ${c.runCount}×`;
			case 'error':
				return 'error';
			default:
				return c.runCount > 0 ? `ran ${c.runCount}×` : 'never run';
		}
	}

	function pickTemplate(t: NotebookTemplate) {
		activeTemplate = t;
		cells = t.cells.map(fromTemplateCell);
		showTemplatePicker = false;
	}

	function openTemplatePicker() {
		if (cells.length > 0) {
			const ok = window.confirm(
				'Replace the current notebook? Your cells and any output will be cleared.'
			);
			if (!ok) return;
		}
		showTemplatePicker = true;
	}

	onMount(() => {
		void bootPod();
	});

	onDestroy(() => {
		isUnmounting = true;
		pod?.shutdown?.();
	});
</script>

<svelte:head>
	<title>BrowserPod Nodebooks</title>
	<meta
		name="description"
		content="Run Node.js cells with markdown explanations in a live BrowserPod sandbox — like Jupyter, for JavaScript."
	/>
</svelte:head>

<main class="app">
	<div class="page-header page-header--row">
		<div>
			<h1>BrowserPod Nodebooks</h1>
			<p>
				A stack of Node.js cells with markdown explanations, running in a single BrowserPod sandbox.
				Files persist across cells, but each run is a fresh <code>node</code> process — like
				Jupyter, but for JavaScript.
			</p>
		</div>
		<div class="header-actions">
			<button class="action-btn" type="button" on:click={openTemplatePicker}>
				<Icon icon="mingcute:layout-grid-line" width="13" height="13" />
				<span>Templates</span>
			</button>
			<button
				class="action-btn"
				type="button"
				disabled={!podReady || runningAll || cells.length === 0}
				on:click={runAll}
			>
				<Icon icon="mingcute:play-fill" width="13" height="13" />
				<span>Run all</span>
			</button>
			<button class="action-btn" type="button" on:click={() => addCell('code')}>
				<Icon icon="mingcute:add-line" width="13" height="13" />
				<span>Add code cell</span>
			</button>
			<button class="action-btn" type="button" on:click={() => addCell('markdown')}>
				<Icon icon="mingcute:text-line" width="13" height="13" />
				<span>Add note</span>
			</button>
		</div>
	</div>

	{#if activeTemplate && cells.length > 0}
		<div class="active-template">
			<Icon icon={activeTemplate.icon} width="14" height="14" />
			<span class="active-template-label">{activeTemplate.label}</span>
			<span class="active-template-desc">{activeTemplate.description}</span>
			<span class="active-template-lang">node</span>
		</div>
	{/if}

	{#if bootError}
		<div class="boot-error">
			<Icon icon="mingcute:alert-line" width="14" height="14" />
			<span>{bootError}</span>
		</div>
	{:else if portalUrl}
		<div class="portal-row">
			<span class="portal-pill">
				<Icon icon="mingcute:link-line" width="12" height="12" />
				<a href={portalUrl} target="_blank" rel="noopener noreferrer">{portalUrl}</a>
			</span>
		</div>
	{/if}

	{#if showTemplatePicker || cells.length === 0}
		<div class="template-picker">
			<div class="template-picker-header">
				<h2>{cells.length === 0 ? 'Pick a notebook to start with' : 'Choose a new notebook'}</h2>
				<p>
					Each template lays down a stack of runnable Node.js cells with markdown notes between
					them. You can edit anything afterwards.
				</p>
			</div>

			<div class="template-grid">
				{#each notebookTemplates as t (t.id)}
					<button
						class="template-card"
						class:template-card--blank={t.id === 'blank'}
						type="button"
						on:click={() => pickTemplate(t)}
					>
						<div class="template-card-icon">
							<Icon icon={t.icon} width="22" height="22" />
						</div>
						<div class="template-card-body">
							<div class="template-card-title-row">
								<span class="template-card-title">{t.label}</span>
							</div>
							<p class="template-card-desc">{t.description}</p>
							<span class="template-card-meta">
								{t.cells.length}
								{t.cells.length === 1 ? 'cell' : 'cells'}
							</span>
						</div>
					</button>
				{/each}
			</div>

			{#if cells.length > 0}
				<div class="template-picker-footer">
					<button class="ghost-btn" type="button" on:click={() => (showTemplatePicker = false)}>
						<Icon icon="mingcute:close-line" width="12" height="12" />
						<span>Cancel</span>
					</button>
				</div>
			{/if}
		</div>
	{:else}
		<div class="cell-stack">
			{#each cells as cell, idx (cell.id)}
				<div
					class="cell"
					class:cell--running={cell.status === 'running'}
					class:cell--md={cell.kind === 'markdown'}
				>
					<div class="cell-gutter">
						<span class="cell-index">
							{cell.kind === 'markdown' ? 'md' : `[${idx + 1}]`}
						</span>
						<button
							class="gutter-btn"
							type="button"
							title="Move up"
							disabled={idx === 0}
							on:click={() => moveCell(cell.id, -1)}
						>
							<Icon icon="mingcute:up-line" width="12" height="12" />
						</button>
						<button
							class="gutter-btn"
							type="button"
							title="Move down"
							disabled={idx === cells.length - 1}
							on:click={() => moveCell(cell.id, 1)}
						>
							<Icon icon="mingcute:down-line" width="12" height="12" />
						</button>
					</div>

					<div class="cell-body">
						{#if cell.kind === 'code'}
							<div class="cell-toolbar">
								<button
									class="run-btn"
									type="button"
									disabled={!podReady || cell.status === 'running'}
									on:click={() => runCell(cell)}
								>
									<Icon
										icon={cell.status === 'running' ? 'mingcute:loading-line' : 'mingcute:play-fill'}
										width="12"
										height="12"
									/>
									<span>{cell.status === 'running' ? 'Running' : 'Run'}</span>
								</button>
								<span class="status" class:status--err={cell.status === 'error'}>
									{statusLabel(cell)}
								</span>
								<span class="toolbar-spacer"></span>
								{#if cell.hasOutput}
									<button class="ghost-btn" type="button" on:click={() => clearOutput(cell)}>
										<Icon icon="mingcute:eraser-line" width="12" height="12" />
										<span>Clear output</span>
									</button>
								{/if}
								<button class="ghost-btn" type="button" on:click={() => addCell('code', cell.id)}>
									<Icon icon="mingcute:add-line" width="12" height="12" />
									<span>Code below</span>
								</button>
								<button class="ghost-btn" type="button" on:click={() => addCell('markdown', cell.id)}>
									<Icon icon="mingcute:text-line" width="12" height="12" />
									<span>Note below</span>
								</button>
								<button
									class="ghost-btn ghost-btn--danger"
									type="button"
									on:click={() => deleteCell(cell.id)}
								>
									<Icon icon="mingcute:delete-2-line" width="12" height="12" />
								</button>
							</div>

							<div class="editor-wrap">
								<CodeMirror
									bind:value={cell.source}
									lang={javascript()}
									theme={oneDark}
									extensions={[lineNumbers()]}
									styles={{
										'&': {
											backgroundColor: '#0c0c0e',
											fontSize: '13px',
											fontFamily: 'JetBrains Mono, Fira Code, monospace'
										},
										'.cm-gutters': {
											backgroundColor: '#0c0c0e',
											borderRight: '1px solid #1c1c1f'
										}
									}}
								/>
							</div>

							{#if cell.hasOutput}
								<div class="output-wrap">
									<div class="output-label">Output</div>
									<div class="output-terminal" bind:this={cell.outputEl}></div>
								</div>
							{/if}
						{:else}
							<div class="md-toolbar">
								<span class="md-label">
									<Icon icon="mingcute:text-line" width="12" height="12" />
									<span>Note</span>
								</span>
								<span class="toolbar-spacer"></span>
								<button class="ghost-btn" type="button" on:click={() => (cell.editing = !cell.editing)}>
									<Icon
										icon={cell.editing ? 'mingcute:check-line' : 'mingcute:edit-2-line'}
										width="12"
										height="12"
									/>
									<span>{cell.editing ? 'Done' : 'Edit'}</span>
								</button>
								<button class="ghost-btn" type="button" on:click={() => addCell('code', cell.id)}>
									<Icon icon="mingcute:add-line" width="12" height="12" />
									<span>Code below</span>
								</button>
								<button class="ghost-btn" type="button" on:click={() => addCell('markdown', cell.id)}>
									<Icon icon="mingcute:text-line" width="12" height="12" />
									<span>Note below</span>
								</button>
								<button
									class="ghost-btn ghost-btn--danger"
									type="button"
									on:click={() => deleteCell(cell.id)}
								>
									<Icon icon="mingcute:delete-2-line" width="12" height="12" />
								</button>
							</div>

							{#if cell.editing}
								<textarea
									class="md-editor"
									bind:value={cell.source}
									placeholder="# Heading

Write a note in markdown..."
								></textarea>
							{:else}
								<button
									class="md-rendered"
									type="button"
									title="Click to edit"
									on:click={() => (cell.editing = true)}
								>
									{@html renderMarkdown(cell.source || '_Empty note — click to edit._')}
								</button>
							{/if}
						{/if}
					</div>
				</div>
			{/each}

			<div class="add-cell-row">
				<button class="add-cell-bottom" type="button" on:click={() => addCell('code')}>
					<Icon icon="mingcute:add-line" width="14" height="14" />
					<span>Add code cell</span>
				</button>
				<button class="add-cell-bottom" type="button" on:click={() => addCell('markdown')}>
					<Icon icon="mingcute:text-line" width="14" height="14" />
					<span>Add note</span>
				</button>
			</div>
		</div>
	{/if}
</main>

<style>
	.app {
		max-width: 960px;
		margin: 0 auto;
		padding: 1.75rem 2rem;
	}

	.page-header--row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	.page-header--row code {
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
		font-size: 0.85em;
		padding: 1px 5px;
		background: #18181b;
		border: 1px solid #27272a;
		border-radius: 4px;
	}

	.header-actions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		background: #18181b;
		border: 1px solid #2d2d30;
		border-radius: 6px;
		color: #a1a1aa;
		font-size: 12.5px;
		font-weight: 500;
		font-family: inherit;
		cursor: pointer;
		transition:
			background 0.1s,
			border-color 0.1s,
			color 0.1s;
	}
	.action-btn:hover:not(:disabled) {
		background: #222225;
		border-color: #3f3f46;
		color: #e4e4e7;
	}
	.action-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.boot-error {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 13px;
		color: #f87171;
		padding: 0.625rem 0;
	}
	.portal-row {
		padding: 0.5rem 0;
	}
	.portal-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.6rem;
		background: rgba(34, 197, 94, 0.08);
		border: 1px solid rgba(34, 197, 94, 0.25);
		border-radius: 999px;
		font-size: 12px;
		color: #86efac;
	}
	.portal-pill a {
		color: inherit;
		text-decoration: none;
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
	}
	.portal-pill a:hover {
		text-decoration: underline;
	}

	.cell-stack {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		margin-top: 0.5rem;
	}

	.cell {
		display: grid;
		grid-template-columns: 44px 1fr;
		gap: 0.5rem;
		align-items: stretch;
		background: transparent;
		border-radius: 8px;
	}
	.cell--running {
		box-shadow: 0 0 0 1px rgba(234, 179, 8, 0.18);
	}

	.cell-gutter {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding-top: 0.5rem;
	}
	.cell-index {
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
		font-size: 11px;
		color: #52525b;
	}
	.gutter-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		padding: 0;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 4px;
		color: #52525b;
		cursor: pointer;
		transition:
			background 0.1s,
			border-color 0.1s,
			color 0.1s;
	}
	.gutter-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.04);
		border-color: #2d2d30;
		color: #a1a1aa;
	}
	.gutter-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.cell-body {
		display: flex;
		flex-direction: column;
		background: #0c0c0e;
		border: 1px solid #1c1c1f;
		border-radius: 8px;
		overflow: hidden;
	}

	.cell-toolbar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.5rem;
		background: #111113;
		border-bottom: 1px solid #1c1c1f;
	}

	.run-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.3rem 0.6rem;
		background: rgba(34, 197, 94, 0.08);
		border: 1px solid rgba(34, 197, 94, 0.25);
		border-radius: 5px;
		color: #86efac;
		font-size: 12px;
		font-weight: 500;
		font-family: inherit;
		cursor: pointer;
		transition:
			background 0.1s,
			border-color 0.1s,
			color 0.1s;
	}
	.run-btn:hover:not(:disabled) {
		background: rgba(34, 197, 94, 0.14);
		border-color: rgba(34, 197, 94, 0.4);
		color: #bbf7d0;
	}
	.run-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.status {
		font-size: 11.5px;
		color: #52525b;
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
	}
	.status--err {
		color: #f87171;
	}

	.toolbar-spacer {
		flex: 1;
	}

	.ghost-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.25rem 0.5rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 5px;
		color: #71717a;
		font-size: 11.5px;
		font-family: inherit;
		cursor: pointer;
		transition:
			background 0.1s,
			border-color 0.1s,
			color 0.1s;
	}
	.ghost-btn:hover {
		background: rgba(255, 255, 255, 0.04);
		border-color: #2d2d30;
		color: #e4e4e7;
	}
	.ghost-btn--danger:hover {
		color: #f87171;
		border-color: rgba(248, 113, 113, 0.3);
	}

	.editor-wrap {
		background: #0c0c0e;
	}
	.editor-wrap :global(.cm-editor) {
		min-height: 60px;
	}
	.editor-wrap :global(.cm-content) {
		padding: 0.5rem 0;
	}

	.output-wrap {
		display: flex;
		flex-direction: column;
		background: #060607;
		border-top: 1px solid #1c1c1f;
	}
	.output-label {
		padding: 0.3rem 0.625rem;
		font-size: 10.5px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #52525b;
		border-bottom: 1px solid #141416;
	}
	.output-terminal {
		position: relative;
		height: 220px;
		padding-left: 0.5rem;
	}
	.output-terminal :global(.terminal),
	.output-terminal :global(.xterm) {
		width: 100% !important;
		height: 100% !important;
	}
	.output-terminal :global(.xterm-viewport),
	.output-terminal :global(.xterm-screen) {
		width: 100% !important;
		height: 100% !important;
	}
	.output-terminal :global(.xterm-rows) {
		font-size: 0.78rem !important;
	}

	.add-cell-row {
		display: flex;
		gap: 0.5rem;
		margin-left: 52px;
		margin-top: 0.25rem;
	}

	.add-cell-bottom {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.4rem 0.75rem;
		background: transparent;
		border: 1px dashed #2d2d30;
		border-radius: 6px;
		color: #71717a;
		font-size: 12.5px;
		font-family: inherit;
		cursor: pointer;
		transition:
			background 0.1s,
			border-color 0.1s,
			color 0.1s;
	}
	.add-cell-bottom:hover {
		background: rgba(255, 255, 255, 0.03);
		border-color: #3f3f46;
		color: #e4e4e7;
	}

	.cell--md .cell-body {
		background: #0a0a0c;
	}
	.cell--md .cell-index {
		color: #3f3f46;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.md-toolbar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.5rem;
		background: transparent;
		border-bottom: 1px solid #141416;
		opacity: 0.6;
		transition: opacity 0.1s;
	}
	.cell--md:hover .md-toolbar {
		opacity: 1;
	}
	.md-label {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.15rem 0.5rem;
		font-size: 11px;
		font-weight: 500;
		color: #71717a;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid #1c1c1f;
		border-radius: 999px;
	}

	.md-editor {
		display: block;
		width: 100%;
		min-height: 120px;
		padding: 0.75rem 1rem;
		background: #0c0c0e;
		border: none;
		outline: none;
		color: #d4d4d8;
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
		font-size: 13px;
		line-height: 1.55;
		resize: vertical;
	}

	.md-rendered {
		display: block;
		width: 100%;
		padding: 0.75rem 1rem;
		background: transparent;
		border: none;
		text-align: left;
		font-family: inherit;
		color: #d4d4d8;
		font-size: 14px;
		line-height: 1.6;
		cursor: text;
	}
	.md-rendered:hover {
		background: rgba(255, 255, 255, 0.015);
	}
	.md-rendered :global(h1),
	.md-rendered :global(h2),
	.md-rendered :global(h3),
	.md-rendered :global(h4) {
		color: #f4f4f5;
		margin: 0.6em 0 0.4em;
		font-weight: 600;
		line-height: 1.3;
	}
	.md-rendered :global(h1) {
		font-size: 22px;
	}
	.md-rendered :global(h2) {
		font-size: 18px;
	}
	.md-rendered :global(h3) {
		font-size: 15px;
	}
	.md-rendered :global(p) {
		margin: 0.5em 0;
		color: #c7c7cc;
	}
	.md-rendered :global(p:first-child) {
		margin-top: 0;
	}
	.md-rendered :global(p:last-child) {
		margin-bottom: 0;
	}
	.md-rendered :global(strong) {
		color: #f4f4f5;
		font-weight: 600;
	}
	.md-rendered :global(em) {
		color: #e4e4e7;
		font-style: italic;
	}
	.md-rendered :global(code) {
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
		font-size: 0.88em;
		padding: 1px 6px;
		background: #18181b;
		border: 1px solid #27272a;
		border-radius: 4px;
		color: #e4e4e7;
	}

	.active-template {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.25rem;
		padding: 0.5rem 0.75rem;
		background: #0c0c0e;
		border: 1px solid #1c1c1f;
		border-radius: 6px;
		color: #a1a1aa;
		font-size: 12.5px;
	}
	.active-template-label {
		color: #e4e4e7;
		font-weight: 500;
	}
	.active-template-desc {
		color: #71717a;
	}
	.active-template-lang {
		margin-left: auto;
		padding-left: 0.75rem;
		color: #52525b;
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
		font-size: 11.5px;
	}

	.template-picker {
		margin-top: 0.5rem;
		padding: 1rem 0;
	}
	.template-picker-header h2 {
		margin: 0 0 0.25rem;
		font-size: 16px;
		font-weight: 600;
		color: #e4e4e7;
	}
	.template-picker-header p {
		margin: 0 0 1rem;
		color: #71717a;
		font-size: 13px;
	}

	.template-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 0.75rem;
	}

	.template-card {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
		padding: 0.875rem 1rem;
		background: #0c0c0e;
		border: 1px solid #1c1c1f;
		border-radius: 8px;
		text-align: left;
		font-family: inherit;
		color: inherit;
		cursor: pointer;
		transition:
			background 0.1s,
			border-color 0.1s,
			transform 0.1s;
	}
	.template-card:hover {
		background: #111114;
		border-color: #2d2d30;
		transform: translateY(-1px);
	}
	.template-card--blank {
		border-style: dashed;
	}

	.template-card-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		background: #18181b;
		border: 1px solid #27272a;
		border-radius: 8px;
		color: #d4d4d8;
		flex-shrink: 0;
	}

	.template-card-body {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}

	.template-card-title-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.template-card-title {
		font-size: 13.5px;
		font-weight: 600;
		color: #e4e4e7;
	}
	.template-card-desc {
		margin: 0;
		font-size: 12px;
		color: #71717a;
		line-height: 1.45;
	}
	.template-card-meta {
		margin-top: 0.2rem;
		font-size: 11px;
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
		color: #52525b;
	}

	.template-picker-footer {
		display: flex;
		justify-content: flex-end;
		margin-top: 1rem;
	}
</style>
