/**
 * Getting a repository into a pod, and back into it on the next visit. The pod's disk
 * outlives the tab; which directory was open does not, so localStorage keeps that and
 * the pod is asked to confirm it before use.
 */
import type { BrowserPod } from '@leaningtech/browserpod';
import { bootPod } from './pod/boot';
import { POD_HOME, pathExists, removePath, renamePath } from './pod/fs';
import type { LogSink } from './pod/run';
import type { RepoRef } from './session.svelte';
import { createBackend, repoNameFromUrl, type VcsId } from './vcs';

const STORAGE_KEY = 'bramble:workspace';

export type SavedWorkspace = RepoRef & { workdir: string };

export type Stage = 'booting' | 'preparing' | 'cloning' | 'scanning' | 'ready';

export type Reporter = { onLog?: LogSink; onStage?: (stage: Stage) => void };

export type Workspace = { pod: BrowserPod; workdir: string; repo: RepoRef };

export type CloneRequest = { url: string; ref: string; backend: VcsId };

/** Boots the pod, or reuses `existingPod`, and clones `request` into it. */
export async function cloneWorkspace(
	request: CloneRequest,
	{ onLog, onStage }: Reporter = {},
	existingPod?: BrowserPod | null
): Promise<Workspace> {
	onStage?.('booting');
	onLog?.(existingPod ? 'Reusing the running pod.\n' : 'Booting a BrowserPod sandbox...\n');
	const pod = existingPod ?? (await bootPod());

	const name = repoNameFromUrl(request.url);
	const workdir = `${POD_HOME}/${name}`;
	// Staged so a clone that fails leaves the checkout you already had alone.
	const staging = `${workdir}.bramble-incoming`;

	const backend = createBackend(request.backend, pod, onLog);
	if (backend.prepare) {
		// Separate stage because installing a backend can take longer than the clone.
		onStage?.('preparing');
		await backend.prepare();
	}

	onStage?.('cloning');
	const ref = backend.honorsRef ? request.ref.trim() : '';
	if (!backend.honorsRef && request.ref.trim()) {
		onLog?.(`jj clones the default branch; ignoring ref "${request.ref.trim()}".\n`);
	}

	await removePath(pod, staging);
	try {
		await backend.clone(request.url.trim(), ref, staging);
		// The clone's own exit status is not always readable, so confirm the effect.
		if (!(await pathExists(pod, staging))) {
			throw new Error(`${request.backend} finished but produced no checkout.`);
		}
	} catch (error) {
		await removePath(pod, staging).catch(() => undefined);
		throw error;
	}

	if (await pathExists(pod, workdir)) {
		onLog?.(`Replacing the previous checkout at ${workdir}.\n`);
		await removePath(pod, workdir);
	}
	await renamePath(pod, staging, workdir);

	const repo: RepoRef = { url: request.url.trim(), ref, backend: request.backend, name };
	onStage?.('scanning');
	rememberWorkspace(repo, workdir);
	return { pod, workdir, repo };
}

/** Returns the saved checkout, or null once the pod's disk no longer has it. */
export async function reopenWorkspace(
	saved: SavedWorkspace,
	{ onLog, onStage }: Reporter = {},
	existingPod?: BrowserPod | null
): Promise<Workspace | null> {
	onStage?.('booting');
	onLog?.(existingPod ? 'Reusing the running pod.\n' : 'Reopening the pod filesystem...\n');
	const pod = existingPod ?? (await bootPod());

	onStage?.('scanning');
	if (!(await pathExists(pod, saved.workdir))) {
		onLog?.(`Nothing at ${saved.workdir} any more; clone it again.\n`);
		forgetWorkspace();
		return null;
	}

	onLog?.(`Found ${saved.workdir}.\n`);
	const { workdir, ...repo } = saved;
	return { pod, workdir, repo };
}

export function loadSavedWorkspace(): SavedWorkspace | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<SavedWorkspace>;
		if (!parsed?.workdir || !parsed.url || !parsed.name) return null;
		return {
			url: parsed.url,
			ref: parsed.ref ?? '',
			backend: parsed.backend === 'jj' ? 'jj' : 'git',
			name: parsed.name,
			workdir: parsed.workdir
		};
	} catch {
		return null;
	}
}

export function rememberWorkspace(repo: RepoRef, workdir: string): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...repo, workdir }));
	} catch {
		// A private mode storage failure is no reason to interrupt a clone.
	}
}

export function forgetWorkspace(): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// As above.
	}
}
