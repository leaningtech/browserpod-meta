/**
 * Pod lifecycle, following bramble's boot.ts shape.
 */
import type { BrowserPod } from '@leaningtech/browserpod';

export const POD_STORAGE_KEY = 'agent-bay';

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

/** `shutdown` is not in the published types yet (see PR #16). */
export async function shutdownPod(pod: BrowserPod): Promise<void> {
	try {
		await (pod as BrowserPod & { shutdown?: () => Promise<void> }).shutdown?.();
	} catch (error) {
		console.error('Failed to shut down pod:', error);
	}
}
