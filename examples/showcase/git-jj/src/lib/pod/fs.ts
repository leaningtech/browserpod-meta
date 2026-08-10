/**
 * Pod filesystem access. The read and write helpers come from browsercode's
 * `src/lib/pod/fs.ts`; listing, rename and delete go through a subprocess, since the
 * pod's file API covers only create, open and mkdir.
 */
import type { BinaryFile, BrowserPod, TextFile } from '@leaningtech/browserpod';
import { failed, failureMessage, run, runScript, stripAnsi } from './run';

/** Clones land in a subdirectory of this. */
export const POD_HOME = '/home/user';

/** One entry of a listed working tree, relative to the listing root. */
export type PodEntry = { path: string; dir: boolean };

export function podPath(workdir: string, relative: string): string {
	return relative ? `${workdir}/${relative}` : workdir;
}

export async function readPodFile(pod: BrowserPod, absPath: string): Promise<string> {
	const file = (await pod.openFile(absPath, 'utf-8')) as TextFile;
	try {
		const size = await file.getSize();
		return await file.read(size);
	} finally {
		await file.close();
	}
}

/** Returns null, without reading, when the file is larger than `maxBytes`. */
export async function readPodFileWithinLimit(
	pod: BrowserPod,
	absPath: string,
	maxBytes: number
): Promise<string | null> {
	const file = (await pod.openFile(absPath, 'utf-8')) as TextFile;
	try {
		const size = await file.getSize();
		if (size > maxBytes) return null;
		return await file.read(size);
	} finally {
		await file.close();
	}
}

export async function readPodBinaryFile(
	pod: BrowserPod,
	absPath: string
): Promise<Uint8Array<ArrayBuffer>> {
	const file = (await pod.openFile(absPath, 'binary')) as BinaryFile;
	try {
		const size = await file.getSize();
		return new Uint8Array(await file.read(size));
	} finally {
		await file.close();
	}
}

export async function writePodFile(
	pod: BrowserPod,
	absPath: string,
	content: string
): Promise<void> {
	await ensureParentDirectory(pod, absPath);
	const file = (await pod.createFile(absPath, 'utf-8')) as TextFile;
	try {
		await file.write(content);
	} finally {
		await file.close();
	}
}

export async function writePodBinaryFile(
	pod: BrowserPod,
	absPath: string,
	content: ArrayBuffer
): Promise<void> {
	await ensureParentDirectory(pod, absPath);
	const file = (await pod.createFile(absPath, 'binary')) as BinaryFile;
	try {
		await file.write(content);
	} finally {
		await file.close();
	}
}

export async function makeDirectory(pod: BrowserPod, absPath: string): Promise<void> {
	await pod.createDirectory(absPath, { recursive: true });
}

async function ensureParentDirectory(pod: BrowserPod, absPath: string): Promise<void> {
	const parent = absPath.slice(0, absPath.lastIndexOf('/'));
	if (parent) await pod.createDirectory(parent, { recursive: true });
}

export async function pathExists(pod: BrowserPod, absPath: string): Promise<boolean> {
	const result = await run(pod, 'test', ['-e', absPath]);
	return result.exitCode === 0;
}

export async function renamePath(pod: BrowserPod, from: string, to: string): Promise<void> {
	const result = await run(pod, 'mv', ['-f', '--', from, to]);
	if (failed(result)) throw new Error(failureMessage(result, 'Rename failed'));
}

export async function removePath(pod: BrowserPod, absPath: string): Promise<void> {
	const result = await run(pod, 'rm', ['-rf', '--', absPath]);
	if (failed(result)) throw new Error(failureMessage(result, 'Delete failed'));
}

const SKIPPED_DIRECTORIES = ['.git', '.jj', 'node_modules'];
const MAX_TREE_ENTRIES = 20000;

/** Separates the directory pass from the file pass. */
const LISTING_SPLIT = '__bre_split__';

/**
 * Two `find` passes rather than one, because the pod's `find` need not be GNU and
 * `-printf` is the only single pass way to tag each line with its type. The pod's
 * `node` is a script runner that reads its first argument as a module path, so
 * `node -e` is not an option either.
 */
function listingScript(): string {
	const prune = SKIPPED_DIRECTORIES.map((name) => `-name ${name}`).join(' -o ');
	const pass = (test: string) => `find . -mindepth 1 \\( ${prune} \\) -prune -o ${test} -print`;
	return `${pass('-type d')}; echo '${LISTING_SPLIT}'; ${pass('\\( -type f -o -type l \\)')}`;
}

/** Every file and directory under `root`, as paths relative to it. */
export async function listTree(pod: BrowserPod, root: string): Promise<PodEntry[]> {
	const result = await runScript(pod, listingScript(), { cwd: root });
	if (failed(result)) throw new Error(failureMessage(result, 'Could not list files'));

	const entries: PodEntry[] = [];
	let dir = true;
	for (const line of stripAnsi(result.output).split(/\r?\n/)) {
		const path = line.trim();
		if (path === LISTING_SPLIT) {
			dir = false;
			continue;
		}
		// find prints `./name`; anything else is terminal noise.
		if (!path.startsWith('./')) continue;
		if (entries.length >= MAX_TREE_ENTRIES) break;
		entries.push({ path: path.slice(2), dir });
	}
	return entries;
}
