/** Polls a small fingerprint of the checkout, since the pod has no file watching API. */
import type { BrowserPod } from '@leaningtech/browserpod';
import type { VcsId } from '$lib/vcs';
import { runScript, stripAnsi } from './run';

export type CheckoutState = { head: string; branch: string };

// Two lines out, always: commit then branch. Runs on a timer, so nothing here may
// mutate; `--ignore-working-copy` stops jj snapshotting, `--no-pager` its pager.
const PROBES: Record<VcsId, string> = {
	git: [
		'git rev-parse HEAD 2>/dev/null || echo unknown',
		`git symbolic-ref --short --quiet HEAD 2>/dev/null || echo ''`
	].join('; '),
	jj: [
		`jj --no-pager log --no-graph --ignore-working-copy -r @ -T commit_id 2>/dev/null || echo unknown`,
		`echo ''`,
		// The working copy commit rarely carries a bookmark; use the nearest ancestor one.
		`jj --no-pager log --no-graph --ignore-working-copy -r 'latest(::@ & bookmarks())' -T bookmarks 2>/dev/null || echo ''`
	].join('; ')
};

/** Where the checkout is parked, or null when the probe could not be run. */
export async function readCheckoutState(
	pod: BrowserPod,
	workdir: string,
	backend: VcsId
): Promise<CheckoutState | null> {
	const result = await runScript(pod, PROBES[backend], { cwd: workdir });
	const lines = stripAnsi(result.output)
		.split(/\r?\n/)
		.map((line) => line.trim());
	const head = lines[0] ?? '';
	if (!head || head === 'unknown') return null;
	// jj lists bookmarks space-separated, `*` marking conflicts; the first name is enough.
	const branch = (lines[1] ?? '').split(/\s+/)[0].replace(/\*$/, '');
	return { head, branch };
}

/** Treats "could not read" as "no news". */
export function sameCheckout(a: CheckoutState | null, b: CheckoutState | null): boolean {
	if (!a || !b) return true;
	return a.head === b.head && a.branch === b.branch;
}
