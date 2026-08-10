/**
 * Subprocess plumbing, adapted from browsercode's `IdeSession.runInOutput` with the
 * terminal UI replaced by a streaming callback.
 */
import type { BrowserPod, Terminal } from '@leaningtech/browserpod';

export type LogSink = (chunk: string) => void;

export type RunOptions = {
	cwd?: string;
	env?: string[];
	/** Receives output as it arrives, with the exit marker filtered out. */
	onData?: LogSink;
};

export type RunResult = {
	output: string;
	/** Exit status, or `-1` when it could not be read. */
	exitCode: number;
};

/**
 * True only for a status we read and that says failed. An unreadable status is not a
 * failure; callers confirm the effect instead.
 */
export function failed(result: RunResult): boolean {
	return result.exitCode > 0;
}

/** `pod.run` exposes no exit status, so the wrapper shell prints one. */
const EXIT_MARKER = '__bre_exit:';

/** How long to keep waiting for the marker after the process has exited. */
const MARKER_GRACE_MS = 1500;

type Runner = {
	terminal: Terminal;
	queue: Promise<unknown>;
	/** Set for the duration of one run, to receive that run's output. */
	sink: LogSink | null;
};

/** One hidden terminal and one queue per pod. */
const runners = new WeakMap<BrowserPod, Promise<Runner>>();

function runnerFor(pod: BrowserPod): Promise<Runner> {
	let runner = runners.get(pod);
	if (!runner) {
		runner = createRunner(pod);
		runners.set(pod, runner);
	}
	return runner;
}

async function createRunner(pod: BrowserPod): Promise<Runner> {
	const decoder = new TextDecoder();
	const runner: Partial<Runner> = { queue: Promise.resolve(), sink: null };
	// Wide, so a pty honouring the window size never folds long paths.
	runner.terminal = await pod.createCustomTerminal({
		cols: 512,
		rows: 48,
		onOutput: (buffer) => runner.sink?.(decoder.decode(copyBytes(buffer), { stream: true }))
	});
	return runner as Runner;
}

/** The pod's chunks are backed by a resizable buffer, which `TextDecoder` rejects. */
function copyBytes(buffer: ArrayBuffer): Uint8Array<ArrayBuffer> {
	return new Uint8Array(buffer).slice();
}

/** Runs a command with quoted arguments, so the shell interprets nothing in them. */
export function run(
	pod: BrowserPod,
	command: string,
	args: string[],
	options: RunOptions = {}
): Promise<RunResult> {
	return enqueue(pod, [command, ...args].map(shellQuote).join(' '), options);
}

/** Runs a bash line as written, for pipes and globs. Quoting is the caller's job. */
export function runScript(
	pod: BrowserPod,
	script: string,
	options: RunOptions = {}
): Promise<RunResult> {
	return enqueue(pod, script, options);
}

/** Runs are queued per pod, so callers never need to coordinate. */
async function enqueue(pod: BrowserPod, line: string, options: RunOptions): Promise<RunResult> {
	const runner = await runnerFor(pod);
	const task = () => execute(pod, runner, line, options);
	// `.then(task, task)` keeps the queue alive after a failed run.
	const result = runner.queue.then(task, task);
	runner.queue = result.catch(() => undefined);
	return result;
}

async function execute(
	pod: BrowserPod,
	runner: Runner,
	line: string,
	{ cwd, env, onData }: RunOptions
): Promise<RunResult> {
	// The leading newline keeps the marker on its own line whatever the command wrote.
	const script = `${line}; printf '\\n${EXIT_MARKER}%d\\n' "$?"`;

	let raw = '';
	const filter = createMarkerFilter(EXIT_MARKER, onData);
	runner.sink = (chunk) => {
		raw += chunk;
		filter.push(chunk);
	};
	try {
		await pod.run('bash', ['-c', script], {
			terminal: runner.terminal,
			echo: false,
			...(cwd ? { cwd } : {}),
			...(env ? { env } : {})
		});
		// `run` resolves on process exit with output still in flight, so wait for it.
		for (let waited = 0; waited < MARKER_GRACE_MS && !raw.includes(EXIT_MARKER); waited += 25) {
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
	} finally {
		runner.sink = null;
		filter.flush();
	}

	const at = raw.lastIndexOf(EXIT_MARKER);
	if (at < 0) return { output: raw, exitCode: -1 };
	const parsed = Number.parseInt(raw.slice(at + EXIT_MARKER.length).trim(), 10);
	return {
		output: raw.slice(0, at).replace(/\r?\n$/, ''),
		exitCode: Number.isFinite(parsed) ? parsed : -1
	};
}

/** Forwards a stream to `sink`, holding back the marker even when a chunk splits it. */
function createMarkerFilter(marker: string, sink?: LogSink) {
	let held = '';
	let finished = false;

	const emit = (text: string) => {
		if (text) sink?.(text);
	};

	return {
		push(chunk: string) {
			if (finished || !sink) return;
			held += chunk;
			const at = held.indexOf(marker);
			if (at >= 0) {
				emit(held.slice(0, at).replace(/\r?\n$/, ''));
				held = '';
				finished = true;
				return;
			}
			const keep = partialMarkerLength(held, marker);
			emit(held.slice(0, held.length - keep));
			held = keep ? held.slice(held.length - keep) : '';
		},
		flush() {
			if (finished || !sink) return;
			emit(held);
			held = '';
		}
	};
}

/** Length of the longest suffix of `text` that is also a prefix of `marker`. */
function partialMarkerLength(text: string, marker: string): number {
	for (let n = Math.min(text.length, marker.length - 1); n > 0; n--) {
		if (text.endsWith(marker.slice(0, n))) return n;
	}
	return 0;
}

export function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** The line worth showing when a command fails: its last non-empty one. */
export function failureMessage(result: RunResult, fallback: string): string {
	const lines = result.output
		.split(/\r?\n/)
		.map((line) => stripAnsi(line).trim())
		.filter(Boolean);
	return lines.at(-1) ?? `${fallback} (exit ${result.exitCode})`;
}

// CSI and OSC sequences, built with fromCharCode to keep this file plain ASCII.
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const ANSI_PATTERN = new RegExp(
	ESC + '\\[[0-9;?]*[ -/]*[@-~]|' + ESC + '\\][^' + BEL + ESC + ']*(?:' + BEL + '|' + ESC + '\\\\)?',
	'g'
);

export function stripAnsi(value: string): string {
	return value.replace(ANSI_PATTERN, '');
}
