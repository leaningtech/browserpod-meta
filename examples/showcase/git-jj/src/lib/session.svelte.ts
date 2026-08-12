/**
 * The workspace store: one cloned repository, its working tree, and the tabs open on
 * top of it. Every pod filesystem mutation goes through here, so the tree can be
 * refreshed after each one without a component having to remember to.
 */
import type { BrowserPod } from '@leaningtech/browserpod';
import {
	listTree,
	makeDirectory,
	podPath,
	readPodFileWithinLimit,
	removePath,
	renamePath,
	writePodFile,
	type PodEntry
} from './pod/fs';
import { readCheckoutState, sameCheckout, type CheckoutState } from './pod/watch';
import { createBackend, type VcsId } from './vcs';

export type RepoRef = { url: string; ref: string; backend: VcsId; name: string };

export type Tab = {
	/** Workdir relative path, and the Monaco model URI. */
	path: string;
	content: string;
	/** Last content written to the pod; `content !== saved` means dirty. */
	saved: string;
	/** Why the file cannot be edited as text, shown in place of the editor. */
	blocked: string | null;
};

const MAX_EDITABLE_BYTES = 1_000_000;

/** How often to ask the pod where the checkout is parked. */
const WATCH_INTERVAL_MS = 2500;

/** Extensions we can refuse without a read. */
const BINARY_EXTENSIONS = new Set([
	'png',
	'jpg',
	'jpeg',
	'gif',
	'webp',
	'avif',
	'bmp',
	'ico',
	'icns',
	'pdf',
	'zip',
	'gz',
	'tgz',
	'bz2',
	'xz',
	'7z',
	'rar',
	'jar',
	'class',
	'wasm',
	'so',
	'dylib',
	'dll',
	'exe',
	'bin',
	'o',
	'a',
	'woff',
	'woff2',
	'ttf',
	'otf',
	'eot',
	'mp3',
	'wav',
	'ogg',
	'flac',
	'mp4',
	'webm',
	'mov',
	'avi',
	'mkv',
	'psd',
	'sqlite',
	'db'
]);

export class Session {
	pod = $state.raw<BrowserPod | null>(null);
	/** Absolute path of the checkout inside the pod. */
	workdir = $state('');
	repo = $state<RepoRef | null>(null);
	/** Flat working tree, workdir relative. The file tree nests it for display. */
	tree = $state<PodEntry[]>([]);
	tabs = $state<Tab[]>([]);
	activePath = $state('');
	/** A tree mutation or a save is in flight. */
	busy = $state(false);
	error = $state('');
	/** Where the checkout is parked, as of the last poll. */
	checkout = $state<CheckoutState | null>(null);
	syncing = $state(false);
	/** The branch a UI-initiated switch is moving to, while it runs. */
	switchingTo = $state('');
	movedNote = $state('');

	get ready(): boolean {
		return !!this.pod && !!this.workdir;
	}

	/** The live branch when a poll has answered, else the ref we cloned at. */
	get branch(): string {
		if (this.checkout) return this.checkout.branch || 'detached';
		return this.repo?.ref ?? '';
	}

	get activeTab(): Tab | undefined {
		return this.tabs.find((tab) => tab.path === this.activePath);
	}

	get dirty(): boolean {
		const tab = this.activeTab;
		return !!tab && tab.content !== tab.saved;
	}

	get hasUnsaved(): boolean {
		return this.tabs.some((tab) => tab.content !== tab.saved);
	}

	isDirty(path: string): boolean {
		const tab = this.tabs.find((entry) => entry.path === path);
		return !!tab && tab.content !== tab.saved;
	}

	/** Adopts a freshly cloned or reopened checkout. */
	adopt(pod: BrowserPod, workdir: string, repo: RepoRef): void {
		this.pod = pod;
		this.workdir = workdir;
		this.repo = repo;
		this.tree = [];
		this.tabs = [];
		this.activePath = '';
		this.error = '';
		this.checkout = null;
		this.movedNote = '';
		this.switchingTo = '';
	}

	/** Drops the workspace but leaves the pod booted for the next clone. */
	release(): void {
		this.workdir = '';
		this.repo = null;
		this.tree = [];
		this.tabs = [];
		this.activePath = '';
		this.error = '';
		this.checkout = null;
		this.movedNote = '';
		this.switchingTo = '';
	}

	private abs(relative: string): string {
		return podPath(this.workdir, relative);
	}

	/** Re-reads the working tree from the pod, after every mutation. */
	async refreshTree(): Promise<void> {
		if (!this.pod || !this.workdir) return;
		try {
			this.tree = await listTree(this.pod, this.workdir);
		} catch (error) {
			this.error = messageOf(error);
		}
	}

	private entryExists(path: string): boolean {
		return this.tree.some((entry) => entry.path === path || entry.path.startsWith(`${path}/`));
	}

	/** Opens `path` as a tab, or focuses the existing one, and makes it active. */
	async open(path: string): Promise<void> {
		if (!this.pod || !this.workdir) return;
		if (this.tabs.some((tab) => tab.path === path)) {
			this.activePath = path;
			return;
		}

		const blockedByType = binaryReason(path);
		if (blockedByType) {
			this.pushTab({ path, content: '', saved: '', blocked: blockedByType });
			return;
		}

		try {
			const content = await readPodFileWithinLimit(this.pod, this.abs(path), MAX_EDITABLE_BYTES);
			if (content === null) {
				this.pushTab({
					path,
					content: '',
					saved: '',
					blocked: `Larger than ${Math.round(MAX_EDITABLE_BYTES / 1000)} kB, so not opened.`
				});
				return;
			}
			const blocked = looksBinary(content) ? 'Binary file, not shown.' : null;
			this.pushTab({ path, content, saved: content, blocked });
		} catch (error) {
			this.error = `Could not open ${path}: ${messageOf(error)}`;
		}
	}

	private pushTab(tab: Tab): void {
		this.tabs = [...this.tabs, tab];
		this.activePath = tab.path;
	}

	/**
	 * Closes a tab and activates its neighbour. Unsaved edits are flushed rather than
	 * dropped, since the pod holds the only copy.
	 */
	close(path: string): void {
		const index = this.tabs.findIndex((tab) => tab.path === path);
		if (index < 0) return;
		const tab = this.tabs[index];
		if (tab.content !== tab.saved) void this.save(path);
		this.tabs = this.tabs.filter((entry) => entry.path !== path);
		if (this.activePath === path) {
			this.activePath = (this.tabs[index] ?? this.tabs[index - 1])?.path ?? '';
		}
	}

	/** Writes a tab back to the pod. Defaults to the active one. */
	async save(path = this.activePath): Promise<void> {
		const tab = this.tabs.find((entry) => entry.path === path);
		if (!this.pod || !tab || tab.blocked) return;
		const content = tab.content;
		this.busy = true;
		try {
			await writePodFile(this.pod, this.abs(tab.path), content);
			tab.saved = content;
			this.error = '';
		} catch (error) {
			this.error = `Could not save ${tab.path}: ${messageOf(error)}`;
		} finally {
			this.busy = false;
		}
	}

	// File operations return an error message, or null on success, so the tree can
	// show a failure inline next to the input that caused it.

	async createFile(path: string): Promise<string | null> {
		if (!this.ready) return 'No workspace open';
		if (this.entryExists(path)) return 'Something with that name already exists';
		return this.mutate(async () => {
			await writePodFile(this.pod!, this.abs(path), '');
			await this.refreshTree();
			await this.open(path);
		});
	}

	async createFolder(path: string): Promise<string | null> {
		if (!this.ready) return 'No workspace open';
		if (this.entryExists(path)) return 'Something with that name already exists';
		return this.mutate(async () => {
			await makeDirectory(this.pod!, this.abs(path));
			await this.refreshTree();
		});
	}

	/** Renames a file or folder; open tabs follow the moved path. */
	async rename(from: string, to: string): Promise<string | null> {
		if (!this.ready) return 'No workspace open';
		if (from === to) return null;
		if (this.entryExists(to)) return 'Something with that name already exists';
		return this.mutate(async () => {
			await renamePath(this.pod!, this.abs(from), this.abs(to));
			const remap = (path: string) =>
				path === from ? to : path.startsWith(`${from}/`) ? to + path.slice(from.length) : path;
			for (const tab of this.tabs) tab.path = remap(tab.path);
			this.activePath = remap(this.activePath);
			await this.refreshTree();
		});
	}

	/** Deletes a file or folder recursively; tabs under it close. */
	async remove(path: string): Promise<string | null> {
		if (!this.ready) return 'No workspace open';
		return this.mutate(async () => {
			await removePath(this.pod!, this.abs(path));
			const gone = (candidate: string) => candidate === path || candidate.startsWith(`${path}/`);
			const index = this.tabs.findIndex((tab) => gone(tab.path));
			this.tabs = this.tabs.filter((tab) => !gone(tab.path));
			if (gone(this.activePath)) {
				this.activePath = (this.tabs[index] ?? this.tabs.at(-1))?.path ?? '';
			}
			await this.refreshTree();
		});
	}

	// -------------------------------------------------------------------------
	// Moving the checkout between branches
	// -------------------------------------------------------------------------

	async listBranches(): Promise<string[]> {
		if (!this.pod || !this.workdir || !this.repo) return [];
		return createBackend(this.repo.backend, this.pod).listBranches(this.workdir);
	}

	/** Moves the checkout onto `name` and pulls the tree and tabs after it. */
	async switchBranch(name: string): Promise<string | null> {
		if (!this.ready || !this.repo) return 'No workspace open';
		if (this.switchingTo) return null;
		this.switchingTo = name;
		this.busy = true;
		try {
			await createBackend(this.repo.backend, this.pod!).switchTo(this.workdir, name);
			// Record the new position before syncing, so the poller does not reload again.
			try {
				const state = await readCheckoutState(this.pod!, this.workdir, this.repo.backend);
				if (state) this.checkout = state;
			} catch {
				// The next poll will catch up.
			}
			this.movedNote = `Switched to ${name}`;
			this.error = '';
		} catch (error) {
			return messageOf(error);
		} finally {
			this.busy = false;
			this.switchingTo = '';
		}
		await this.syncFromDisk();
		return null;
	}

	// -------------------------------------------------------------------------
	// Keeping up with changes made outside the app
	// -------------------------------------------------------------------------

	/** Re-reads every open tab from the pod. Dirty tabs are left alone. */
	async reloadOpenTabs(): Promise<void> {
		if (!this.pod || !this.workdir) return;
		for (const tab of this.tabs) {
			if (tab.content !== tab.saved) continue;
			const blockedByType = binaryReason(tab.path);
			if (blockedByType) continue;
			try {
				const content = await readPodFileWithinLimit(
					this.pod,
					this.abs(tab.path),
					MAX_EDITABLE_BYTES
				);
				if (content === null) {
					tab.blocked = `Larger than ${Math.round(MAX_EDITABLE_BYTES / 1000)} kB, so not opened.`;
					continue;
				}
				tab.content = content;
				tab.saved = content;
				tab.blocked = looksBinary(content) ? 'Binary file, not shown.' : null;
			} catch {
				// Likely not in the new checkout; keep the tab so switching back restores it.
				tab.content = '';
				tab.saved = '';
				tab.blocked = 'Not in the working tree any more.';
			}
		}
	}

	/** Pulls the tree and the open tabs back in line with what is on the pod's disk. */
	async syncFromDisk(): Promise<void> {
		if (!this.ready || this.syncing) return;
		this.syncing = true;
		try {
			await this.refreshTree();
			await this.reloadOpenTabs();
		} finally {
			this.syncing = false;
		}
	}

	/** One poll: re-reads the tree if the checkout moved since the last answer. */
	async pollCheckout(): Promise<boolean> {
		if (!this.pod || !this.workdir || !this.repo || this.busy || this.syncing) return false;

		let state: CheckoutState | null;
		try {
			state = await readCheckoutState(this.pod, this.workdir, this.repo.backend);
		} catch {
			return false;
		}
		if (!state) return false;

		const previous = this.checkout;
		this.checkout = state;
		// The first answer is the baseline, not a change.
		if (!previous || sameCheckout(previous, state)) return false;

		this.movedNote =
			previous.branch !== state.branch && state.branch
				? `Switched to ${state.branch}`
				: `Checkout moved to ${state.head.slice(0, 8)}`;
		await this.syncFromDisk();
		return true;
	}

	/** Polls until the returned stop function is called; idle while the tab is hidden. */
	startWatching(intervalMs = WATCH_INTERVAL_MS): () => void {
		if (typeof window === 'undefined') return () => {};

		let stopped = false;
		let running = false;

		const tick = async () => {
			if (stopped || running) return;
			if (typeof document !== 'undefined' && document.hidden) return;
			running = true;
			try {
				await this.pollCheckout();
			} finally {
				running = false;
			}
		};

		const timer = setInterval(tick, intervalMs);
		const onVisible = () => {
			if (!document.hidden) void tick();
		};
		document.addEventListener('visibilitychange', onVisible);
		window.addEventListener('focus', onVisible);
		// Deferred: a synchronous first poll would make the caller's effect depend on `busy`.
		const first = setTimeout(tick, 0);

		return () => {
			stopped = true;
			clearTimeout(first);
			clearInterval(timer);
			document.removeEventListener('visibilitychange', onVisible);
			window.removeEventListener('focus', onVisible);
		};
	}

	private async mutate(action: () => Promise<void>): Promise<string | null> {
		this.busy = true;
		try {
			await action();
			return null;
		} catch (error) {
			return messageOf(error);
		} finally {
			this.busy = false;
		}
	}
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function binaryReason(path: string): string | null {
	const name = path.split('/').pop() ?? path;
	const dot = name.lastIndexOf('.');
	if (dot <= 0) return null;
	const extension = name.slice(dot + 1).toLowerCase();
	return BINARY_EXTENSIONS.has(extension) ? `Binary file (.${extension}), not shown.` : null;
}

/** Binary decoded as text shows up as NUL bytes or a pile of replacement chars. */
function looksBinary(content: string): boolean {
	const head = content.slice(0, 4096);
	if (!head) return false;
	if (head.includes(String.fromCharCode(0))) return true;
	const replacement = String.fromCharCode(0xfffd);
	let count = 0;
	for (const character of head) if (character === replacement) count++;
	return count > head.length * 0.05;
}
