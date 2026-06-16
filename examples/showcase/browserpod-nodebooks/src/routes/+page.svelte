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
	import { gooseSvg } from '$lib/goose';

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
	<title>NodeBooks — a notebook with a honk</title>
	<meta
		name="description"
		content="Run Node.js cells with markdown notes in a live BrowserPod sandbox — Jupyter, for JavaScript, with a studious goose."
	/>
</svelte:head>

<main class="app">
	<header class="masthead">
		<div class="masthead-goose" aria-hidden="true">
			{@html gooseSvg}
		</div>
		<div class="masthead-words">
			<h1 class="wordmark">NodeBooks</h1>
			<p class="tagline">
				A stack of Node.js cells with markdown notes, running live in one BrowserPod sandbox.
				Files stay put between cells, but every run is a fresh <code>node</code> — Jupyter, with a
				honk.
			</p>
		</div>
	</header>

	<div class="toolbar-row">
		<div class="header-actions">
			<button class="action-btn" type="button" onclick={openTemplatePicker}>
				<Icon icon="mingcute:layout-grid-line" width="13" height="13" />
				<span>Templates</span>
			</button>
			<button
				class="action-btn"
				type="button"
				disabled={!podReady || runningAll || cells.length === 0}
				onclick={runAll}
			>
				<Icon icon="mingcute:play-fill" width="13" height="13" />
				<span>Run all</span>
			</button>
			<button class="action-btn" type="button" onclick={() => addCell('code')}>
				<Icon icon="mingcute:add-line" width="13" height="13" />
				<span>Add code cell</span>
			</button>
			<button class="action-btn" type="button" onclick={() => addCell('markdown')}>
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
					them. Edit anything afterwards — the goose won't mind.
				</p>
			</div>

			<div class="template-grid">
				{#each notebookTemplates as t (t.id)}
					<button
						class="template-card"
						class:template-card--blank={t.id === 'blank'}
						type="button"
						onclick={() => pickTemplate(t)}
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
					<button class="ghost-btn" type="button" onclick={() => (showTemplatePicker = false)}>
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
							onclick={() => moveCell(cell.id, -1)}
						>
							<Icon icon="mingcute:up-line" width="12" height="12" />
						</button>
						<button
							class="gutter-btn"
							type="button"
							title="Move down"
							disabled={idx === cells.length - 1}
							onclick={() => moveCell(cell.id, 1)}
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
									onclick={() => runCell(cell)}
								>
									<Icon
										icon={cell.status === 'running'
											? 'mingcute:loading-line'
											: 'mingcute:play-fill'}
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
									<button class="ghost-btn" type="button" onclick={() => clearOutput(cell)}>
										<Icon icon="mingcute:eraser-line" width="12" height="12" />
										<span>Clear output</span>
									</button>
								{/if}
								<button class="ghost-btn" type="button" onclick={() => addCell('code', cell.id)}>
									<Icon icon="mingcute:add-line" width="12" height="12" />
									<span>Code below</span>
								</button>
								<button
									class="ghost-btn"
									type="button"
									onclick={() => addCell('markdown', cell.id)}
								>
									<Icon icon="mingcute:text-line" width="12" height="12" />
									<span>Note below</span>
								</button>
								<button
									class="ghost-btn ghost-btn--danger"
									type="button"
									onclick={() => deleteCell(cell.id)}
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
								<button
									class="ghost-btn"
									type="button"
									onclick={() => (cell.editing = !cell.editing)}
								>
									<Icon
										icon={cell.editing ? 'mingcute:check-line' : 'mingcute:edit-2-line'}
										width="12"
										height="12"
									/>
									<span>{cell.editing ? 'Done' : 'Edit'}</span>
								</button>
								<button class="ghost-btn" type="button" onclick={() => addCell('code', cell.id)}>
									<Icon icon="mingcute:add-line" width="12" height="12" />
									<span>Code below</span>
								</button>
								<button
									class="ghost-btn"
									type="button"
									onclick={() => addCell('markdown', cell.id)}
								>
									<Icon icon="mingcute:text-line" width="12" height="12" />
									<span>Note below</span>
								</button>
								<button
									class="ghost-btn ghost-btn--danger"
									type="button"
									onclick={() => deleteCell(cell.id)}
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
									onclick={() => (cell.editing = true)}
								>
									{@html renderMarkdown(cell.source || '_Empty note — click to edit._')}
								</button>
							{/if}
						{/if}
					</div>
				</div>
			{/each}

			<div class="add-cell-row">
				<button class="add-cell-bottom" type="button" onclick={() => addCell('code')}>
					<Icon icon="mingcute:add-line" width="14" height="14" />
					<span>Add code cell</span>
				</button>
				<button class="add-cell-bottom" type="button" onclick={() => addCell('markdown')}>
					<Icon icon="mingcute:text-line" width="14" height="14" />
					<span>Add note</span>
				</button>
			</div>
		</div>
	{/if}
</main>

<style>
	.app {
		max-width: 920px;
		margin: 0 auto;
		padding: 1.75rem 1.5rem 4rem;
	}

	/* ── Masthead: the red goose poster ──────────────────────────────────────── */
	.masthead {
		position: relative;
		display: flex;
		align-items: center;
		gap: 1.25rem;
		padding: 1.4rem 1.6rem;
		background: var(--red);
		background-image: radial-gradient(140% 120% at 85% -20%, var(--red) 30%, var(--red-deep));
		border: 3px solid var(--ink);
		border-radius: 22px;
		box-shadow: 6px 7px 0 var(--ink);
		overflow: hidden;
	}
	/* faint book-spine confetti in the corner */
	.masthead::after {
		content: '';
		position: absolute;
		right: -30px;
		bottom: -40px;
		width: 160px;
		height: 160px;
		background: radial-gradient(circle, rgba(255, 250, 240, 0.14) 2px, transparent 2.5px);
		background-size: 16px 16px;
		transform: rotate(12deg);
		pointer-events: none;
	}

	.masthead-goose {
		flex-shrink: 0;
		width: 96px;
		height: 96px;
		filter: drop-shadow(2px 3px 0 rgba(0, 0, 0, 0.18));
		transform-origin: 60% 80%;
		animation: goose-bob 4.5s ease-in-out infinite;
	}
	.masthead-goose :global(svg) {
		width: 100%;
		height: 100%;
		display: block;
	}
	@keyframes goose-bob {
		0%, 100% { transform: translateY(0) rotate(-1.5deg); }
		50% { transform: translateY(-4px) rotate(1.5deg); }
	}

	.masthead-words {
		min-width: 0;
	}
	.wordmark {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 900;
		font-size: clamp(2rem, 6vw, 2.9rem);
		line-height: 0.95;
		letter-spacing: -0.02em;
		color: var(--paper);
		text-shadow: 2px 3px 0 var(--red-ink);
	}
	.tagline {
		margin: 0.5rem 0 0;
		max-width: 46ch;
		font-size: 14px;
		font-weight: 600;
		line-height: 1.5;
		color: rgba(255, 250, 240, 0.92);
	}
	.tagline code {
		font-family: var(--font-mono);
		font-size: 0.85em;
		padding: 1px 6px;
		background: var(--red-ink);
		border-radius: 5px;
		color: #ffe7c2;
	}

	/* ── Toolbar row under the masthead ──────────────────────────────────────── */
	.toolbar-row {
		display: flex;
		justify-content: flex-end;
		margin: 1.1rem 0 0.25rem;
	}
	.header-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.45rem 0.85rem;
		background: var(--paper);
		border: 2px solid var(--ink);
		border-radius: 999px;
		color: var(--ink);
		font-size: 13px;
		font-weight: 700;
		font-family: var(--font-body);
		cursor: pointer;
		box-shadow: 2px 2px 0 var(--ink);
		transition:
			transform 0.08s,
			box-shadow 0.08s,
			background 0.1s;
	}
	.action-btn:hover:not(:disabled) {
		background: #fff;
		transform: translate(-1px, -1px);
		box-shadow: 3px 3px 0 var(--ink);
	}
	.action-btn:active:not(:disabled) {
		transform: translate(1px, 1px);
		box-shadow: 1px 1px 0 var(--ink);
	}
	.action-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
		box-shadow: none;
	}

	.boot-error {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.75rem;
		padding: 0.7rem 0.9rem;
		font-size: 13px;
		font-weight: 600;
		color: var(--red-ink);
		background: #fde4df;
		border: 2px solid var(--red);
		border-radius: 12px;
	}
	.portal-row {
		padding: 0.75rem 0 0;
	}
	.portal-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.75rem;
		background: rgba(47, 156, 143, 0.12);
		border: 2px solid var(--spine-teal);
		border-radius: 999px;
		font-size: 12.5px;
		font-weight: 700;
		color: #1f6b62;
	}
	.portal-pill a {
		color: inherit;
		text-decoration: none;
		font-family: var(--font-mono);
		font-weight: 500;
	}
	.portal-pill a:hover {
		text-decoration: underline;
	}

	/* ── Cell stack ──────────────────────────────────────────────────────────── */
	.cell-stack {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 1rem;
	}

	.cell {
		display: grid;
		grid-template-columns: 40px 1fr;
		gap: 0.5rem;
		align-items: stretch;
	}

	.cell-gutter {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		padding-top: 0.6rem;
	}
	.cell-index {
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 700;
		color: var(--red-deep);
	}
	.gutter-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		background: var(--paper);
		border: 2px solid var(--line-2);
		border-radius: 8px;
		color: var(--ink-3);
		cursor: pointer;
		transition:
			border-color 0.1s,
			color 0.1s,
			transform 0.08s;
	}
	.gutter-btn:hover:not(:disabled) {
		border-color: var(--ink);
		color: var(--ink);
		transform: translateY(-1px);
	}
	.gutter-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.cell-body {
		display: flex;
		flex-direction: column;
		background: var(--paper);
		border: 2.5px solid var(--ink);
		border-radius: 14px;
		box-shadow: 3px 4px 0 rgba(43, 33, 24, 0.14);
		overflow: hidden;
	}
	.cell--running .cell-body {
		box-shadow: 0 0 0 3px var(--spine-gold), 3px 4px 0 rgba(43, 33, 24, 0.14);
	}

	.cell-toolbar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.6rem;
		background: var(--cream);
		border-bottom: 2px solid var(--line);
	}

	.run-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.35rem 0.75rem;
		background: var(--spine-teal);
		border: 2px solid var(--ink);
		border-radius: 999px;
		color: #fff;
		font-size: 12.5px;
		font-weight: 700;
		font-family: var(--font-body);
		cursor: pointer;
		box-shadow: 2px 2px 0 var(--ink);
		transition:
			transform 0.08s,
			box-shadow 0.08s,
			background 0.1s;
	}
	.run-btn:hover:not(:disabled) {
		background: #34b3a4;
		transform: translate(-1px, -1px);
		box-shadow: 3px 3px 0 var(--ink);
	}
	.run-btn:active:not(:disabled) {
		transform: translate(1px, 1px);
		box-shadow: 1px 1px 0 var(--ink);
	}
	.run-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		box-shadow: none;
	}

	.status {
		font-size: 11.5px;
		font-weight: 700;
		color: var(--ink-3);
		font-family: var(--font-mono);
	}
	.status--err {
		color: var(--red-deep);
	}

	.toolbar-spacer {
		flex: 1;
	}

	.ghost-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.3rem 0.6rem;
		background: transparent;
		border: 2px solid transparent;
		border-radius: 999px;
		color: var(--ink-2);
		font-size: 12px;
		font-weight: 700;
		font-family: var(--font-body);
		cursor: pointer;
		transition:
			background 0.1s,
			border-color 0.1s,
			color 0.1s;
	}
	.ghost-btn:hover {
		background: var(--cream);
		border-color: var(--line-2);
		color: var(--ink);
	}
	.ghost-btn--danger:hover {
		color: var(--red-deep);
		border-color: var(--red);
		background: #fde4df;
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
		background: #0a0a0c;
		border-top: 2px solid var(--ink);
	}
	.output-label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.7rem;
		font-size: 10.5px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--spine-gold);
		background: #111016;
		border-bottom: 1px solid #1c1b22;
	}
	.output-label::before {
		content: '';
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--spine-gold);
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
		gap: 0.6rem;
		margin-left: 48px;
		margin-top: 0.5rem;
	}

	.add-cell-bottom {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 0.9rem;
		background: transparent;
		border: 2.5px dashed var(--line-2);
		border-radius: 999px;
		color: var(--ink-2);
		font-size: 13px;
		font-weight: 700;
		font-family: var(--font-body);
		cursor: pointer;
		transition:
			background 0.1s,
			border-color 0.1s,
			color 0.1s;
	}
	.add-cell-bottom:hover {
		background: var(--paper);
		border-color: var(--ink);
		color: var(--ink);
	}

	/* ── Markdown note cells ─────────────────────────────────────────────────── */
	.cell--md .cell-body {
		background: var(--paper);
		border-style: dashed;
		box-shadow: none;
	}
	.cell--md .cell-index {
		color: var(--spine-plum);
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.md-toolbar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.6rem;
		background: transparent;
		border-bottom: 1px dashed var(--line);
		opacity: 0.65;
		transition: opacity 0.1s;
	}
	.cell--md:hover .md-toolbar {
		opacity: 1;
	}
	.md-label {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.2rem 0.6rem;
		font-size: 11px;
		font-weight: 800;
		color: var(--spine-plum);
		background: rgba(123, 94, 167, 0.1);
		border: 1.5px solid rgba(123, 94, 167, 0.4);
		border-radius: 999px;
	}

	.md-editor {
		display: block;
		width: 100%;
		min-height: 120px;
		padding: 0.85rem 1.1rem;
		background: var(--cream);
		border: none;
		outline: none;
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 13px;
		line-height: 1.6;
		resize: vertical;
	}

	.md-rendered {
		display: block;
		width: 100%;
		padding: 0.85rem 1.1rem;
		background: transparent;
		border: none;
		text-align: left;
		font-family: var(--font-body);
		color: var(--ink-2);
		font-size: 14.5px;
		line-height: 1.65;
		cursor: text;
	}
	.md-rendered:hover {
		background: rgba(43, 33, 24, 0.02);
	}
	.md-rendered :global(h1),
	.md-rendered :global(h2),
	.md-rendered :global(h3),
	.md-rendered :global(h4) {
		font-family: var(--font-display);
		color: var(--ink);
		margin: 0.6em 0 0.4em;
		font-weight: 700;
		line-height: 1.2;
	}
	.md-rendered :global(h1) {
		font-size: 26px;
		color: var(--red-deep);
	}
	.md-rendered :global(h2) {
		font-size: 20px;
	}
	.md-rendered :global(h3) {
		font-size: 16px;
	}
	.md-rendered :global(p) {
		margin: 0.5em 0;
		color: var(--ink-2);
	}
	.md-rendered :global(p:first-child) {
		margin-top: 0;
	}
	.md-rendered :global(p:last-child) {
		margin-bottom: 0;
	}
	.md-rendered :global(strong) {
		color: var(--ink);
		font-weight: 800;
	}
	.md-rendered :global(em) {
		color: var(--ink);
		font-style: italic;
	}
	.md-rendered :global(code) {
		font-family: var(--font-mono);
		font-size: 0.86em;
		padding: 1px 6px;
		background: var(--cream);
		border: 1px solid var(--line-2);
		border-radius: 5px;
		color: var(--red-ink);
	}

	/* ── Active template strip ───────────────────────────────────────────────── */
	.active-template {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		margin-top: 0.75rem;
		padding: 0.55rem 0.85rem;
		background: var(--paper);
		border: 2px solid var(--ink);
		border-radius: 999px;
		box-shadow: 2px 2px 0 var(--ink);
		color: var(--ink-2);
		font-size: 13px;
	}
	.active-template :global(svg) {
		color: var(--spine-teal);
	}
	.active-template-label {
		color: var(--ink);
		font-weight: 800;
	}
	.active-template-desc {
		color: var(--ink-3);
	}
	.active-template-lang {
		margin-left: auto;
		padding: 0.1rem 0.55rem;
		background: var(--ink);
		color: var(--paper);
		border-radius: 999px;
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 700;
	}

	/* ── Template picker: a shelf of book-spine cards ────────────────────────── */
	.template-picker {
		margin-top: 1rem;
		padding: 0.5rem 0 0;
	}
	.template-picker-header h2 {
		margin: 0 0 0.3rem;
		font-family: var(--font-display);
		font-size: 24px;
		font-weight: 700;
		color: var(--ink);
	}
	.template-picker-header p {
		margin: 0 0 1.25rem;
		color: var(--ink-2);
		font-size: 14px;
		font-weight: 600;
		max-width: 54ch;
	}

	.template-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
		gap: 0.9rem;
	}

	.template-card {
		position: relative;
		display: flex;
		gap: 0.85rem;
		align-items: flex-start;
		padding: 1rem 1.1rem 1rem 1.3rem;
		background: var(--paper);
		border: 2.5px solid var(--ink);
		border-radius: 14px;
		box-shadow: 3px 4px 0 var(--ink);
		text-align: left;
		font-family: var(--font-body);
		color: inherit;
		cursor: pointer;
		overflow: hidden;
		transition:
			transform 0.1s,
			box-shadow 0.1s;
	}
	/* coloured book-spine down the left edge, cycling the palette */
	.template-card::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 8px;
		background: var(--spine-teal);
	}
	.template-card:nth-child(4n + 2)::before {
		background: var(--spine-gold);
	}
	.template-card:nth-child(4n + 3)::before {
		background: var(--spine-pink);
	}
	.template-card:nth-child(4n + 4)::before {
		background: var(--spine-plum);
	}
	.template-card:hover {
		transform: translate(-2px, -2px);
		box-shadow: 5px 6px 0 var(--ink);
	}
	.template-card--blank {
		border-style: dashed;
		box-shadow: none;
	}
	.template-card--blank::before {
		background: var(--line-2);
	}
	.template-card--blank:hover {
		box-shadow: 3px 4px 0 var(--ink);
	}

	.template-card-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		background: var(--cream);
		border: 2px solid var(--ink);
		border-radius: 10px;
		color: var(--ink);
		flex-shrink: 0;
	}

	.template-card-body {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}

	.template-card-title-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.template-card-title {
		font-family: var(--font-display);
		font-size: 16px;
		font-weight: 700;
		color: var(--ink);
	}
	.template-card-desc {
		margin: 0;
		font-size: 12.5px;
		font-weight: 600;
		color: var(--ink-2);
		line-height: 1.45;
	}
	.template-card-meta {
		margin-top: 0.3rem;
		font-size: 11px;
		font-family: var(--font-mono);
		font-weight: 500;
		color: var(--ink-3);
	}

	.template-picker-footer {
		display: flex;
		justify-content: flex-end;
		margin-top: 1.25rem;
	}

	@media (max-width: 560px) {
		.masthead {
			flex-direction: column;
			text-align: center;
			gap: 0.75rem;
		}
		.toolbar-row {
			justify-content: center;
		}
	}
</style>
