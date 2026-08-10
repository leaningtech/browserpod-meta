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
import type { VcsId } from './vcs';

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

	get ready(): boolean {
		return !!this.pod && !!this.workdir;
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
	}

	/** Drops the workspace but leaves the pod booted for the next clone. */
	release(): void {
		this.workdir = '';
		this.repo = null;
		this.tree = [];
		this.tabs = [];
		this.activePath = '';
		this.error = '';
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
