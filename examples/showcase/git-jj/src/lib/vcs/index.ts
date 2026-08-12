/** Cloning a repository into a pod and moving its checkout between branches. */
import type { BrowserPod } from '@leaningtech/browserpod';
import { POD_HOME } from '$lib/pod/fs';
import { ensureJj } from '$lib/pod/provision';
import { failed, failureMessage, run, stripAnsi, type LogSink } from '$lib/pod/run';

export type VcsId = 'git' | 'jj';

export interface VcsBackend {
	readonly id: VcsId;
	readonly label: string;
	/** Whether `clone` can target a ref, rather than the default branch. */
	readonly honorsRef: boolean;
	prepare?(): Promise<void>;
	clone(url: string, ref: string, dest: string): Promise<void>;
	listBranches(workdir: string): Promise<string[]>;
	switchTo(workdir: string, branch: string): Promise<void>;
}

export const VCS_OPTIONS: { id: VcsId; label: string; blurb: string }[] = [
	{ id: 'git', label: 'git', blurb: 'shallow clone, every branch tip' },
	{ id: 'jj', label: 'jj', blurb: 'jujutsu, on top of git' }
];

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
		// `--no-single-branch`: keep the other branch tips for later checkouts.
		const args = ['clone', '--depth', '1', '--no-single-branch'];
		if (ref) args.push('--branch', ref);
		args.push(remoteUrl(url), dest);
		await exec(this.pod, 'git', args, this.onLog);
	}

	async listBranches(workdir: string): Promise<string[]> {
		const result = await run(
			this.pod,
			'git',
			['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes/origin'],
			{ cwd: workdir }
		);
		if (failed(result)) throw new Error(failureMessage(result, 'Could not list branches'));
		const names = stripAnsi(result.output)
			.split(/\r?\n/)
			.map((line) => line.trim())
			.map((name) => (name.startsWith('origin/') ? name.slice('origin/'.length) : name))
			.filter((name) => name && name !== 'origin' && name !== 'HEAD');
		return [...new Set(names)].sort();
	}

	async switchTo(workdir: string, branch: string): Promise<void> {
		const attempt = () =>
			run(this.pod, 'git', ['checkout', branch], { cwd: workdir, onData: this.onLog });
		const first = await attempt();
		if (!failed(first)) return;
		const fetch = await run(
			this.pod,
			'git',
			['fetch', '--depth', '1', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`],
			{ cwd: workdir, onData: this.onLog }
		);
		if (failed(fetch)) {
			throw new Error(failureMessage(first, `Could not check out ${branch}`));
		}
		const second = await attempt();
		if (failed(second)) {
			throw new Error(failureMessage(second, `Could not check out ${branch}`));
		}
	}
}

class JjBackend implements VcsBackend {
	readonly id = 'jj' as const;
	readonly label = 'jj';
	readonly honorsRef = true;

	constructor(
		private readonly pod: BrowserPod,
		private readonly onLog?: LogSink
	) {}

	async prepare(): Promise<void> {
		await ensureJj(this.pod, this.onLog);
	}

	async clone(url: string, ref: string, dest: string): Promise<void> {
		await this.prepare();
		await this.ensureIdentity();
		await exec(this.pod, 'jj', ['git', 'clone', url, dest], this.onLog);
		if (ref && ref !== (await this.currentBookmark(dest))) await this.switchTo(dest, ref);
	}

	// `--no-pager` everywhere: the builtin pager blocks forever on the hidden pty.
	// `--ignore-working-copy` on reads, so they never snapshot.

	async listBranches(workdir: string): Promise<string[]> {
		const result = await run(
			this.pod,
			'jj',
			['--no-pager', '--ignore-working-copy', 'bookmark', 'list', '--all-remotes', '-T', 'name ++ "\\n"'],
			{ cwd: workdir }
		);
		if (failed(result)) throw new Error(failureMessage(result, 'Could not list bookmarks'));
		const names = stripAnsi(result.output)
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean);
		return [...new Set(names)].sort();
	}

	async switchTo(workdir: string, branch: string): Promise<void> {
		const attempt = () =>
			run(this.pod, 'jj', ['--no-pager', 'new', branch], { cwd: workdir, onData: this.onLog });
		const first = await attempt();
		if (!failed(first)) return;
		// An untracked remote bookmark is not addressable by its short name.
		const track = await run(
			this.pod,
			'jj',
			['--no-pager', 'bookmark', 'track', `${branch}@origin`],
			{ cwd: workdir, onData: this.onLog }
		);
		if (failed(track)) throw new Error(failureMessage(first, `Could not switch to ${branch}`));
		const second = await attempt();
		if (failed(second)) {
			throw new Error(failureMessage(second, `Could not switch to ${branch}`));
		}
	}

	private async currentBookmark(workdir: string): Promise<string> {
		const result = await run(
			this.pod,
			'jj',
			[
				'--no-pager',
				'--ignore-working-copy',
				'log',
				'--no-graph',
				'-r',
				'latest(::@ & bookmarks())',
				'-T',
				'bookmarks'
			],
			{ cwd: workdir }
		);
		if (failed(result)) return '';
		return stripAnsi(result.output).trim().split(/\s+/)[0]?.replace(/\*$/, '') ?? '';
	}

	private async ensureIdentity(): Promise<void> {
		for (const [key, value] of [
			['user.name', 'Bramble'],
			['user.email', 'bramble@browserpod.local'],
			['ui.paginate', 'never']
		]) {
			const result = await run(this.pod, 'jj', ['config', 'set', '--user', key, value], {
				cwd: POD_HOME
			});
			if (failed(result)) console.warn(`Could not set jj ${key}:`, result.output);
		}
	}
}

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
