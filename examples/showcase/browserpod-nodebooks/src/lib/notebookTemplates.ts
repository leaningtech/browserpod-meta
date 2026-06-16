export type WorkbookCell =
	| { kind: 'code'; source: string }
	| { kind: 'markdown'; source: string };

export type NotebookTemplate = {
	id: string;
	label: string;
	description: string;
	icon: string;
	cells: WorkbookCell[];
};

const code = (source: string): WorkbookCell => ({ kind: 'code', source });
const md = (source: string): WorkbookCell => ({ kind: 'markdown', source });

export const notebookTemplates: NotebookTemplate[] = [
	{
		id: 'express',
		label: 'Express hello world',
		description: 'A tiny Express server that returns a greeting on port 3000.',
		icon: 'simple-icons:express',
		cells: [
			md(`# Express hello world

Spin up a tiny **Express** server inside the sandbox, write its source to disk, and run it. The portal URL that appears above the notebook lets you open the running server in a new tab.

Each code cell runs as a fresh \`node\` process, but the **filesystem persists** between cells — that's why you can install a package in one cell and \`require\` it in the next.`),
			md(`### 1. Install Express

We shell out to \`npm install\` via \`node:child_process\`. This only needs to run once per sandbox session — \`node_modules\` will still be there when you run cell 3.`),
			code(`const { execSync } = require('node:child_process');
console.log('Installing express...');
execSync('npm install express --silent --no-audit --no-fund', { stdio: 'inherit' });
console.log('Done.');`),
			md(`### 2. Write the server source to disk

We can't keep an Express app alive across cells (each cell is a new \`node\` process), so we write the server to \`/home/user/app/server.js\` and \`require\` it from cell 3.`),
			code(`const fs = require('node:fs');

const source = \`
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Hello from BrowserPod + Express!');
});

app.listen(port, () => {
  console.log('Listening on http://localhost:' + port);
});
\`.trim();

fs.mkdirSync('/home/user/app', { recursive: true });
fs.writeFileSync('/home/user/app/server.js', source);
console.log('Wrote /home/user/app/server.js');`),
			md(`### 3. Boot the server

Running this cell starts the server and keeps the cell alive. A **portal URL** will appear above the notebook — click it to hit the running app. Stop the cell (or refresh the page) to shut the server down.`),
			code(`process.chdir('/home/user/app');
require('/home/user/app/server.js');`)
		]
	},
	{
		id: 'http',
		label: 'Plain Node HTTP server',
		description: 'A zero-dependency HTTP server using only the built-in node:http module.',
		icon: 'simple-icons:nodedotjs',
		cells: [
			md(`# Plain Node HTTP server

The smallest possible web server. No \`npm install\`, no framework — just the built-in \`node:http\` module returning a JSON payload.

This is a good way to confirm that the sandbox's network and portal forwarding are working before you reach for anything heavier.`),
			md(`### Start the server

Each request gets a JSON response describing the method, URL, and current time. The portal URL above the notebook will route to port 3000.`),
			code(`const http = require('node:http');

const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({
    message: 'Hello from a plain Node server',
    method: req.method,
    url: req.url,
    now: new Date().toISOString(),
  }, null, 2));
});

server.listen(3000, '0.0.0.0', () => {
  console.log('Listening on http://localhost:3000');
});`)
		]
	},
	{
		id: 'fetch',
		label: 'Fetch & parse JSON',
		description: 'Hit a public API with the built-in fetch and pretty-print the response.',
		icon: 'mingcute:download-2-line',
		cells: [
			md(`# Fetch & parse JSON

A short data pipeline: hit a public API, save the response to disk, then read it back and summarise it. Demonstrates that **\`fetch\` is built into Node 18+** (no \`node-fetch\` needed) and that files written in one cell are visible to the next.`),
			md(`### 1. Hit a public API

Pull repo metadata from the GitHub API and pretty-print the bits we care about. \`await\` works at the top level because each cell is run as an ES-module-flavoured script.`),
			code(`const res = await fetch('https://api.github.com/repos/leaningtech/browserpod');
console.log('status:', res.status);
const data = await res.json();
console.log(JSON.stringify({
  full_name: data.full_name,
  description: data.description,
  stars: data.stargazers_count,
  open_issues: data.open_issues_count,
  language: data.language,
}, null, 2));`),
			md(`### 2. Cache the response to disk

Save the contributors list to \`/home/user/data/contributors.json\` so the next cell can work on the data without going to the network again. Useful for iterating on a transformation without re-hitting rate-limited APIs.`),
			code(`const fs = require('node:fs/promises');

const res = await fetch('https://api.github.com/repos/leaningtech/browserpod/contributors');
const contributors = await res.json();

await fs.mkdir('/home/user/data', { recursive: true });
await fs.writeFile('/home/user/data/contributors.json', JSON.stringify(contributors, null, 2));

console.log('Wrote', contributors.length, 'contributors to /home/user/data/contributors.json');`),
			md(`### 3. Read it back and summarise

Load the cached JSON, sort by contribution count, and print the top five as a table. Because the file is on disk, you can re-run *just this cell* as you tweak the reduction without re-fetching.`),
			code(`const fs = require('node:fs/promises');
const raw = await fs.readFile('/home/user/data/contributors.json', 'utf-8');
const contributors = JSON.parse(raw);

const top = contributors
  .sort((a, b) => b.contributions - a.contributions)
  .slice(0, 5)
  .map(c => ({ login: c.login, contributions: c.contributions }));

console.table(top);`)
		]
	},
	{
		id: 'fs',
		label: 'Filesystem playground',
		description: 'Read, write, and traverse files using fs/promises in the sandbox.',
		icon: 'mingcute:folder-2-line',
		cells: [
			md(`# Filesystem playground

A tour of \`fs/promises\` against the sandbox's persistent filesystem. Anything you write here will still be there next time you run a cell.`),
			md(`### 1. Create a small project

Lay down a few files under \`/home/user/playground\` so we have something to traverse and edit in the next cells.`),
			code(`const fs = require('node:fs/promises');
const path = require('node:path');

const root = '/home/user/playground';
await fs.mkdir(path.join(root, 'src'), { recursive: true });
await fs.writeFile(path.join(root, 'README.md'), '# Playground\\n\\nGenerated from a notebook.');
await fs.writeFile(path.join(root, 'src/index.js'), 'console.log("hello");');
await fs.writeFile(path.join(root, 'src/utils.js'), 'module.exports.add = (a, b) => a + b;');

console.log('Created', root);`),
			md(`### 2. Walk the tree

A recursive directory walk that prints each file with its size in bytes. The pattern (\`readdir\` with \`withFileTypes\`) is the standard way to traverse a tree without extra dependencies.`),
			code(`const fs = require('node:fs/promises');
const path = require('node:path');

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

const files = await walk('/home/user/playground');
for (const f of files) {
  const stat = await fs.stat(f);
  console.log(stat.size.toString().padStart(6), f);
}`),
			md(`### 3. Read, transform, write back

Open the README, run a string replace, and write the result back. Because each cell is a fresh process, this is a good test that the **previous cells' writes really did land on disk**.`),
			code(`const fs = require('node:fs/promises');
const original = await fs.readFile('/home/user/playground/README.md', 'utf-8');
const updated = original.replace('# Playground', '# Playground (edited from a cell)');
await fs.writeFile('/home/user/playground/README.md', updated);
console.log(updated);`)
		]
	},
	{
		id: 'blank',
		label: 'Blank notebook',
		description: 'A single empty cell. Bring your own code.',
		icon: 'mingcute:file-line',
		cells: [code('// Start typing...\n')]
	}
];
