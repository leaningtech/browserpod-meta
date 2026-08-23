/**
 * Example missions for Agent Bay. Copy one into the editor, or paste a URL
 * to a mission file hosted anywhere.
 */
import type { Mission } from './types';

export const EXAMPLE_MISSIONS: Mission[] = [
	{
		name: 'checkout + install + test',
		description: 'Clone a small Node repo, install, run tests, record the verdict.',
		clone: { url: 'https://github.com/leaningtech/browserpod-meta', ref: 'main' },
		locks: ['agent-bay/**'],
		steps: [
			{ label: 'inspect', run: 'ls -la', store: 'listing' },
			{ label: 'install', run: 'npm install --no-audit --no-fund' },
			{ label: 'test', run: 'npm test || echo "(no test script)"' },
			{ label: 'summary', run: 'echo "Mission complete. Worktree: @step:1@"' }
		],
		verdictPath: 'agent-bay/verdicts.md',
		accent: '7dd3fc'
	},
	{
		name: 'webhook smoke',
		description: 'Boot the general-hook demo and hit its mock route through a portal.',
		clone: { url: 'https://github.com/leaningtech/browserpod-meta.git', ref: 'main' },
		locks: ['**'],
		steps: [
			{ label: 'install', run: 'npm ci --no-audit' },
			{ label: 'serve', run: 'npx vite --port 4173 --host' },
			{ label: 'probe', run: 'sleep 1; curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:4173/ || echo "no response"' }
		],
		verdictPath: 'smoke/verdicts.md'
	}
];
