/**
 * File marks for the tree and the tab strip, adapted from browsercode's
 * `src/lib/ide/file-icons.ts`. Same resolution order, resolving to a two character
 * monospace glyph rather than an icon set id.
 */

export type Glyph = { label: string; color: string };

/** Muted, so the accent still leads. */
const HUE = {
	blue: '#5b9dd9',
	sky: '#57b3c9',
	yellow: '#cfae5e',
	amber: '#c98a4b',
	orange: '#cf7f52',
	red: '#d9614a',
	pink: '#d16b8f',
	violet: '#9b7bd4',
	green: '#6aa885',
	teal: '#5ba8a0',
	rust: '#c07a4e',
	grey: '#7c748d'
} as const;

/** Exact filename matches, checked before anything else. */
const nameGlyphs: Record<string, Glyph> = {
	'package.json': { label: 'PK', color: HUE.red },
	'package-lock.json': { label: 'PL', color: HUE.grey },
	'tsconfig.json': { label: 'TS', color: HUE.blue },
	'jsconfig.json': { label: 'JS', color: HUE.yellow },
	'.gitignore': { label: 'GI', color: HUE.orange },
	'.gitattributes': { label: 'GI', color: HUE.orange },
	'.gitmodules': { label: 'GI', color: HUE.orange },
	'.npmrc': { label: 'NP', color: HUE.red },
	'.editorconfig': { label: 'EC', color: HUE.grey },
	'.env': { label: 'EN', color: HUE.yellow },
	dockerfile: { label: 'DK', color: HUE.blue },
	makefile: { label: 'MK', color: HUE.grey },
	license: { label: 'LI', color: HUE.yellow },
	'license.md': { label: 'LI', color: HUE.yellow },
	'license.txt': { label: 'LI', color: HUE.yellow },
	'readme.md': { label: 'RM', color: HUE.sky },
	'robots.txt': { label: 'RB', color: HUE.grey },
	'cargo.toml': { label: 'CG', color: HUE.rust },
	'go.mod': { label: 'GO', color: HUE.teal }
};

/** Config files matched by prefix, such as `vite.config.js` or `vite.config.mts`. */
const prefixGlyphs: [string, Glyph][] = [
	['vite.config.', { label: 'VI', color: HUE.violet }],
	['svelte.config.', { label: 'SV', color: HUE.red }],
	['astro.config.', { label: 'AS', color: HUE.orange }],
	['next.config.', { label: 'NX', color: HUE.grey }],
	['nuxt.config.', { label: 'NU', color: HUE.green }],
	['tailwind.config.', { label: 'TW', color: HUE.sky }],
	['eslint.config.', { label: 'ES', color: HUE.violet }],
	['.eslintrc', { label: 'ES', color: HUE.violet }],
	['.prettierrc', { label: 'PR', color: HUE.pink }],
	['prettier.config.', { label: 'PR', color: HUE.pink }],
	['tsconfig.', { label: 'TS', color: HUE.blue }],
	['.env.', { label: 'EN', color: HUE.yellow }]
];

const extensionGlyphs: Record<string, Glyph> = {
	svelte: { label: 'SV', color: HUE.red },
	js: { label: 'JS', color: HUE.yellow },
	mjs: { label: 'JS', color: HUE.yellow },
	cjs: { label: 'JS', color: HUE.yellow },
	ts: { label: 'TS', color: HUE.blue },
	mts: { label: 'TS', color: HUE.blue },
	cts: { label: 'TS', color: HUE.blue },
	jsx: { label: 'JX', color: HUE.sky },
	tsx: { label: 'TX', color: HUE.sky },
	vue: { label: 'VU', color: HUE.green },
	astro: { label: 'AS', color: HUE.orange },
	json: { label: '{}', color: HUE.amber },
	jsonc: { label: '{}', color: HUE.amber },
	html: { label: '<>', color: HUE.orange },
	htm: { label: '<>', color: HUE.orange },
	css: { label: 'CS', color: HUE.violet },
	scss: { label: 'SC', color: HUE.pink },
	sass: { label: 'SC', color: HUE.pink },
	less: { label: 'LE', color: HUE.blue },
	md: { label: 'MD', color: HUE.sky },
	mdx: { label: 'MX', color: HUE.sky },
	svg: { label: 'SG', color: HUE.amber },
	png: { label: 'IM', color: HUE.violet },
	jpg: { label: 'IM', color: HUE.violet },
	jpeg: { label: 'IM', color: HUE.violet },
	gif: { label: 'IM', color: HUE.violet },
	webp: { label: 'IM', color: HUE.violet },
	avif: { label: 'IM', color: HUE.violet },
	ico: { label: 'IC', color: HUE.violet },
	yaml: { label: 'YM', color: HUE.green },
	yml: { label: 'YM', color: HUE.green },
	toml: { label: 'TM', color: HUE.rust },
	xml: { label: 'XM', color: HUE.orange },
	txt: { label: 'TX', color: HUE.grey },
	lock: { label: 'LK', color: HUE.grey },
	sh: { label: '$', color: HUE.green },
	bash: { label: '$', color: HUE.green },
	zsh: { label: '$', color: HUE.green },
	py: { label: 'PY', color: HUE.blue },
	rb: { label: 'RB', color: HUE.red },
	rs: { label: 'RS', color: HUE.rust },
	go: { label: 'GO', color: HUE.teal },
	java: { label: 'JV', color: HUE.orange },
	kt: { label: 'KT', color: HUE.violet },
	swift: { label: 'SW', color: HUE.orange },
	c: { label: 'C', color: HUE.blue },
	h: { label: 'H', color: HUE.blue },
	cpp: { label: 'C+', color: HUE.blue },
	hpp: { label: 'H+', color: HUE.blue },
	cs: { label: 'C#', color: HUE.green },
	php: { label: 'PH', color: HUE.violet },
	lua: { label: 'LU', color: HUE.blue },
	graphql: { label: 'GQ', color: HUE.pink },
	gql: { label: 'GQ', color: HUE.pink },
	prisma: { label: 'PZ', color: HUE.teal },
	sql: { label: 'SQ', color: HUE.teal },
	sqlite: { label: 'DB', color: HUE.teal },
	db: { label: 'DB', color: HUE.teal },
	wasm: { label: 'WA', color: HUE.violet },
	pdf: { label: 'PD', color: HUE.red },
	zip: { label: 'ZP', color: HUE.grey },
	gz: { label: 'ZP', color: HUE.grey },
	tar: { label: 'ZP', color: HUE.grey },
	mp3: { label: 'AU', color: HUE.pink },
	wav: { label: 'AU', color: HUE.pink },
	mp4: { label: 'VD', color: HUE.pink },
	webm: { label: 'VD', color: HUE.pink },
	woff: { label: 'FN', color: HUE.grey },
	woff2: { label: 'FN', color: HUE.grey },
	ttf: { label: 'FN', color: HUE.grey },
	otf: { label: 'FN', color: HUE.grey }
};

export const DEFAULT_GLYPH: Glyph = { label: '.', color: HUE.grey };

/** Resolves by exact name, then config prefix, then extension. */
export function fileGlyph(nameOrPath: string): Glyph {
	const name = (nameOrPath.split('/').pop() ?? nameOrPath).toLowerCase();
	const byName = nameGlyphs[name];
	if (byName) return byName;
	for (const [prefix, glyph] of prefixGlyphs) if (name.startsWith(prefix)) return glyph;
	if (name.endsWith('.d.ts')) return { label: 'DT', color: HUE.blue };
	const dot = name.lastIndexOf('.');
	if (dot <= 0) return DEFAULT_GLYPH;
	return extensionGlyphs[name.slice(dot + 1)] ?? DEFAULT_GLYPH;
}

/** Folders worth tinting, so `src` and friends stand out. */
const tintedFolders = new Set([
	'src',
	'lib',
	'app',
	'public',
	'static',
	'assets',
	'components',
	'routes',
	'tests',
	'test',
	'docs',
	'.github'
]);

export function isTintedFolder(name: string): boolean {
	return tintedFolders.has(name.toLowerCase());
}
