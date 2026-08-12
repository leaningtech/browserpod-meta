/**
 * Installing a binary into the pod.
 *
 * The pod image ships git but not jj, so jj rides along as a static asset and is copied
 * into /bin the first time it is needed.
 */
import { asset } from '$app/paths';
import type { BrowserPod } from '@leaningtech/browserpod';
import { pathExists, writePodBinaryFile } from './fs';
import { failed, failureMessage, run, type LogSink } from './run';

/** Where the binary lands in the pod. On PATH, so `jj` resolves without a prefix. */
export const JJ_POD_PATH = '/bin/jj';

/** Where it is served from. `static/pod-bin/jj` is copied verbatim into the build. */
const JJ_ASSET_PATH = asset('/pod-bin/jj');

/** One install per pod per page, however many clones race for it. */
const installs = new WeakMap<BrowserPod, Promise<void>>();

/** Copies jj into the pod, unless a previous visit already left it there. */
export function ensureJj(pod: BrowserPod, onLog?: LogSink): Promise<void> {
	let pending = installs.get(pod);
	if (!pending) {
		pending = install(pod, onLog).catch((error) => {
			// A failed install must not be cached, or a retry can never succeed.
			installs.delete(pod);
			throw error;
		});
		installs.set(pod, pending);
	}
	return pending;
}

async function install(pod: BrowserPod, onLog?: LogSink): Promise<void> {
	if (await isInstalled(pod)) return;

	const bytes = await download(onLog);

	// Staged under a different name, so an interrupted write can never leave a truncated
	// binary sitting at the path the shell resolves `jj` to.
	const staging = `${JJ_POD_PATH}.incoming`;
	onLog?.(`Writing ${JJ_POD_PATH}...\n`);
	await writePodBinaryFile(pod, staging, bytes);

	const chmod = await run(pod, 'chmod', ['755', staging]);
	if (failed(chmod)) throw new Error(failureMessage(chmod, 'Could not make jj executable'));

	const move = await run(pod, 'mv', ['-f', '--', staging, JJ_POD_PATH]);
	if (failed(move)) throw new Error(failureMessage(move, 'Could not install jj'));

	// Proves the binary actually runs here, rather than only that the bytes arrived.
	const version = await run(pod, 'jj', ['--version']);
	if (failed(version)) {
		throw new Error(failureMessage(version, 'jj was installed but will not run'));
	}
	onLog?.(`${version.output.trim() || 'jj installed'}\n`);
}

async function isInstalled(pod: BrowserPod): Promise<boolean> {
	if (!(await pathExists(pod, JJ_POD_PATH))) return false;
	const result = await run(pod, 'jj', ['--version']);
	return !failed(result);
}

/** Streamed rather than awaited whole, so the clone log can show it moving. */
async function download(onLog?: LogSink): Promise<ArrayBuffer> {
	const url = JJ_ASSET_PATH;
	const response = await fetch(url);
	if (!response.ok || !response.body) {
		throw new Error(`Could not fetch the jj binary from ${url} (HTTP ${response.status}).`);
	}

	const total = Number(response.headers.get('content-length')) || 0;
	onLog?.(`Downloading jj${total ? ` (${megabytes(total)} MB)` : ''}...\n`);

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let read = 0;
	let shown = -1;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		read += value.byteLength;
		// One update per whole percent; the chunks are far smaller than that. The leading
		// carriage return makes the log pane rewrite the line instead of stacking updates.
		const percent = total ? Math.floor((read / total) * 100) : -1;
		if (percent > shown) {
			shown = percent;
			onLog?.(`\rDownloaded ${megabytes(read)} / ${megabytes(total)} MB (${percent}%)`);
		}
	}
	if (total) onLog?.('\n');

	const bytes = new Uint8Array(read);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes.buffer;
}

function megabytes(bytes: number): string {
	return (bytes / 1_000_000).toFixed(1);
}
