/**
 * Pod lifecycle, following agent-bay's boot.ts shape.
 */
import type { BrowserPod } from '@leaningtech/browserpod';

export const POD_STORAGE_KEY = 'dope-swarm';

export class PodBootError extends Error {}

/** Boots or reopens the persistent pod. Browser only, never call during SSR. */
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

	const k = import.meta.env['VITE_BP_APIKEY'] as string | undefined;
	if (!k) {
		throw new PodBootError(
			'No BrowserPod apiKey. Copy .env.example to .env and set VITE_BP_APIKEY.'
		);
	}

	// Dynamic so the runtime is never pulled into an SSR or prerender pass.
	const { BrowserPod } = await import('@leaningtech/browserpod');
	if (!BrowserPod) throw new PodBootError('The BrowserPod runtime failed to load.');

	return await BrowserPod.boot({ apiKey: k, storageKey });
}
