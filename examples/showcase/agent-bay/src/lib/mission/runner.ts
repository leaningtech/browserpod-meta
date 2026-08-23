/**
 * The runner: one mission = one pod session. It clones the repo, installs
 * the gate, runs each step through it in order, and writes a verdict log.
 * The UI calls `runMission` once; the return value is the full report.
 */
import type { BrowserPod } from '@leaningtech/browserpod';
import type { Mission, Step } from './types';
import { gateAll, gateScript } from './gate';
import { run, runScript, failed, failureMessage, stripAnsi } from '$lib/pod/run';
import { writePodFile, makeDirectory } from '$lib/pod/fs';

export type StepStatus = 'ok' | 'failed' | 'blocked';

export interface StepResult {
	label: string;
	run: string;
	status: StepStatus;
	exitCode: number;
	output: string;
	blockedReason?: string;
}

export interface MissionReport {
	missionName: string;
	repoUrl: string;
	steps: StepResult[];
	cloneFailed?: string;
	finishedAt: string;
	verdictPath: string;
}

function now(): string {
	return new Date().toISOString();
}

/** Install the gate script into the sandbox (once per pod). */
async function installGate(pod: BrowserPod): Promise<void> {
	await makeDirectory(pod, '/agent-bay');
	await writePodFile(pod, '/agent-bay/gate.js', gateScript());
}

/** Clones `mission.clone` into `/repo` (fresh dir each run so missions replay). */
async function cloneRepo(pod: BrowserPod, mission: Mission) {
	await run(pod, 'rm', ['-rf', '--', '/repo']);
	const args = ['clone', '--depth', '1', '--no-single-branch'];
	if (mission.clone.ref) args.push('--branch', mission.clone.ref);
	args.push(mission.clone.url, '/repo');
	return await run(pod, 'git', args);
}

/** Expands `@step:N@` placeholders in a command with earlier stored outputs. */
function expandPlaceholders(cmd: string, stores: Map<number, string>): string {
	return cmd.replace(/@step:(\d+)@/g, (_m, n) => stores.get(Number(n)) ?? '');
}

export async function runMission(pod: BrowserPod, mission: Mission): Promise<MissionReport> {
	await installGate(pod);

	const report: MissionReport = {
		missionName: mission.name,
		repoUrl: mission.clone.url,
		steps: [],
		finishedAt: now(),
		verdictPath: mission.verdictPath ?? 'agent-bay/verdicts.md'
	};

	const cloneResult = await cloneRepo(pod, mission);
	if (failed(cloneResult)) {
		report.cloneFailed = failureMessage(cloneResult, 'clone error');
		report.finishedAt = now();
		return report;
	}

	// The gate reads the lock list from the pod filesystem.
	await writePodFile(
		pod,
		'/agent-bay/locks.json',
		JSON.stringify(mission.locks ?? [], null, 2)
	);
	const env = [`AGENT_LOCKS=${JSON.stringify(mission.locks ?? [])}`, `AGENT_ROOT=/repo`];

	const stores = new Map<number, string>();

	for (let i = 0; i < (mission.steps ?? []).length; i++) {
		const step: Step = mission.steps[i];
		const label = step.label ?? `step ${i + 1}`;
		const cmd = expandPlaceholders(step.run, stores);

		// Ask the gate first; it refuses dangerous shell lines and writes
		// outside the locked lanes.
		const allowed = await gateAll(pod, 'exec', [cmd]);
		if (!allowed) {
			report.steps.push({
				label,
				run: step.run,
				status: 'blocked',
				exitCode: -1,
				output: '',
				blockedReason: 'the gate refused this shell line'
			});
			continue;
		}

		const result = await runScript(pod, cmd, { cwd: '/repo', env });
		const status: StepStatus = failed(result) ? 'failed' : 'ok';
		if (step.store && status === 'ok') {
			stores.set(i, stripAnsi(result.output).trim());
		}

		report.steps.push({
			label,
			run: step.run,
			status,
			exitCode: result.exitCode,
			output: result.output
		});

		if (status === 'failed') break;
	}

	// Verdict log — append-only inside the pod, on the repo's locked lanes.
	const verdictPath = report.verdictPath;
	const verdict = [
		`# Mission: ${mission.name}`,
		``,
		`- repo: ${mission.clone.url}`,
		`- finished: ${now()}`,
		`- failed: ${report.steps.some((s) => s.status === 'failed') ? 'yes' : 'no'}`,
		``,
		...(report.steps.flatMap((s) => [
			`## ${s.label} — ${s.status}`,
			``,
			'```bash',
			s.run,
			'```',
			``,
			s.blockedReason ? `_${s.blockedReason}_` : s.output.trim() ? s.output.trim() : '_no output_',
			``
		])),
		`---`
	].join('\n');

	const dir = verdictPath.includes('/') ? verdictPath.slice(0, verdictPath.lastIndexOf('/')) : '.';
	await makeDirectory(pod, `/repo/${dir}`);
	await writePodFile(pod, `/repo/${verdictPath.startsWith('/') ? verdictPath : `/repo/${verdictPath}`}`, verdict);

	report.finishedAt = now();
	return report;
}
