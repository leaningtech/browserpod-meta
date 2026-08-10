/**
 * Pod lifecycle, adapted from the front half of browsercode's `IdeSession.bootPod`.
 */
import type { BrowserPod } from '@leaningtech/browserpod';

/** Booting with the same key reopens the previous pod's disk. */
export const POD_STORAGE_KEY = 'browser-repo-explorer';

export class PodBootError extends Error {}

/** Boots or reopens the persistent pod. Browser only, never call this during SSR. */
export async function bootPod(storageKey = POD_STORAGE_KEY): Promise<BrowserPod> {
	if (typeof window === 'undefined') {
		throw new PodBootError('BrowserPod can only boot in the browser.');
	}
	if (!crossOriginIsolated) {
		throw new PodBootError(
			'This page is not cross-origin isolated, so SharedArrayBuffer is unavailable. ' +
				'Serve it with Cross-Origin-Opener-Policy: same-origin and ' +
				'Cross-Origin-Embedder-Policy: require-corp.'
		);
	}

	const apiKey = import.meta.env.VITE_BP_APIKEY;
	if (!apiKey) {
		throw new PodBootError(
			'No BrowserPod API key. Copy .env.example to .env and set VITE_BP_APIKEY.'
		);
	}

	// Dynamic so the runtime is never pulled into an SSR or prerender pass.
	const { BrowserPod } = await import('@leaningtech/browserpod');
	if (!BrowserPod) throw new PodBootError('The BrowserPod runtime failed to load.');

	return await BrowserPod.boot({ apiKey, storageKey });
}

/** `shutdown` is not in the published types yet. */
export async function shutdownPod(pod: BrowserPod): Promise<void> {
	try {
		await (pod as BrowserPod & { shutdown?: () => Promise<void> }).shutdown?.();
	} catch (error) {
		console.error('Failed to shut down pod:', error);
	}
}
