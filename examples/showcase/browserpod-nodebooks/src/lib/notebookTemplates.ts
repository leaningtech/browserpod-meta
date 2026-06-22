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
		id: 'blank',
		label: 'Blank notebook',
		description: 'A single empty cell. Bring your own code.',
		icon: 'mingcute:file-line',
		cells: [code('// Start typing...\n')]
	}
];
