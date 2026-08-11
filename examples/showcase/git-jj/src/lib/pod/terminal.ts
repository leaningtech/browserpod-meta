/**
 * Interactive shells, drawn by BrowserPod's own terminal renderer.
 */
import type { BrowserPod, Terminal } from '@leaningtech/browserpod';
// Type only: the vcs layer sits on top of this one, and must not be pulled in at runtime.
import type { VcsId } from '$lib/vcs';
import { POD_HOME, writePodFile } from './fs';
import { failed, run, stripAnsi } from './run';

/** Without these the pty is indistinguishable from a pipe, and tools drop their colour. */
const SHELL_ENV = ['TERM=xterm-256color', 'COLORTERM=truecolor'];

/** `write()` is on the terminal at runtime but not in the published types. */
export function writeToTerminal(terminal: Terminal | null, data: string): void {
	(terminal as (Terminal & { write?: (data: string) => void }) | null)?.write?.(data);
}

/** BrowserPod's renderer only refits on a window resize; other layout changes must say so. */
export function nudgeLayout(): void {
	if (typeof window !== 'undefined') window.dispatchEvent(new Event('resize'));
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

/** Successful probes only, so a tool installed later is still picked up. */
const versions = new WeakMap<BrowserPod, Map<VcsId, string>>();

/** What `id` reports in this pod, or null when it is not installed. */
export async function toolVersion(pod: BrowserPod, id: VcsId): Promise<string | null> {
	let cache = versions.get(pod);
	if (!cache) versions.set(pod, (cache = new Map()));

	const cached = cache.get(id);
	if (cached) return cached;

	const version = await probe(pod, id);
	if (version) cache.set(id, version);
	return version;
}

async function probe(pod: BrowserPod, executable: string): Promise<string | null> {
	const result = await run(pod, executable, ['--version']);
	if (failed(result)) return null;
	const line = stripAnsi(result.output)
		.split(/\r?\n/)
		.map((entry) => entry.trim())
		.find(Boolean);
	// A missing binary prints to stderr and leaves no version line to believe.
	if (!line || !line.startsWith(executable)) return null;
	// git says "git version 2.43.0"; a jj built from source tacks its commit on the end.
	return line.replace(/^(\S+) version /, '$1 ').replace(/-[0-9a-f]{7,}$/, '');
}

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

// The escape is built with fromCharCode, so no control character sits in this file.
const BOX = {
	topLeft: '╭',
	topRight: '╮',
	bottomLeft: '╰',
	bottomRight: '╯',
	horizontal: '─',
	vertical: '│'
};
const ESC = String.fromCharCode(27);
const ANSI = { reset: `${ESC}[0m`, dim: `${ESC}[2m`, accent: `${ESC}[38;5;141m` };

/** Inner width of the banner box, in columns. */
const WIDTH = 44;

/** The only text bramble injects into a shell, and only about the tool that cloned it. */
export function banner(version: string | null, backend: VcsId): string {
	const label = ' bramble ';
	const rule = BOX.horizontal.repeat(Math.max(0, WIDTH - label.length - 1));
	const tool = version ?? `${backend} (version unknown)`;
	const hint = backend === 'jj' ? 'jj status' : 'git status';

	return [
		'',
		`  ${ANSI.accent}${BOX.topLeft}${BOX.horizontal}${label}${rule}${BOX.topRight}${ANSI.reset}`,
		`  ${ANSI.accent}${BOX.vertical}${ANSI.reset}${pad('  powered by BrowserPod')}` +
			`${ANSI.accent}${BOX.vertical}${ANSI.reset}`,
		`  ${ANSI.accent}${BOX.bottomLeft}${BOX.horizontal.repeat(WIDTH)}${BOX.bottomRight}${ANSI.reset}`,
		'',
		`   ${tool}`,
		`   ${ANSI.dim}Interactive bash. Try:  ${hint}${ANSI.reset}`,
		''
	]
		.map((line) => `${line}\r\n`)
		.join('');
}

function pad(text: string): string {
	return text + ' '.repeat(Math.max(0, WIDTH - text.length));
}

// ---------------------------------------------------------------------------
// Shells
// ---------------------------------------------------------------------------

/** Read by `bash --rcfile`, so the prompt does not depend on what the image ships. */
const RC_PATH = `${POD_HOME}/.bramble-rc`;
const RC = `# Written by bramble for its interactive shells.
PS1='\\[${ESC}[38;5;141m\\]\\w\\[${ESC}[0m\\] \\[${ESC}[38;5;141m\\]❯\\[${ESC}[0m\\] '
`;

const rcWrites = new WeakMap<BrowserPod, Promise<void>>();

/** Best effort: a shell with the stock prompt is still a working shell. */
function ensureRc(pod: BrowserPod): Promise<void> {
	let pending = rcWrites.get(pod);
	if (!pending) {
		pending = writePodFile(pod, RC_PATH, RC).catch((error) => {
			console.warn('Could not write the shell rc:', error);
		});
		rcWrites.set(pod, pending);
	}
	return pending;
}

/**
 * Attaches a terminal to `element` and runs an interactive bash in `cwd` against it.
 * One call per terminal tab. The shell runs until the pod is torn down.
 */
export async function openShell(
	pod: BrowserPod,
	element: HTMLElement,
	cwd: string,
	backend: VcsId
): Promise<void> {
	const terminal = await pod.createDefaultTerminal(element);
	// Read from the pod, never hardcoded; only the first tab pays for the probe.
	writeToTerminal(terminal, banner(await toolVersion(pod, backend), backend));
	await ensureRc(pod);
	void pod.run('bash', ['--rcfile', RC_PATH, '-i'], { terminal, cwd, echo: false, env: SHELL_ENV });
}
