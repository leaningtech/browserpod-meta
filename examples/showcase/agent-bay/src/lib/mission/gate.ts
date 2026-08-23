/**
 * The gate: a small, deterministic allowlist check that runs BEFORE every
 * write and every exec in the sandbox. The pod's node runs scripts from a
 * filesystem, so the gate itself ships inside the pod and is invoked with
 * `node /agent-bay/gate.js <verb> <payload-json>` — each mutation either
 * passes (exit 0) or the agent sees a blocking error and the mutation is
 * never applied.
 *
 * This is the same shape as ATLAS's token_gate: the agent's capabilities are
 * a bounded verb surface, and anything outside it is denied by construction
 * rather than by review.
 */

const GATE = String.raw`// agent-bay gate — installed into the sandbox, runs on every mutation.
import fs from 'node:fs';

const [verb, arg] = process.argv.slice(2);

function die(msg) {
  console.error('[gate] ' + msg);
  process.exit(1);
}

// The agent may WRITE only inside these prefixes (relative to repo root).
// Anything else — node_modules, .git, /, .. — is refused. Reads are not
// gated, so the agent can inspect everything it needs to write well.
const locks = JSON.parse(process.env.AGENT_LOCKS || '[]');
// 'src/**' means 'anything under src/'; strip the trailing glob and compare
// as a plain prefix. Bare 'src' behaves the same.
const lockPrefixes = locks.map((l) => String(l).replace(/\/\*\*$/, ''));
const isLocked = (p) =>
  lockPrefixes.some((l) => p === l || p.startsWith(l.endsWith('/') ? l : l + '/'));

function normalize(p) {
  const parts = [];
  for (const seg of String(p).replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') die('path escapes the repo: ' + p);
    parts.push(seg);
  }
  const rel = parts.join('/');
  if (!rel) die('empty path');
  return rel;
}

let payload = [];
try {
  payload = JSON.parse(arg || '[]');
} catch {
  die('bad payload');
}

switch (verb) {
  case 'write': {
    const [file] = payload;
    const rel = normalize(file);
    if (rel.startsWith('.git/') || rel.startsWith('.jj/')) die('writes inside metadata are refused');
    if (!isLocked(rel)) die('write outside the locked lanes: ' + rel);
    break;
  }
  case 'mkdir': {
    const [dir] = payload;
    if (dir.startsWith('/agent-bay/')) break;
    if (dir.startsWith('.git/') || dir.startsWith('.jj/')) die('mkdir inside .git/.jj is refused');
    const rel = normalize(dir);
    if (!isLocked(rel)) die('mkdir outside the locked lanes: ' + rel);
    break;
  }
  case 'exec': {
    const [cmd] = payload;
    if (/;\s*(rm|mv|cp|chmod|chown)\s+-[a-z]+[^;]*--\s*(\/|\.\.)/.test(cmd)) die('refusing dangerous shell line');
    // Shell redirections are the other way a step could write; check every
    // '>' or '>>' target against the locked lanes too.
    for (const m of String(cmd).matchAll(/(?:^|;|\|\||&&)\s*[^>|;&]*?>>?\s+(\S+)/g)) {
      const target = m[1].replace(/^['"]|['"]$/g, '');
      if (target.startsWith('/') || target.includes('..')) die('redirect outside the repo: ' + target);
      if (!isLocked(normalize(target))) die('redirect outside the locked lanes: ' + target);
    }
    break;
  }
  default:
    die('unknown verb ' + verb);
}
`;

export function gateScript(): string {
	return GATE;
}

/**
 * Ask the gate inside the pod whether a mutation is allowed. Cheap and
 * synchronous in the sandbox: `node gate.js <verb> <json>`.
 */
export async function gateAll(
	pod: import('@leaningtech/browserpod').BrowserPod,
	verb: 'write' | 'mkdir' | 'exec',
	payload: unknown[]
): Promise<boolean> {
	const { run } = await import('$lib/pod/run');
	const result = await run(pod, 'node', ['/agent-bay/gate.js', verb, JSON.stringify(payload)], {
		cwd: '/agent-bay'
	});
	return result.exitCode === 0;
}
