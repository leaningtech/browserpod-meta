/**
 * The two ways to get a repository into a pod. A backend is the command line it runs plus
 * what it can honour: git checks out an arbitrary ref in one shallow shot, `jj git clone`
 * always takes the default branch. git is in the pod image; jj installs itself first.
 */
import type { BrowserPod } from '@leaningtech/browserpod';
import { POD_HOME } from '$lib/pod/fs';
import { ensureJj } from '$lib/pod/provision';
import { failed, failureMessage, run, type LogSink } from '$lib/pod/run';

export type VcsId = 'git' | 'jj';

export interface VcsBackend {
	readonly id: VcsId;
	readonly label: string;
	/** Whether `clone` can target a ref, rather than the default branch. */
	readonly honorsRef: boolean;
	/** Installs whatever the pod is missing. Called once before `clone`, if present. */
	prepare?(): Promise<void>;
	/** Clones `url` at `ref` into the absolute pod path `dest`. Throws on failure. */
	clone(url: string, ref: string, dest: string): Promise<void>;
}

export const VCS_OPTIONS: { id: VcsId; label: string; blurb: string }[] = [
	{ id: 'git', label: 'git', blurb: 'shallow clone at a ref' },
	{ id: 'jj', label: 'jj', blurb: 'jujutsu, default branch' }
];

/** Builds a backend bound to a pod, and optionally to a log sink for its output. */
export function createBackend(id: VcsId, pod: BrowserPod, onLog?: LogSink): VcsBackend {
	return id === 'jj' ? new JjBackend(pod, onLog) : new GitBackend(pod, onLog);
}

class GitBackend implements VcsBackend {
	readonly id = 'git' as const;
	readonly label = 'git';
	readonly honorsRef = true;

	constructor(
		private readonly pod: BrowserPod,
		private readonly onLog?: LogSink
	) {}

	async clone(url: string, ref: string, dest: string): Promise<void> {
		const args = ['clone', '--depth', '1'];
		if (ref) args.push('--branch', ref);
		args.push(remoteUrl(url), dest);
		await exec(this.pod, 'git', args, this.onLog);
	}
}

class JjBackend implements VcsBackend {
	readonly id = 'jj' as const;
	readonly label = 'jj';
	readonly honorsRef = false;

	constructor(
		private readonly pod: BrowserPod,
		private readonly onLog?: LogSink
	) {}

	/** jj is not in the pod image; it is copied in from a static asset. */
	async prepare(): Promise<void> {
		await ensureJj(this.pod, this.onLog);
	}

	async clone(url: string, _ref: string, dest: string): Promise<void> {
		await this.prepare();
		await this.ensureIdentity();
		await exec(this.pod, 'jj', ['git', 'clone', url, dest], this.onLog);
	}

	/** `jj git clone` writes a working copy commit, which needs an author. */
	private async ensureIdentity(): Promise<void> {
		for (const [key, value] of [
			['user.name', 'Bramble'],
			['user.email', 'bramble@browserpod.local']
		]) {
			const result = await run(this.pod, 'jj', ['config', 'set', '--user', key, value], {
				cwd: POD_HOME
			});
			if (failed(result)) console.warn(`Could not set jj ${key}:`, result.output);
		}
	}
}

/** Echoes the command into the log and turns a failing exit into a throw. */
async function exec(
	pod: BrowserPod,
	command: string,
	args: string[],
	onLog?: LogSink
): Promise<void> {
	onLog?.(`$ ${[command, ...args].join(' ')}\n`);
	const result = await run(pod, command, args, { cwd: POD_HOME, onData: onLog });
	if (failed(result)) throw new Error(failureMessage(result, `${command} failed`));
}

/** git wants the `.git` suffix on the remote, which pasted URLs rarely have. */
function remoteUrl(url: string): string {
	const trimmed = url.replace(/\/+$/, '');
	return trimmed.endsWith('.git') ? trimmed : `${trimmed}.git`;
}

/** `https://github.com/owner/repo.git` gives `repo`, sanitised into a directory name. */
export function repoNameFromUrl(url: string): string {
	const withoutQuery = url.split(/[?#]/)[0].replace(/\/+$/, '');
	const last = withoutQuery.split('/').pop() ?? '';
	const name = last.replace(/\.git$/, '').replace(/[^A-Za-z0-9._-]/g, '-');
	return name || 'repo';
}

/** Rejects anything that is not an http(s) URL, before it reaches a shell. */
export function validateRepoUrl(url: string): string {
	const value = url.trim();
	if (!value) return 'A repository URL is required';
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		return 'That is not a valid URL';
	}
	if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
		return 'Only http(s) URLs can be cloned from the browser';
	}
	if (!parsed.pathname.replace(/\/+$/, '')) return 'The URL has no repository path';
	return '';
}
