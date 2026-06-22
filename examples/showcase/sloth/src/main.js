import { BrowserPod } from '@leaningtech/browserpod'
import { buildZip } from './zip.js'

// SLOTH's source lives one level up (sloth/), not on npm, so we ship it into
// the Pod rather than installing it. Vite's `?raw` suffix inlines each file's
// text at build time, keeping the source on disk authoritative.
import slothJs from '../sloth.js?raw'
import wrapJs from '../lib/wrap.js?raw'
import themesJs from '../lib/themes.js?raw'
import bigHeadersJs from '../lib/big-headers.js?raw'
import graphJs from '../lib/graph.js?raw'
import editorJs from '../lib/editor.js?raw'
import controlsJs from '../lib/controls.js?raw'
import slideHtmlJs from '../lib/slide-html.js?raw'
import presentServerJs from '../lib/present-server.js?raw'
import projectJs from '../lib/project.js?raw'
import goghThemesJs from '../lib/gogh-themes.js?raw'
import qrJs from '../lib/qr.js?raw'
import qrcodeGenJs from '../lib/qrcode-generator.cjs?raw'

// Two linked demo decks so wikilinks and the graph have real edges.
import introMd from '../decks/intro.md?raw'
import featuresMd from '../decks/features.md?raw'

// The sloth ASCII art shown as the home-screen header.
import asciiArt from '../ascii-art.txt?raw'

// SLOTH's runtime dependency tree, pre-built into ../pod-modules by
// scripts/build-pod-modules.mjs. Globbing it as raw text lets us write a ready
// node_modules into the Pod, so there is no `npm install` step and no runtime
// dependency on the npm registry. Keys look like '../pod-modules/charm/...';
// values are { default: '<file text>' }.
const POD_MODULES = import.meta.glob('../pod-modules/**/*', {
  query: '?raw',
  import: 'default',
  eager: true
})

// A minimal package.json so `node sloth.js` has a project root. No deps here:
// they are shipped directly as node_modules below.
const PKG = {
  name: 'sloth-pod',
  version: '2.0.0',
  private: true,
  bin: { sloth: './sloth.js' }
}

// A starter theme.json so the configurator (`c` in the app) has something to
// edit and persist. It overrides the built-in "default" and adds a custom one.
const THEME_JSON = {
  default: {
    heading: 'cyan', accent: 'yellow', link: 'blue', code: 'green',
    quote: 'magenta', bar: 'inverse', dim: 'grey', big: 'cyan'
  },
  ocean: {
    heading: 'blue', accent: 'cyan', link: 'cyan', code: 'green',
    quote: 'blue', bar: 'inverse', dim: 'grey', big: 'blue'
  }
}

const FILES = {
  '/project/sloth.js': slothJs,
  '/project/lib/wrap.js': wrapJs,
  '/project/lib/themes.js': themesJs,
  '/project/lib/big-headers.js': bigHeadersJs,
  '/project/lib/graph.js': graphJs,
  '/project/lib/editor.js': editorJs,
  '/project/lib/controls.js': controlsJs,
  '/project/lib/slide-html.js': slideHtmlJs,
  '/project/lib/project.js': projectJs,
  '/project/lib/qr.js': qrJs,
  '/project/lib/qrcode-generator.cjs': qrcodeGenJs,
  '/project/lib/gogh-themes.js': goghThemesJs,
  '/project/present-server.js': presentServerJs,
  '/project/intro.md': introMd,
  '/project/features.md': featuresMd,
  '/project/sloth-art.txt': asciiArt,
  '/project/theme.json': JSON.stringify(THEME_JSON, null, 2),
  '/project/package.json': JSON.stringify(PKG, null, 2)
}

async function writeFile (pod, path, contents) {
  const f = await pod.createFile(path, 'utf-8')
  await f.write(contents)
  await f.close()
}

// Create every directory on the way to a file path (BrowserPod's createFile
// does not create missing parents). Tracks what it has made so each dir is
// only created once across many files.
const madeDirs = new Set(['/project'])
async function ensureDir (pod, dir) {
  if (madeDirs.has(dir)) return
  await pod.createDirectory(dir, { recursive: true })
  madeDirs.add(dir)
}

function dirname (p) {
  const i = p.lastIndexOf('/')
  return i <= 0 ? '/' : p.slice(0, i)
}

// Map a glob key like '../pod-modules/charm/index.js' to its Pod destination
// '/project/node_modules/charm/index.js'. Tolerant of how different Vite
// versions spell the key (../pod-modules, /pod-modules, ./pod-modules).
function podModulePath (globKey) {
  const rel = globKey.replace(/^.*?pod-modules\//, '')
  return '/project/node_modules/' + rel
}

// A hidden file input lives in the DOM purely so we can open the browser's
// native file dialog. There is no visible upload UI on the page: uploading is
// a menu item inside SLOTH (see the onOpen handshake below).
const fileInput = document.querySelector('#file-input')

// Boot the Pod. VITE_BP_APIKEY is defined in .env.
const pod = await BrowserPod.boot({ apiKey: import.meta.env.VITE_BP_APIKEY })

// Lay down the source tree, decks, and starter theme.
await pod.createDirectory('/project/lib', { recursive: true })
for (const [path, contents] of Object.entries(FILES)) {
  await writeFile(pod, path, contents)
}

// Ship the pre-built dependency tree into /project/node_modules. This replaces
// `npm install` entirely: everything SLOTH needs is written before it runs.
for (const [globKey, contents] of Object.entries(POD_MODULES)) {
  const dest = podModulePath(globKey)
  await ensureDir(pod, dirname(dest))
  await writeFile(pod, dest, contents)
}

// Upload handshake. SLOTH's "Upload" menu item runs `xdg-open sloth:upload`
// inside the Pod; BrowserPod fires onOpen on the page with that string. We open
// the browser's native file dialog, write the chosen file into /project, and
// record its name in /project/.sloth-upload, which SLOTH polls for and opens.
const UPLOAD_SENTINEL = 'sloth:upload'
const UPLOAD_RESULT = '/project/.sloth-upload'
const DOWNLOAD_SENTINEL = 'sloth:download-starter'

// Home-screen logo overlay. SLOTH emits sloth:menu / sloth:deck as it enters
// and leaves its home screen; the terminal can't draw images, so the page
// shows this PNG over the menu's reserved top band.
const homeLogo = document.querySelector('#home-logo')
function showHomeLogo (show) {
  if (!homeLogo) return
  homeLogo.hidden = !show
}

pod.onOpen((urlOrPath) => {
  if (urlOrPath === UPLOAD_SENTINEL) { if (fileInput) fileInput.click(); return }
  if (urlOrPath === DOWNLOAD_SENTINEL) { downloadStarterProject(); return }
  if (urlOrPath === 'sloth:download-project') { downloadCurrentProject(); return }
  if (urlOrPath === 'sloth:menu') { showHomeLogo(true); return }
  if (urlOrPath === 'sloth:deck') { showHomeLogo(false); return }
  if (urlOrPath === 'sloth:portal-close') { closePortalPanel(); return }
})

// Read a whole text file out of the Pod.
async function readPodFile (path) {
  const f = await pod.openFile(path, 'utf-8')
  const size = await f.getSize()
  const text = await f.read(size)
  await f.close()
  return text
}

function base64ToBytes (b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// Download the current project. SLOTH wrote a manifest of every project file
// (base64) to /project/.sloth-download.json and fired the sentinel; we read it,
// build a zip, and trigger the browser download. Nothing leaves the page.
async function downloadCurrentProject () {
  let manifest
  try {
    manifest = JSON.parse(await readPodFile('/project/.sloth-download.json'))
  } catch (e) { return }
  const entries = (manifest.files || []).map((f) => ({ name: f.name, data: base64ToBytes(f.b64) }))
  const blob = buildZip(entries)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = manifest.zip || 'sloth-project.zip'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

// The empty SLOTH project structure a user fills in, then uploads back. Folders
// carry a .gitkeep so they survive zipping; a sample deck, config, and README
// show the convention and directives.
function downloadStarterProject () {
  const README = [
    '# SLOTH project',
    '',
    'Author your talk in these folders using any editor (Obsidian works well),',
    'then zip the folder and use Upload in SLOTH. SLOTH reads this layout, so you',
    "don't have to edit anything inside SLOTH unless you want to.",
    '',
    '## Folders',
    '',
    '- content/       Your .md decks. Slides are separated by a line of `---`.',
    '                 SLOTH opens decks from here.',
    '- media/         Images, video, audio. Reference with `![](media/photo.png)`',
    '                 or just `![](photo.png)` (bare names resolve to media/).',
    '- attachments/   Files the audience can download during a talk.',
    '- snippets/      Small runnable code files you run from a slide.',
    '- repositories/  Full apps you launch on a shareable portal URL.',
    '- config/        Project settings: sloth.json, theme.json, controls.json.',
    '- data/          Survey responses, written here locally. Nothing ever leaves',
    '                 your browser.',
    '',
    '## Slide directives (HTML comments inside a deck)',
    '',
    '- Image           ![](media/photo.png)',
    '- Show a file     <!-- cat: snippets/demo.js -->   (renders its live contents)',
    '- Attachment      <!-- attach: attachments/notes.pdf Handout -->',
    '- Run a snippet   <!-- run-snippet: snippets/demo.js -->',
    '- Run with a cmd  <!-- run-snippet: snippets/app.py python app.py -->',
    '- Run a repo      <!-- run-repo: repositories/app npm start -->',
    '- Survey          a multi-line block (see below)',
    '',
    '## Surveys',
    '',
    'A survey renders as a form on the audience portal during Present. Each',
    'response is appended to data/responses-<id>.jsonl on your machine. Nothing',
    'is sent anywhere. Write a survey as:',
    '',
    '    <!-- survey',
    '    id: feedback',
    '    question: How was this talk?',
    '    options: Great | Good | Could be better',
    '    text: Any comments? (optional)',
    '    -->',
    '',
    'Fields: id (used for the data filename), question, options (| separated,',
    'shown as radio buttons), text (optional free-text box). Omit options for a',
    'text-only response.',
    '',
    '## Config (config/sloth.json)',
    '',
    'Optional defaults: { "theme": "dracula", "notes": true, "highlight": true }.',
    'theme can be any built-in or Gogh theme name.',
    ''
  ].join('\n')

  const INTRO = [
    '%title: My SLOTH deck',
    '%author: ',
    '',
    '# My deck',
    '',
    'Welcome. Replace this with your talk. New slides start after a line of ---',
    '',
    '---',
    '',
    '## An image',
    '',
    'Drop a file in media/ and reference it by name:',
    '',
    '![](media/example.png)',
    '',
    '---',
    '',
    '## Runnable code',
    '',
    'Put code in snippets/ and run it live while presenting (press r):',
    '',
    '<!-- run-snippet: snippets/hello.js -->',
    '',
    '---',
    '',
    '## Ask the audience',
    '',
    'During Present, this shows as a form on the audience URL. Answers are saved',
    'to data/ on your machine, nothing leaves your browser.',
    '',
    '<!-- survey',
    'id: feedback',
    'question: How was this talk?',
    'options: Great | Good | Could be better',
    'text: Any comments? (optional)',
    '-->',
    ''
  ].join('\n')

  const HELLO = "console.log('hello from a SLOTH snippet')\n"

  const CONFIG = JSON.stringify({ theme: 'default', notes: false, highlight: true }, null, 2) + '\n'

  // A short README in each folder explaining what goes there.
  const FOLDER_DOCS = {
    content: 'Your .md decks live here. Slides are separated by a line of ---.',
    media: 'Images, video, audio. Reference as ![](media/file.png) or ![](file.png).',
    attachments: 'Files the audience can download. Reference: <!-- attach: attachments/file.pdf -->',
    snippets: 'Runnable code files. Reference: <!-- run-snippet: snippets/file.js -->',
    repositories: 'Full apps to run on a portal. Reference: <!-- run-repo: repositories/app npm start -->',
    config: 'Project settings: sloth.json (theme/notes), theme.json, controls.json.',
    data: 'Survey responses are written here during Present. Nothing leaves your browser.'
  }

  const folders = ['content', 'media', 'attachments', 'snippets', 'repositories', 'config', 'data']
  const entries = []
  for (const f of folders) {
    entries.push({ name: 'sloth-project/' + f + '/README.md', data: '# ' + f + '/\n\n' + FOLDER_DOCS[f] + '\n' })
  }
  entries.push({ name: 'sloth-project/README.md', data: README })
  entries.push({ name: 'sloth-project/content/intro.md', data: INTRO })
  entries.push({ name: 'sloth-project/snippets/hello.js', data: HELLO })
  entries.push({ name: 'sloth-project/config/sloth.json', data: CONFIG })

  const blob = buildZip(entries)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'sloth-project.zip'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

if (fileInput) {
  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || [])
    fileInput.value = '' // allow re-selecting the same file later
    if (!files.length) return
    // First file is the one SLOTH will open; write all chosen files in.
    let first = null
    for (const file of files) {
      const safe = file.name.replace(/[^\w.\- ]/g, '_')
      const text = await file.text()
      await writeFile(pod, '/project/' + safe, text)
      if (!first) first = safe
    }
    // Tell SLOTH which deck to open.
    await writeFile(pod, UPLOAD_RESULT, first)
  })
}

// Portal handshake. When a runnable block starts a server inside the Pod,
// BrowserPod fires onPortal on the page with the shareable URL. We do two
// things: open the URL in a side panel (an iframe next to the terminal), and
// write it to a file SLOTH's run pane polls and displays.
const PORTAL_RESULT = '/project/.sloth-portal'
const portalPanel = document.querySelector('#portal')
const portalFrame = document.querySelector('#portal-frame')
const portalUrl = document.querySelector('#portal-url')
const portalClose = document.querySelector('#portal-close')
const penToggle = document.querySelector('#pen-toggle')

let currentPortalUrl = null

function openPortalPanel (url) {
  if (!portalPanel) return
  currentPortalUrl = url
  drawOn = false
  if (penToggle) penToggle.classList.remove('on')
  if (portalFrame) portalFrame.src = url
  if (portalUrl) { portalUrl.textContent = url; portalUrl.href = url }
  document.body.classList.add('split') // shrink the terminal to make room
}

function closePortalPanel () {
  document.body.classList.remove('split')
  if (portalFrame) portalFrame.src = 'about:blank'
  setDrawMode(false)
  currentPortalUrl = null
}

if (portalClose) portalClose.addEventListener('click', closePortalPanel)

pod.onPortal(({ url }) => {
  openPortalPanel(url)
  writeFile(pod, PORTAL_RESULT, url)
})

// ---- Desktop annotation: draw on the slide showing in the panel -----------
// The panel keeps showing the audience page (the slide). A transparent canvas
// sits over the iframe; in draw mode it captures the mouse and the host draws
// on it, while the slide stays visible underneath. Finished strokes POST to
// /draw (0..1 fractions), the same endpoint the audience page reads, so the
// drawing appears for everyone. The canvas bitmap is sized from its on-screen
// rect at draw-start and the mouse is mapped through that same rect, so where
// you draw is exactly where it lands.
const penTools = document.querySelector('#pen-tools')
const penClear = document.querySelector('#pen-clear')
const penCanvas = document.querySelector('#pen-canvas')
const penCtx = penCanvas ? penCanvas.getContext('2d') : null
let penColor = '#f33'
let drawOn = false
let penPts = []
let penDrawing = false

function penEndpoint (path) {
  if (!currentPortalUrl) return null
  return currentPortalUrl.replace(/\/+$/, '') + path
}

// Match the canvas bitmap to its real on-screen size. Called at draw-start so
// it reads the rect after the panel has its final layout, never a stale/zero
// size, which is what confined drawing to a corner before.
function sizePenCanvas () {
  if (!penCanvas) return
  const r = penCanvas.getBoundingClientRect()
  if (!r.width || !r.height) return
  const w = Math.round(r.width)
  const h = Math.round(r.height)
  if (penCanvas.width !== w || penCanvas.height !== h) {
    penCanvas.width = w
    penCanvas.height = h
  }
}

function setDrawMode (on) {
  drawOn = on
  document.body.classList.toggle('drawing', on) // iframe ignores the mouse
  if (penToggle) penToggle.classList.toggle('on', on)
  if (penTools) penTools.hidden = !on
  if (penCanvas) penCanvas.hidden = !on
  if (on) {
    sizePenCanvas()
  } else if (penCtx && penCanvas) {
    penCtx.clearRect(0, 0, penCanvas.width, penCanvas.height)
  }
}

if (penToggle) penToggle.addEventListener('click', () => setDrawMode(!drawOn))

document.querySelectorAll('.pen-sw').forEach((sw) => {
  sw.addEventListener('click', () => {
    document.querySelectorAll('.pen-sw').forEach((x) => x.classList.remove('sel'))
    sw.classList.add('sel')
    penColor = sw.getAttribute('data-col')
  })
})

if (penClear) {
  penClear.addEventListener('click', () => {
    const ep = penEndpoint('/clear')
    if (ep) fetch(ep, { method: 'POST' }).catch(() => {})
    if (penCtx && penCanvas) penCtx.clearRect(0, 0, penCanvas.width, penCanvas.height)
  })
}

if (penCanvas) {
  const penPos = (e) => {
    const r = penCanvas.getBoundingClientRect()
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]
  }
  penCanvas.addEventListener('mousedown', (e) => {
    sizePenCanvas()
    penDrawing = true
    penPts = [penPos(e)]
  })
  penCanvas.addEventListener('mousemove', (e) => {
    if (!penDrawing) return
    const p = penPos(e)
    penPts.push(p)
    penCtx.strokeStyle = penColor
    penCtx.lineWidth = Math.max(3, penCanvas.width * 0.004)
    penCtx.lineCap = 'round'
    penCtx.lineJoin = 'round'
    const n = penPts.length
    if (n > 1) {
      penCtx.beginPath()
      penCtx.moveTo(penPts[n - 2][0] * penCanvas.width, penPts[n - 2][1] * penCanvas.height)
      penCtx.lineTo(p[0] * penCanvas.width, p[1] * penCanvas.height)
      penCtx.stroke()
    }
  })
  const finishStroke = () => {
    if (!penDrawing) return
    penDrawing = false
    if (penPts.length > 1) {
      const ep = penEndpoint('/draw')
      if (ep) {
        fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ color: penColor, points: penPts })
        }).catch(() => {})
      }
    }
    penPts = []
  }
  penCanvas.addEventListener('mouseup', finishStroke)
  penCanvas.addEventListener('mouseleave', finishStroke)
  window.addEventListener('resize', () => { if (drawOn) sizePenCanvas() })
}

// Create the visible terminal.
const consoleEl = document.querySelector('#console')
const terminal = await pod.createDefaultTerminal(consoleEl)

// The terminal only receives keystrokes once its input element has focus. The
// browser doesn't give it focus on load, so the menu looked dead until you
// clicked the window. Focus xterm's input now, and again whenever the page is
// clicked anywhere outside the portal, so the arrow keys work immediately.
function focusTerminal () {
  const ta = consoleEl && consoleEl.querySelector('textarea')
  if (ta) ta.focus()
}
focusTerminal()
// Retry briefly in case the textarea isn't mounted the instant boot resolves.
const focusTries = [0, 60, 200, 500]
focusTries.forEach((d) => setTimeout(focusTerminal, d))
window.addEventListener('mousedown', (e) => {
  if (e.target && e.target.closest && e.target.closest('#portal')) return
  setTimeout(focusTerminal, 0)
})

// No install step: node_modules was written above, so SLOTH is ready to run.

// Run SLOTH as the only thing the user ever sees. It opens on its start menu.
// If it ever exits, relaunch it, so the user never falls through to a shell.
;(async () => {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await pod.run('node', ['sloth.js'], {
      echo: false,
      terminal,
      cwd: '/project'
    })
  }
})()
