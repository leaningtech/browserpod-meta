import * as monaco from 'monaco-editor';
import { typescript as monacoTs } from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

/**
 * Monaco bootstrap, lifted from browsercode. With EditorPane, which imports it
 * dynamically, this is the only place that touches `monaco-editor`.
 */

self.MonacoEnvironment = {
	getWorker(_workerId: string, label: string): Worker {
		if (label === 'json') return new jsonWorker();
		if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
		if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
		if (label === 'typescript' || label === 'javascript') return new tsWorker();
		return new editorWorker();
	}
};

// A cloned repo has no node_modules for the TS worker to resolve, so semantic
// validation would flag every import. Syntax checks stay on.
for (const defaults of [monacoTs.typescriptDefaults, monacoTs.javascriptDefaults])
	defaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });

/** The app palette, applied to Monaco's chrome. */
monaco.editor.defineTheme('bramble', {
	base: 'vs-dark',
	inherit: true,
	rules: [],
	colors: {
		'editor.background': '#0b0a11',
		'editor.foreground': '#e8e3f2',
		'editorCursor.foreground': '#a970ff',
		'editor.selectionBackground': '#a970ff33',
		'editor.inactiveSelectionBackground': '#a970ff1a',
		'editor.lineHighlightBackground': '#ffffff06',
		'editorLineNumber.foreground': '#453e57',
		'editorLineNumber.activeForeground': '#a49bb8',
		'editorGutter.background': '#0b0a11',
		'editorIndentGuide.background1': '#ffffff0a',
		'editorIndentGuide.activeBackground1': '#a970ff33',
		'editorWhitespace.foreground': '#ffffff12',
		'editorWidget.background': '#17141f',
		'editorWidget.border': '#241f33',
		'editorSuggestWidget.selectedBackground': '#a970ff26',
		'input.background': '#08070c',
		'input.border': '#241f33',
		'scrollbarSlider.background': '#2e274099',
		'scrollbarSlider.hoverBackground': '#3d3454cc',
		'scrollbarSlider.activeBackground': '#a970ff66',
		'editorOverviewRuler.border': '#00000000',
		'editorBracketMatch.background': '#a970ff22',
		'editorBracketMatch.border': '#a970ff66'
	}
});

// Svelte and Vue have no Monaco grammar, so they fall back to HTML.
const LANGUAGE_BY_EXT: Record<string, string> = {
	svelte: 'html',
	vue: 'html',
	html: 'html',
	htm: 'html',
	ts: 'typescript',
	tsx: 'typescript',
	mts: 'typescript',
	cts: 'typescript',
	js: 'javascript',
	jsx: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	css: 'css',
	scss: 'scss',
	less: 'less',
	json: 'json',
	jsonc: 'json',
	md: 'markdown',
	markdown: 'markdown',
	yaml: 'yaml',
	yml: 'yaml',
	xml: 'xml',
	svg: 'xml',
	toml: 'ini',
	ini: 'ini',
	cfg: 'ini',
	sh: 'shell',
	bash: 'shell',
	zsh: 'shell',
	py: 'python',
	rb: 'ruby',
	rs: 'rust',
	go: 'go',
	java: 'java',
	kt: 'kotlin',
	swift: 'swift',
	c: 'c',
	h: 'c',
	cc: 'cpp',
	cpp: 'cpp',
	hpp: 'cpp',
	cs: 'csharp',
	php: 'php',
	lua: 'lua',
	sql: 'sql',
	graphql: 'graphql',
	gql: 'graphql',
	dockerfile: 'dockerfile',
	ps1: 'powershell',
	bat: 'bat'
};

/** Filenames with no useful extension. */
const LANGUAGE_BY_NAME: Record<string, string> = {
	dockerfile: 'dockerfile',
	makefile: 'plaintext',
	'.gitignore': 'plaintext',
	'.gitattributes': 'plaintext'
};

/** Maps a path to a Monaco language id. Unknown types are plaintext. */
export function languageFor(file: string): string {
	const name = (file.split('/').pop() ?? file).toLowerCase();
	const byName = LANGUAGE_BY_NAME[name];
	if (byName) return byName;
	const dot = name.lastIndexOf('.');
	if (dot < 0) return 'plaintext';
	return LANGUAGE_BY_EXT[name.slice(dot + 1)] ?? 'plaintext';
}

export { monaco };
