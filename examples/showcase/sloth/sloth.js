#! /usr/bin/env node

// SLOTH - a Slow, Lovingly Over-featured Terminal-Hosted slide deck.
//
// This started life as the tiny `---`-split markdown presenter `tslide`. It now
// folds in the distinct strengths of six other terminal markdown tools:
//
//   mdp         %title/%author bars, ->centering<-, <br>/^ step reveal,
//               numeric jump, reload
//   presenterm  slide footer with page count, speaker notes, pauses, titles
//   glow        word-wrap to terminal width, styled quotes / lists / headings
//   mdfried     big ASCII headers for H1
//   frogmouth   file picker over the working tree, omnibox, back-history, TOC
//   ekphos      cross-deck [[wikilink]] jumps, full-text search, configurable
//               themes, ASCII link-graph, and a plain modeless editor
//
// The original presenter behaviour is preserved; everything else is additive.

require('colors')

var charm = require('charm')(process.stdout)
var PassThrough = require('stream').PassThrough
// Browser terminals (xterm.js into the Pod) can split an escape sequence like
// the arrow keys (ESC [ C) across separate stdin reads. The keypress library
// parses each raw chunk independently, so a lone trailing 'C'/'D' gets emitted
// as a capital letter and typed into the editor. We feed keypress through a
// PassThrough and coalesce partial escape sequences first (see input section).
var keyStream = new PassThrough()
var keypress = require('keypress')(keyStream)
var opts = require('optimist').default('images', true).argv
var fs = require('fs')
var path = require('path')
var cp = require('child_process')
var iq = require('insert-queue')
var js = require('hipster/highlight/javascript')
var imgcat = require('ansi-escapes').image
var emojis = require('node-emoji')

var bigHeaders = require('./lib/big-headers')
var themes = require('./lib/themes')
var graph = require('./lib/graph')
var Editor = require('./lib/editor')
var wrap = require('./lib/wrap')
var controls = require('./lib/controls')
var slideHtml = require('./lib/slide-html')
var project = require('./lib/project')
var qr = require('./lib/qr')

// ---------------------------------------------------------------------------
// CLI / entry
// ---------------------------------------------------------------------------

// A deck argument is optional. With no argument SLOTH opens on its start menu;
// with one it goes straight into presenting that deck.
var file = opts._[0]

// --help prints usage to the terminal and exits. Everything else launches the
// TUI (menu or deck), so the user never has to know any command-line flags.
if (opts.help) {
  console.error('USAGE: sloth [markdown-file]')
  console.error()
  console.error('  With no file, SLOTH opens its start menu.')
  console.error()
  console.error('  --theme NAME   Start with a colour theme (see theme.json)')
  console.error('  --notes        Show speaker notes pane')
  console.error('  --no-highlight Disable code syntax highlighting')
  console.error('  --no-images    Disable inline images')
  process.exit(0)
}

// Project config: a readable config/sloth.json at the project root can set
// defaults (theme, notes, highlight, and paths to theme/controls files). CLI
// options still win over it.
function loadProjectConfig (deckFile) {
  if (!deckFile) return {}
  var root = project.rootFor(deckFile)
  var candidates = [
    path.join(root, 'config', 'sloth.json'),
    path.join(root, 'config', 'config.json'),
    path.join(root, 'sloth.config.json')
  ]
  for (var i = 0; i < candidates.length; i++) {
    try { return JSON.parse(fs.readFileSync(candidates[i], 'utf-8')) } catch (e) {}
  }
  return {}
}

var projectConfig = loadProjectConfig(file ? path.resolve(file) : null)

var highlight = opts.highlight !== false && projectConfig.highlight !== false
var showNotes = !!opts.notes || !!projectConfig.notes

// Load theme.json / controls.json. Prefer the project's config/ folder, then
// next to the deck. Project config can also name a starting theme.
var projRoot = file ? project.rootFor(path.resolve(file)) : path.resolve('.')
themes.load(fileExistsSafe(path.join(projRoot, 'config', 'theme.json'))
  ? path.join(projRoot, 'config', 'theme.json')
  : (file ? path.resolve(file) : path.resolve('theme.json')))
var theme = themes.get(opts.theme || projectConfig.theme || 'default')

controls.load(fileExistsSafe(path.join(projRoot, 'config', 'controls.json'))
  ? path.join(projRoot, 'config', 'controls.json')
  : (file ? path.resolve(file) : path.resolve('controls.json')))

function fileExistsSafe (p) { try { fs.statSync(p); return true } catch (e) { return false } }

// C paints text in a theme role's colour (named or #hex), via truecolor ANSI.
// opts: { bold, inverse, italic, underline }. This replaces the old
// str[theme.role] indexing so roles can hold arbitrary hex values.
function C (str, role, styleOpts) {
  return themes.paint(str, theme[role], styleOpts)
}

// The home-screen ASCII art (sloth), loaded once. Null if the file is absent,
// in which case the menu falls back to the big SLOTH wordmark.
var slothArt = null
try {
  var raw = fs.readFileSync(path.resolve('sloth-art.txt'), 'utf-8')
  slothArt = raw.replace(/\n+$/,'').split('\n')
} catch (e) { slothArt = null }

// Downscale ASCII art to fit `maxW` columns and `maxH` rows by sampling every
// Nth column and row. Keeps the aspect roughly right by using the same factor.
function scaleArt (artLines, maxW, maxH) {
  if (!artLines || !artLines.length) return []
  var srcH = artLines.length
  var srcW = artLines.reduce(function (m, l) { return Math.max(m, l.length) }, 0)
  var factor = Math.max(1, Math.ceil(Math.max(srcW / maxW, srcH / maxH)))
  if (factor === 1) return artLines.slice()
  var out = []
  for (var y = 0; y < srcH; y += factor) {
    var line = artLines[y]
    var row = ''
    for (var x = 0; x < srcW; x += factor) {
      row += (line[x] && line[x] !== ' ') ? line[x] : ' '
    }
    out.push(row.replace(/\s+$/,''))
  }
  return out
}

var mleft = 5
var mtop = 2

// ---------------------------------------------------------------------------
// Deck model. A deck is the parsed form of one markdown file: its metadata,
// the slides, and per-slide structure (title, body lines, reveal steps,
// speaker notes, outgoing wikilinks).
// ---------------------------------------------------------------------------

function parseDeck (filename) {
  var raw = fs.readFileSync(filename, 'utf-8')

  // mdp-style %meta: lines at the very top (also accept presenterm's
  // `key: value` frontmatter-ish header before the first slide).
  var meta = { title: path.basename(filename), author: '', date: '' }
  var lines = raw.split('\n')
  while (lines.length) {
    var m = /^%(\w+):\s*(.*)$/.exec(lines[0])
    if (!m) break
    meta[m[1].toLowerCase()] = m[2]
    lines.shift()
  }
  var body = lines.join('\n')

  // Slides are separated by a horizontal rule line (--- or more).
  var chunks = body.split(/^[-*=]{3,}\s*$/m)
  if (chunks.length <= 1) {
    // Single-slide files are still valid; treat the whole thing as one slide.
    chunks = [body]
  }

  var slides = chunks.map(function (chunk, i) {
    return parseSlide(chunk, i)
  })

  return {
    file: filename,
    meta: meta,
    slides: slides,
    raw: raw
  }
}

// Pull a slide apart: speaker notes, reveal steps, title, wikilinks, and the
// runnable / cat directives.
function parseSlide (chunk, idx) {
  var notes = []
  // presenterm speaker notes: <!-- speaker_note: ... -->
  chunk = chunk.replace(/<!--\s*speaker_note:\s*([\s\S]*?)-->/g, function (_, n) {
    notes.push(n.trim())
    return ''
  })

  // Runnable blocks: a <!-- run: <cmd> [as: <file>] --> directive immediately
  // before a fenced code block. The block's code is written to <file> (if
  // given) in the deck dir, then <cmd> is run there. Without `as:`, nothing is
  // written and the command runs as-is. The directive line stays visible so the
  // audience sees how it is invoked; the code block renders normally.
  var runs = []
  var runRe = /<!--\s*run:\s*([^\n]*?)\s*-->\s*\n```[^\n]*\n([\s\S]*?)\n```/g
  var rm
  while ((rm = runRe.exec(chunk))) {
    var spec = rm[1]
    var asMatch = /\bas:\s*(\S+)/.exec(spec)
    var cmd = spec.replace(/\bas:\s*\S+/, '').trim()
    runs.push({ cmd: cmd, file: asMatch ? asMatch[1] : null, code: rm[2] })
  }

  // run-snippet: <!-- run-snippet: snippets/x.js [cmd] --> runs an existing
  // snippet file (default command: node <file>). Folds into the same `runs`
  // list the run pane uses, with no `as:` write since the file already exists.
  var snipRe = /<!--\s*run-snippet:\s*(\S+)\s*([^\n]*?)\s*-->/g
  var sm
  while ((sm = snipRe.exec(chunk))) {
    var snipFile = sm[1]
    var snipCmd = (sm[2] && sm[2].trim()) || ('node ' + snipFile)
    runs.push({ cmd: snipCmd, file: null, code: null, snippet: snipFile })
  }

  // run-repo: <!-- run-repo: repositories/app [cmd] --> runs a full app in its
  // own directory (default: npm start). Marked as a repo run so the run pane
  // uses the repo dir as cwd and expects a portal.
  var repos = []
  var repoRe = /<!--\s*run-repo:\s*(\S+)\s*([^\n]*?)\s*-->/g
  var pm
  while ((pm = repoRe.exec(chunk))) {
    repos.push({ dir: pm[1], cmd: (pm[2] && pm[2].trim()) || 'npm start' })
  }

  // attach: <!-- attach: attachments/x.pdf [label] --> marks a downloadable.
  var attachments = []
  var atRe = /<!--\s*attach:\s*(\S+)\s*([^\n]*?)\s*-->/g
  var am
  while ((am = atRe.exec(chunk))) {
    attachments.push({ file: am[1], label: (am[2] && am[2].trim()) || am[1] })
  }

  // survey blocks. A multi-line directive becomes a form on the audience portal;
  // responses are written to data/ on the Pod (nothing leaves the browser). Each
  // question is one line, typed by its prefix:
  //   <!-- survey id: feedback
  //   single: How was this talk? | Great | Good | Could be better
  //   multi: Which parts landed? | Intro | Demo | Q&A
  //   rating: Rate the pacing
  //   text: Any other comments?
  //   -->
  // Types: single (radio), multi (checkbox), rating (1-5), text (free text).
  var surveys = []
  var surveyRe = /<!--\s*survey\b([^\n]*)([\s\S]*?)-->/g
  var sv
  while ((sv = surveyRe.exec(chunk))) {
    var idm = /\bid\s*:\s*(\S+)/.exec(sv[1])
    var id = (idm ? idm[1] : 'survey').replace(/[^\w.-]/g, '_')
    var questions = []
    sv[2].split('\n').forEach(function (l) {
      var qm = /^\s*(single|multi|rating|text)\s*:\s*(.+)$/i.exec(l)
      if (!qm) return
      var type = qm[1].toLowerCase()
      var rest = qm[2].split('|').map(function (s) { return s.trim() }).filter(function (s, i) { return i === 0 || s })
      var q = { type: type, q: rest[0] }
      if (type === 'single' || type === 'multi') q.options = rest.slice(1)
      questions.push(q)
    })
    if (questions.length) surveys.push({ id: id, questions: questions })
  }

  // cat directives: <!-- cat: <file> --> renders that file's live contents
  // (read at present time) inline where the directive sits.
  var cats = []
  var catRe = /<!--\s*cat:\s*(\S+)\s*-->/g
  var cm2
  while ((cm2 = catRe.exec(chunk))) cats.push(cm2[1])

  var lines = chunk.replace(/^\n+|\n+$/g, '').split('\n')

  // The slide title is the first heading, else the first non-empty line.
  var title = ''
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i].trim()
    if (!t) continue
    title = t.replace(/^#+\s*/, '').replace(/^->\s*|\s*<-$/g, '').replace(/[#*_`]/g, '')
    break
  }

  // Reveal steps: a line that is just <br> or contains a lone ^ marks a
  // pause point. Everything up to step k is shown when revealCount === k.
  var steps = [[]]
  lines.forEach(function (l) {
    if (/^\s*<br>\s*$/i.test(l) || /^\s*\^\s*$/.test(l)) {
      steps.push([])
    } else {
      steps[steps.length - 1].push(l)
    }
  })

  // Outgoing [[wikilinks]] for graph + navigation.
  var links = []
  var lk = /\[\[([^\]]+)\]\]/g
  var mm
  while ((mm = lk.exec(chunk))) links.push(mm[1].trim())

  return {
    index: idx,
    title: title,
    lines: lines,
    steps: steps,
    notes: notes,
    links: links,
    runs: runs,
    repos: repos,
    attachments: attachments,
    surveys: surveys,
    cats: cats
  }
}

// ---------------------------------------------------------------------------
// Inline + block markdown styling (glow's "pizzazz", applied with `colors`).
// Operates on a single already-wrapped text line.
// ---------------------------------------------------------------------------

function styleInline (l) {
  // wikilinks -> bracketed, themed
  l = l.replace(/\[\[([^\]]+)\]\]/g, function (_, t) {
    return C('⟦' + t + '⟧', 'link')
  })
  // links [text](url) -> text themed
  l = l.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, t) {
    return C(t, 'link') + (' (' + arguments[2] + ')').grey
  })
  // bold **x** and mdp *x*
  l = l.replace(/\*\*([^*]+)\*\*/g, function (_, t) { return t.bold })
  l = l.replace(/(^|[^*])\*([^*]+)\*/g, function (_, p, t) { return p + C(t, 'accent') })
  // underline _x_
  l = l.replace(/(^|[^_])_([^_]+)_/g, function (_, p, t) { return p + t.underline })
  // inline code `x`
  l = l.replace(/`([^`]+)`/g, function (_, t) { return C(' ' + t + ' ', 'code') })
  return l
}

function styleBlockLine (l, inCode) {
  if (inCode) return l // code styled separately
  var t = l.trim()
  if (/^>+/.test(t)) {
    // glow-style blockquote with a coloured bar
    var depth = (t.match(/^>+/) || ['>'])[0].length
    var text = t.replace(/^>+\s?/, '')
    return C('│ '.repeat(depth), 'quote') + styleInline(text).italic
  }
  if (/^\s*[-*+]\s+/.test(l)) {
    return l.replace(/^(\s*)[-*+]\s+/, function (_, sp) {
      return sp + C('• ', 'accent')
    }).replace(/(• )(.*)/, function (_, b, rest) { return b + styleInline(rest) })
  }
  if (/^\s*\d+\.\s+/.test(l)) {
    return l.replace(/^(\s*)(\d+)\.\s+/, function (_, sp, n) {
      return sp + C(n + '. ', 'accent')
    })
  }
  return styleInline(l)
}

// ---------------------------------------------------------------------------
// Rendering a slide to a string. Handles centering, big H1, code highlight,
// images, emoji, word-wrap, and the reveal-step slice.
// ---------------------------------------------------------------------------

function termCols () { return process.stdout.columns || 80 }
function termRows () { return process.stdout.rows || 24 }

function renderSlide (deck, slide, revealCount) {
  var width = termCols() - mleft - 2

  // Flatten the visible reveal steps.
  var visible = []
  for (var s = 0; s <= revealCount && s < slide.steps.length; s++) {
    visible = visible.concat(slide.steps[s])
  }
  var src = visible.join('\n')

  // Expand <!-- cat: file --> into the file's live contents, resolved against
  // the project convention, so a slide always shows the current file.
  src = src.replace(/<!--\s*cat:\s*(\S+)\s*-->/g, function (_, f) {
    var full = resolveRef(f, 'snippets')
    var contents
    try { contents = fs.readFileSync(full, 'utf-8').replace(/\n+$/, '') } catch (e) { contents = '(cannot read ' + f + ')' }
    return '```\n' + contents + '\n```'
  })

  // Turn run / run-snippet / run-repo / attach directives into visible hints.
  src = src.replace(/<!--\s*run-snippet:\s*(\S+)\s*([^\n]*?)\s*-->/g, function (_, f) {
    return ' RUNNABLE  ' + f + '   (press r to run)'
  })
  src = src.replace(/<!--\s*run-repo:\s*(\S+)\s*([^\n]*?)\s*-->/g, function (_, d) {
    return ' APP  ' + d + '   (press r to launch on a portal)'
  })
  src = src.replace(/<!--\s*attach:\s*(\S+)\s*([^\n]*?)\s*-->/g, function (_, f, label) {
    return ' DOWNLOAD  ' + ((label && label.trim()) || f) + '   (on the audience portal)'
  })
  src = src.replace(/<!--\s*survey\b([\s\S]*?)-->/g, function (_, body) {
    var first = /^\s*(?:single|multi|rating|text)\s*:\s*([^|\n]+)/im.exec(body)
    return ' SURVEY  ' + (first ? first[1].trim() : '(audience form)') + '   (answers saved to data/ as CSV)'
  })
  src = src.replace(/<!--\s*run:\s*([^\n]*?)\s*-->/g, function (_, spec) {
    var cmd = spec.replace(/\bas:\s*\S+/, '').trim()
    return ' RUNNABLE  ' + cmd + '   (press r to run)'
  })

  src = inlineImages(deck.file, src)
  src = emojis.emojify(src)

  var out = []
  var inCode = false

  src.split('\n').forEach(function (line) {
    // centering: -> text <-
    var center = false
    var cm = /^->\s?(.*?)\s?<-\s*$/.exec(line)
    if (cm) { line = cm[1]; center = true }

    // fenced code toggling
    if (/^```/.test(line)) {
      inCode = !inCode
      if (highlight) return // swallow the fence line itself
    }

    // H1 -> big ASCII header (mdfried), unless inside code
    if (!inCode && /^#\s+/.test(line)) {
      var h1 = line.replace(/^#\s+/, '')
      bigHeaders.render(h1, theme).forEach(function (bl) {
        out.push(center ? centerLine(bl, width) : bl)
      })
      return
    }
    // H2+ -> bold themed
    if (!inCode && /^#{2,}\s+/.test(line)) {
      var ht = line.replace(/^#{2,}\s+/, '')
      var styledH = C(styleInline(ht), 'heading', { bold: true })
      pushWrapped(out, styledH, width, center)
      return
    }

    if (inCode) {
      var code = line
      if (highlight) {
        var q = iq(code)
        js.highlight(q)
        code = q.apply()
      }
      out.push(C('  ' + code, 'code'))
      return
    }

    var styled = styleBlockLine(line, false)
    pushWrapped(out, styled, width, center)
  })

  return out
}

function pushWrapped (out, styled, width, center) {
  // word-wrap honouring ANSI codes (glow's -w behaviour)
  wrap(styled, width).forEach(function (w) {
    out.push(center ? centerLine(w, width) : w)
  })
}

function centerLine (line, width) {
  var visibleLen = stripAnsi(line).length
  var pad = Math.max(0, Math.floor((width - visibleLen) / 2))
  return ' '.repeat(pad) + line
}

function stripAnsi (s) {
  return s.replace(/\[[0-9;]*m/g, '')
}

function inlineImages (deckFile, content) {
  var pattern = /^!\[.*?\]\((.*)\)/mg
  var notIterm = !/^iterm/i.test(process.env.TERM_PROGRAM)
  if (notIterm) return content
  var match
  while ((match = pattern.exec(content))) {
    try {
      // resolve against the project convention: bare names look in media/
      var url = resolveRef(match[1], 'media')
      content = content.replace(match[0], imgcat(fs.readFileSync(url)))
    } catch (e) { /* missing file or unsupported terminal */ }
  }
  return content
}

// ---------------------------------------------------------------------------
// Screen drawing: status bars (mdp) + footer page count (presenterm) + body.
// ---------------------------------------------------------------------------

// Compose the whole screen into a single buffer and paint it in one write,
// without ever clearing. Clearing (charm.reset) blanks the screen between
// frames, which a browser terminal shows as a strobe on every keystroke.
// Instead every row is padded to full width so new content overwrites old in
// place, and the paint is wrapped in the synchronized-update sequence
// (CSI ?2026h/l) so xterm.js presents the frame atomically.
var SYNC_BEGIN = '\x1b[?2026h'
var SYNC_END = '\x1b[?2026l'

// opts: { indent: columns to indent the body (default mleft), top: first body
// row index (default mtop) }. Pass indent 0 for pre-centered content (the menu).
function drawFrame (titleBar, bodyLines, footer, opts) {
  opts = opts || {}
  var indent = opts.indent == null ? mleft : opts.indent
  var cols = termCols()
  var rows = termRows()

  // Build an array of `rows` screen lines, every one padded to `cols`.
  var screen = new Array(rows)

  // top bar (row 1) and the blank gap rows above the body
  screen[0] = C(padBar(titleBar, cols), 'bar')

  var top = opts.top == null ? mtop : opts.top // body starts at this row index
  for (var r = 1; r < rows - 1; r++) {
    var bodyIdx = r - top
    if (bodyIdx >= 0 && bodyIdx < bodyLines.length) {
      // indent the body, pad the visible width to cols so the rest of the row
      // overwrites any leftover characters from the last frame
      var line = ' '.repeat(indent) + bodyLines[bodyIdx]
      screen[r] = padBar(line, cols)
    } else {
      screen[r] = ' '.repeat(cols)
    }
  }

  // bottom bar (last row)
  screen[rows - 1] = C(padBar(footer, cols), 'bar')

  // Emit one positioned write per row inside a synchronized update. Each row
  // ends with an SGR reset so a line's colour never bleeds into its trailing
  // pad or the row below.
  var outBuf = SYNC_BEGIN
  for (var i = 0; i < rows; i++) {
    outBuf += '\x1b[' + (i + 1) + ';1H' + screen[i] + '\x1b[0m'
  }
  outBuf += SYNC_END
  process.stdout.write(outBuf)
}

function padBar (text, cols) {
  var v = stripAnsi(text)
  if (v.length >= cols) return text.slice(0, cols)
  return text + ' '.repeat(cols - v.length)
}

// ---------------------------------------------------------------------------
// Application state machine. Modes: present, toc, search, graph, browse, edit.
// ---------------------------------------------------------------------------

// `deck` is null until a deck is opened (from the menu or the CLI argument).
var deck = file ? parseDeck(path.resolve(file)) : null
var slideIndex = 0
var revealCount = 0
var history = [] // back-stack of {file, slideIndex}
var mode = file ? 'present' : 'menu'
var overlay = null // mode-specific transient state

// Where the menu's Open/Edit browser should look. Without a deck open, use the
// working directory; once a deck is open, its directory.
function decksRoot () {
  return deck ? path.dirname(deck.file) : path.resolve('.')
}

// The active project root (the nearest ancestor of the deck holding the
// convention folders). Falls back to the working dir when no deck is open.
function projectRoot () {
  return deck ? project.rootFor(deck.file) : path.resolve('.')
}

// Resolve a deck reference (image, attachment, snippet, repo) to an absolute
// path against the project convention, looking in `defaultFolder` for bare
// names.
function resolveRef (ref, defaultFolder) {
  return project.resolve(projectRoot(), path.dirname(deck.file), ref, defaultFolder)
}

function curSlide () { return deck.slides[slideIndex] }

function loadDeck (filename, pushHistory) {
  filename = path.resolve(filename)
  if (pushHistory && deck) history.push({ file: deck.file, slideIndex: slideIndex })
  deck = parseDeck(filename)
  slideIndex = 0
  revealCount = 0
}

function clampSlide () {
  if (slideIndex < 0) slideIndex = 0
  if (slideIndex >= deck.slides.length) slideIndex = deck.slides.length - 1
}

// ---- present mode ---------------------------------------------------------

function drawPresent () {
  clampSlide()
  var slide = curSlide()
  var body = renderSlide(deck, slide, revealCount)

  if (showNotes && slide.notes.length) {
    body.push('')
    body.push(C('  speaker notes:', 'dim'))
    slide.notes.forEach(function (n) {
      wrap(n, termCols() - mleft - 4).forEach(function (w) {
        body.push(C('  > ' + w, 'dim'))
      })
    })
  }

  var totalSteps = slide.steps.length
  var stepInfo = totalSteps > 1 ? ('  [' + (revealCount + 1) + '/' + totalSteps + ']') : ''
  var titleBar = ' ' + deck.meta.title + (deck.meta.author ? '  -  ' + deck.meta.author : '')

  var footer
  if (jumpBuf != null) {
    footer = ' jump to slide: ' + jumpBuf + '_   (enter, or 3 digits, to go   esc to cancel)'
  } else {
    var k = function (a) { return keyFor(a) }
    footer = ' ' + path.basename(deck.file) +
      '   slide ' + (slideIndex + 1) + '/' + deck.slides.length + stepInfo +
      (slideHasRun(slide) ? '   [' + k('run') + ']un' : '') +
      '   [' + k('toc') + ']oc [' + k('search') + ']find [' + k('edit') + ']dit' +
      ' [' + k('jump') + ']jump'
  }
  drawFrame(titleBar, body, footer)
}

function nextStepOrSlide () {
  var slide = curSlide()
  if (revealCount < slide.steps.length - 1) {
    revealCount++
  } else if (slideIndex < deck.slides.length - 1) {
    slideIndex++
    revealCount = 0
  }
}

function prevStepOrSlide () {
  if (revealCount > 0) {
    revealCount--
  } else if (slideIndex > 0) {
    slideIndex--
    revealCount = deck.slides[slideIndex].steps.length - 1
  }
}

// ---- run pane -------------------------------------------------------------
// Runs a slide's <!-- run --> block. sloth.js itself runs inside the Pod, so it
// can spawn the command directly. Output streams into a scrollback buffer. If
// the command opens a port, the page's onPortal handler writes the URL to the
// handshake file below, which we poll and display.
var PORTAL_RESULT = path.resolve('.sloth-portal')
var runProc = null
var portalTimer = null
var runBack = 'present' // mode to return to when leaving the run pane

// Does this slide have anything runnable (a code block, snippet, or repo)?
function slideHasRun (slide) {
  return (slide.runs && slide.runs.length) || (slide.repos && slide.repos.length)
}

// Build the spec to run for a slide: prefer a code/snippet block, else a repo
// (run in its own resolved directory, expecting a portal).
function slideRunSpec (slide) {
  if (slide.runs && slide.runs.length) return slide.runs[0]
  if (slide.repos && slide.repos.length) {
    var r = slide.repos[0]
    return { cmd: r.cmd, cwd: resolveRef(r.dir, 'repositories') }
  }
  return null
}

// Run a slide's first runnable block, or an explicit spec (used for repos).
// A spec is { cmd, file?, code?, cwd? }. Commands run from the project root by
// default so paths like snippets/x.js and media/ resolve consistently.
function runSlide (explicitSpec) {
  var slide = curSlide()
  var spec = explicitSpec || slideRunSpec(slide)
  if (!spec) return

  runBack = (mode === 'presenter') ? 'presenter' : 'present'
  mode = 'run'
  overlay = { out: [], scroll: 0, cmd: spec.cmd, portal: null, done: false, code: null }

  var root = projectRoot()
  var cwd = spec.cwd || root

  // write the block to its file (if `as:` given), at the project root
  if (spec.file && spec.code != null) {
    try { fs.writeFileSync(path.join(root, spec.file), spec.code + '\n') } catch (e) {
      overlay.out.push('could not write ' + spec.file + ': ' + e.message)
    }
  }

  // clear any stale portal handshake before starting
  try { fs.unlinkSync(PORTAL_RESULT) } catch (e) {}

  pushRun(C('$ ' + spec.cmd + '   (in ' + (path.relative(root, cwd) || '.') + '/)', 'accent'))
  var parts = spec.cmd.split(/\s+/)
  try {
    runProc = cp.spawn(parts[0], parts.slice(1), {
      cwd: cwd,
      env: process.env
    })
  } catch (e) {
    pushRun('failed to start: ' + e.message)
    overlay.done = true
    draw()
    return
  }
  runProc.stdout.on('data', function (b) { onRunData(b) })
  runProc.stderr.on('data', function (b) { onRunData(b) })
  runProc.on('close', function (code) {
    overlay.done = true
    overlay.code = code
    pushRun(C('— process exited (' + code + ') —', 'dim'))
    draw()
  })

  pollPortal()
  draw()
}

function onRunData (buf) {
  var text = buf.toString('utf-8').replace(/\r/g, '')
  text.split('\n').forEach(function (l, i, arr) {
    // avoid a trailing empty line from the final newline
    if (i === arr.length - 1 && l === '') return
    pushRun(l)
  })
  // auto-scroll to the bottom as new output arrives
  overlay.scroll = Math.max(0, overlay.out.length - runViewportRows())
  draw()
}

function pushRun (line) {
  if (mode !== 'run' && !overlay) return
  overlay.out.push(line)
  if (overlay.out.length > 5000) overlay.out.shift() // cap scrollback
}

function runViewportRows () { return termRows() - 4 }

function pollPortal () {
  if (portalTimer) clearTimeout(portalTimer)
  portalTimer = setTimeout(function () {
    if (mode !== 'run') return
    var url = null
    try { url = fs.readFileSync(PORTAL_RESULT, 'utf-8').trim() } catch (e) {}
    if (url && url !== overlay.portal) {
      overlay.portal = url
      pushRun(C('portal: ' + url, 'link'))
      draw()
    }
    pollPortal()
  }, 400)
}


function drawRun () {
  var rows = runViewportRows()
  var start = Math.min(overlay.scroll, Math.max(0, overlay.out.length - rows))
  var body = ['']
  for (var i = start; i < start + rows && i < overlay.out.length; i++) {
    body.push('  ' + overlay.out[i])
  }
  var titleBar = ' RUN  ' + overlay.cmd + (overlay.done ? '  (exited ' + overlay.code + ')' : '  (running…)')
  var footer = (overlay.portal ? ' portal: ' + overlay.portal + '   →   ' : ' ') +
    '←/→ continue deck    j/k scroll    esc stop'
  drawFrame(titleBar, body, footer)
}

// Move the deck one step when leaving the run pane, in whichever mode launched
// it. From the presenter view, use presenterAdvance so the audience follows.
function runContinue (delta) {
  if (runBack === 'presenter') { presenterAdvance(delta) } else {
    if (delta > 0) nextStepOrSlide(); else prevStepOrSlide()
  }
  mode = runBack
}

function runKeys (ch, key) {
  // Left / right leave the run pane and continue the deck. A finished process
  // is cleaned up; a still-running server is left alive so its portal stays up
  // while you present. Esc/q also leaves but kills a running process.
  if (key.name === 'left' || name(key) === 'pageup') { leaveRun(false); runContinue(-1) }
  else if (key.name === 'right' || name(key) === 'pagedown' || key.name === 'space') { leaveRun(false); runContinue(1) }
  else if (key.name === 'escape' || ch === 'q') { leaveRun(true); mode = runBack }
  else if (key.name === 'j' || key.name === 'down') overlay.scroll = Math.min(overlay.scroll + 1, Math.max(0, overlay.out.length - runViewportRows()))
  else if (key.name === 'k' || key.name === 'up') overlay.scroll = Math.max(overlay.scroll - 1, 0)
  else if (ch === 'g') overlay.scroll = 0
  else if (ch === 'G') overlay.scroll = Math.max(0, overlay.out.length - runViewportRows())
  draw()
}

function name (key) { return key && key.name }

// Stop polling for the portal. If `kill` is true, also terminate a running
// process; otherwise a live server keeps running (its portal stays open).
function leaveRun (kill) {
  if (portalTimer) { clearTimeout(portalTimer); portalTimer = null }
  if (kill && runProc && !overlay.done) {
    try { runProc.kill() } catch (e) {}
    runProc = null
  }
}

// ---- Present mode (audience on a portal) ----------------------------------
// SLOTH serves an audience page from inside the Pod and drives it from a
// presenter view in the terminal. The presenter advances slides; the audience
// page follows over SSE. The presenter can switch the audience render style
// between clean HTML and a terminal look.

var presentProc = null
var presentRev = 0
var presentStyle = 'clean' // 'clean' | 'terminal'

function escHtml (s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Convert one ANSI-styled line to HTML for the "terminal look" audience render.
// Handles the SGR codes paint() and colors emit: 1 bold, 3 italic, 4 underline,
// 7 inverse, 30-37/90 named fg, 38;2;r;g;b truecolor, 0/39/22/23/24/27 resets.
function ansiLineToHtml (line) {
  var out = ''
  var open = false
  var i = 0
  var styles = {}
  function styleStr () {
    var s = ''
    if (styles.color) s += 'color:' + styles.color + ';'
    if (styles.bold) s += 'font-weight:bold;'
    if (styles.italic) s += 'font-style:italic;'
    if (styles.underline) s += 'text-decoration:underline;'
    if (styles.inverse) s += 'filter:invert(1);'
    return s
  }
  var NAMED = { 30: '#000', 31: '#c33', 32: '#3a3', 33: '#cc3', 34: '#36c', 35: '#c3c', 36: '#3cc', 37: '#ddd', 90: '#888' }
  function reopen () {
    if (open) out += '</span>'
    var s = styleStr()
    if (s) { out += '<span style="' + s + '">'; open = true } else { open = false }
  }
  while (i < line.length) {
    if (line[i] === '\x1b' && line[i + 1] === '[') {
      var j = line.indexOf('m', i)
      if (j === -1) break
      var codes = line.slice(i + 2, j).split(';').map(Number)
      for (var c = 0; c < codes.length; c++) {
        var code = codes[c]
        if (code === 0) styles = {}
        else if (code === 1) styles.bold = true
        else if (code === 3) styles.italic = true
        else if (code === 4) styles.underline = true
        else if (code === 7) styles.inverse = true
        else if (code === 22) styles.bold = false
        else if (code === 23) styles.italic = false
        else if (code === 24) styles.underline = false
        else if (code === 27) styles.inverse = false
        else if (code === 39) styles.color = null
        else if (NAMED[code]) styles.color = NAMED[code]
        else if (code === 38 && codes[c + 1] === 2) {
          styles.color = 'rgb(' + codes[c + 2] + ',' + codes[c + 3] + ',' + codes[c + 4] + ')'
          c += 4
        }
      }
      reopen()
      i = j + 1
    } else {
      out += escHtml(line[i])
      i++
    }
  }
  if (open) out += '</span>'
  return out
}

// Build the audience survey form(s) for a slide. The form POSTs to /survey on
// the present server, which appends responses to data/ as CSV. Each question
// renders by type; field names are q0, q1, ... so responses map back to columns.
function surveyFormHtml (slide) {
  if (!slide.surveys || !slide.surveys.length) return ''
  function esc (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
  return slide.surveys.map(function (s) {
    var qHtml = s.questions.map(function (q, qi) {
      var nm = 'q' + qi
      var head = '<div class="q">' + esc(q.q) + '</div>'
      var field = ''
      if (q.type === 'single') {
        field = (q.options || []).map(function (o) {
          return '<label><input type="radio" name="' + nm + '" value="' + esc(o) + '"> ' + esc(o) + '</label>'
        }).join('')
      } else if (q.type === 'multi') {
        field = (q.options || []).map(function (o) {
          return '<label><input type="checkbox" name="' + nm + '" value="' + esc(o) + '"> ' + esc(o) + '</label>'
        }).join('')
      } else if (q.type === 'rating') {
        var r = ''
        for (var n = 1; n <= 5; n++) r += '<label class="rate"><input type="radio" name="' + nm + '" value="' + n + '"> ' + n + '</label>'
        field = '<div class="rating">' + r + '</div>'
      } else { // text
        field = '<textarea name="' + nm + '" rows="3" placeholder="your answer"></textarea>'
      }
      return '<div class="sq">' + head + field + '</div>'
    }).join('')
    // carry the question texts so the server can write a CSV header
    var cols = JSON.stringify(s.questions.map(function (q) { return q.q }))
    return '<form class="survey" data-id="' + esc(s.id) + '" data-cols="' + esc(cols) + '">' +
      qHtml + '<button type="submit">Submit</button></form>'
  }).join('')
}

function writePresentSlides () {
  var clean = []
  var terminal = []
  deck.slides.forEach(function (slide, i) {
    // clean: markdown -> HTML (full slide, all reveal steps shown)
    var allLines = []
    slide.steps.forEach(function (st) { allLines = allLines.concat(st) })
    var r = slideHtml(allLines)
    var form = surveyFormHtml(slide)
    clean.push((r.centered ? '<div class="center">' : '<div>') + r.html + form + '</div>')
    // terminal: SLOTH's own ANSI render, converted to HTML, plus the same form
    var ansi = renderSlide(deck, slide, slide.steps.length - 1)
    terminal.push(ansi.map(ansiLineToHtml).join('\n') + form)
  })
  writeJsonFile('present-slides.json', { clean: clean, terminal: terminal })
}

function writePresentState () {
  presentRev++
  lastPresentRev = presentRev // remember our own write so the poll ignores it
  // Preserve the clicker action counters the server maintains, so rewriting the
  // state (e.g. after a style toggle) doesn't reset them and re-fire actions.
  writeJsonFile('present-state.json', {
    index: slideIndex, style: presentStyle, rev: presentRev, total: deck.slides.length,
    runReq: lastRunReq, styleReq: lastStyleReq
  })
}

// Poll the state file while presenting so a phone-clicker tap (which the server
// writes into present-state.json) moves the presenter view too. The clicker
// bumps rev to a value we didn't write, so we detect that and adopt its index.
var lastPresentRev = 0
var lastStyleReq = 0
var lastRunReq = 0
var presentPollTimer = null
function startPresentPoll () {
  if (presentPollTimer) clearTimeout(presentPollTimer)
  presentPollTimer = setTimeout(function () {
    if (mode !== 'presenter' && mode !== 'present') { presentPollTimer = null; return }
    var st = null
    try { st = JSON.parse(fs.readFileSync(path.join(path.dirname(deck.file), 'present-state.json'), 'utf-8')) } catch (e) {}
    if (st && st.rev > lastPresentRev && st.index !== slideIndex) {
      lastPresentRev = st.rev
      slideIndex = st.index
      revealCount = 0
      clampSlide()
      draw()
    } else if (st && st.rev > lastPresentRev) {
      lastPresentRev = st.rev
    }
    // Clicker action buttons. The server records each as a counter in the state
    // file; perform it when the counter increases past what we've already seen.
    if (st) {
      if (st.styleReq != null && st.styleReq > lastStyleReq) {
        lastStyleReq = st.styleReq
        presentStyle = presentStyle === 'clean' ? 'terminal' : 'clean'
        writePresentState()
        draw()
      }
      if (st.runReq != null && st.runReq > lastRunReq) {
        lastRunReq = st.runReq
        if (slideHasRun(curSlide())) { runSlide(); draw() }
      }
    }
    // redraw once when the clicker URL first becomes available, so its QR shows
    if (mode === 'presenter' && clickerShown && !clickerUrlSeen && portalClickerUrl()) {
      clickerUrlSeen = true
      draw()
    }
    startPresentPoll()
  }, 350)
}
var clickerUrlSeen = false

function writeJsonFile (name, obj) {
  try { fs.writeFileSync(path.join(path.dirname(deck.file), name), JSON.stringify(obj)) } catch (e) {}
}

function startPresent () {
  if (!deck) return
  presentStyle = 'clean'
  clickerUrlSeen = false
  try { fs.unlinkSync(PORTAL_RESULT) } catch (e) {} // clear a stale portal URL
  writePresentSlides()
  writePresentState()
  // spawn the audience server (shipped to the deck dir as present-server.js)
  var serverPath = path.join(path.dirname(deck.file), 'present-server.js')
  try {
    presentProc = cp.spawn('node', [serverPath], {
      cwd: path.dirname(deck.file),
      env: process.env
    })
    presentProc.on('error', function () {})
  } catch (e) {}
  mode = 'presenter'
  startPresentPoll() // follow clicker taps written into the state file
  draw()
  // The audience server's portal opens the side panel a moment later, which
  // shrinks the terminal. The resize repaint can race the first frame, leaving
  // a stale full-width frame (notes/next pushed off) until the next keypress.
  // Force a clean repaint once the panel has settled so the view is complete.
  setTimeout(function () {
    if (mode === 'presenter') { process.stdout.write('\x1b[2J\x1b[H'); draw() }
  }, 500)
}

function presenterAdvance (delta) {
  slideIndex += delta
  clampSlide()
  writePresentState()
}

// Whether the clicker QR is shown in the presenter view. Off by default; the
// host presses k to show it when they want to hand out the phone remote.
var clickerShown = false

// The clicker URL = the audience portal URL (written to .sloth-portal by the
// page) with /clicker appended.
function portalClickerUrl () {
  var u = null
  try { u = fs.readFileSync(PORTAL_RESULT, 'utf-8').trim() } catch (e) {}
  if (!u) return null
  return u.replace(/\/+$/, '') + '/clicker'
}

function drawPresenter () {
  var slide = curSlide()
  var nextSlide = deck.slides[slideIndex + 1]
  var width = termCols() - mleft - 2

  var body = []
  body.push(C('  PRESENTER   slide ' + (slideIndex + 1) + '/' + deck.slides.length +
    '   audience style: ' + presentStyle, 'dim'))
  body.push('')
  // current slide (rendered the normal way)
  renderSlide(deck, slide, slide.steps.length - 1).forEach(function (l) { body.push(l) })

  body.push('')
  body.push(C('  ── speaker notes ──', 'accent'))
  if (slide.notes.length) {
    slide.notes.forEach(function (n) {
      wrap(n, width).forEach(function (w) { body.push(C('  ' + w, 'dim')) })
    })
  } else {
    body.push(C('  (none)', 'dim'))
  }

  body.push('')
  body.push(C('  ── next ──', 'accent'))
  if (nextSlide) {
    body.push(C('  ' + (nextSlide.title || '(untitled)'), 'dim'))
  } else {
    body.push(C('  (end)', 'dim'))
  }

  // Clicker QR: scan it with a phone to use it as a remote. The audience URL
  // comes from the portal handshake the page writes; /clicker on that host is
  // the remote page.
  if (clickerShown) {
    var url = portalClickerUrl()
    body.push('')
    body.push(C('  ── phone clicker + pen (scan to control & draw) ──', 'accent'))
    if (url) {
      qr.render(qr.encode(url)).forEach(function (l) { body.push('  ' + l) })
      body.push(C('  ' + url, 'dim'))
    } else {
      body.push(C('  waiting for the audience URL…', 'dim'))
    }
  }

  var titleBar = ' PRESENTING  ' + deck.meta.title
  var footer = ' ←/→ change slide' + (slideHasRun(slide) ? '    ' + keyFor('run') + ': run' : '') +
    '    s: style    k: clicker QR    esc: stop'
  drawFrame(titleBar, body, footer)
}

function presenterKeys (ch, key) {
  if (key.name === 'escape' || ch === 'q') {
    if (presentProc) { try { presentProc.kill() } catch (e) {} ; presentProc = null }
    if (presentPollTimer) { clearTimeout(presentPollTimer); presentPollTimer = null }
    // Tell the page to close the side panel; the audience server is gone now.
    try { cp.spawn('xdg-open', ['sloth:portal-close'], { stdio: 'ignore', detached: true }).unref() } catch (e) {}
    openMenu(); return draw()
  }
  else if (key.name === 'right' || key.name === 'pagedown' || key.name === 'space' || isEnter(key)) presenterAdvance(1)
  else if (key.name === 'left' || key.name === 'pageup' || key.name === 'backspace') presenterAdvance(-1)
  // run the current slide's code block (returns to the presenter view after)
  else if (controls.actionFor(ch) === 'run' && slideHasRun(curSlide())) return (runSlide(), draw())
  else if (ch === 's') { presentStyle = presentStyle === 'clean' ? 'terminal' : 'clean'; writePresentState() }
  else if (ch === 'k') { clickerShown = !clickerShown }
  draw()
}

// ---- table of contents (frogmouth) ---------------------------------------

function openToc () {
  mode = 'toc'
  overlay = { cursor: slideIndex }
}

function drawToc () {
  var body = ['', C('  Table of contents  -  ' + deck.meta.title, 'heading', { bold: true }), '']
  deck.slides.forEach(function (s, i) {
    var marker = i === overlay.cursor ? C('❯ ', 'accent') : '  '
    var label = (i + 1) + '. ' + (s.title || '(untitled)')
    body.push('  ' + marker + (i === overlay.cursor ? C(label, 'accent') : label))
  })
  body.push('')
  drawFrame(' Table of contents', body, ' enter: go   j/k: move   esc: back')
}

// ---- search (ekphos) ------------------------------------------------------

function openSearch () {
  mode = 'search'
  overlay = { query: '', results: [], cursor: 0 }
}

function runSearch (q) {
  var results = []
  deck.slides.forEach(function (s, i) {
    var hay = s.lines.join('\n').toLowerCase()
    var at = hay.indexOf(q.toLowerCase())
    if (q && at !== -1) {
      var ctx = s.lines.join(' ').replace(/\s+/g, ' ')
      results.push({ slide: i, title: s.title, ctx: ctx.slice(0, 60) })
    }
  })
  overlay.results = results
  overlay.cursor = 0
}

function drawSearch () {
  var body = ['', C('  Search: ' + overlay.query + '█', 'accent'), '']
  if (!overlay.results.length && overlay.query) {
    body.push('  no matches')
  }
  overlay.results.forEach(function (r, i) {
    var marker = i === overlay.cursor ? C('❯ ', 'accent') : '  '
    body.push('  ' + marker + 'slide ' + (r.slide + 1) + ': ' + r.title + '  ' + r.ctx.grey)
  })
  drawFrame(' Search in deck', body, ' type to search   enter: go   esc: back')
}

// ---- graph (ekphos) -------------------------------------------------------

function openGraph () {
  mode = 'graph'
  overlay = null
}

function drawGraph () {
  var rows = graph.render(deck, discoverDecks(), termCols() - 4)
  var body = ['', C('  [[wikilink]] graph', 'heading', { bold: true }), ''].concat(rows.map(function (r) {
    return '  ' + r
  }))
  drawFrame(' Link graph', body, ' esc or m: back   (decks linked via [[name]])')
}

// ---- file browser (frogmouth) ---------------------------------------------

function discoverDecks () {
  // All .md files alongside and below the decks root (deck dir, or cwd when no
  // deck is open yet).
  var root = decksRoot()
  var found = []
  ;(function walk (dir, depth) {
    if (depth > 3) return
    var entries
    try { entries = fs.readdirSync(dir) } catch (e) { return }
    entries.forEach(function (name) {
      if (name[0] === '.' || name === 'node_modules') return
      var full = path.join(dir, name)
      var stat
      try { stat = fs.statSync(full) } catch (e) { return }
      if (stat.isDirectory()) walk(full, depth + 1)
      else if (/\.(md|markdown)$/i.test(name)) found.push(full)
    })
  })(root, 0)
  return found
}

// intent: 'present' (default) or 'edit'. back: mode to return to on escape.
function openBrowse (intent, back) {
  mode = 'browse'
  var files = discoverDecks()
  overlay = { files: files, cursor: 0, intent: intent || 'present', back: back || 'present' }
}

function drawBrowse () {
  var titles = { edit: '  Edit a deck', live: '  Present a deck', survey: '  Add a survey to which deck?' }
  var title = titles[overlay.intent] || '  Open a deck'
  var body = ['', C(title, 'heading', { bold: true }), '']
  if (!overlay.files.length) body.push('  no markdown files found nearby')
  overlay.files.forEach(function (f, i) {
    var marker = i === overlay.cursor ? C('❯ ', 'accent') : '  '
    var rel = path.relative(decksRoot(), f)
    body.push('  ' + marker + (i === overlay.cursor ? C(rel, 'accent') : rel))
  })
  drawFrame(' File browser', body, ' enter: open   j/k: move   esc: back')
}

// ---- editor (ekphos) ------------------------------------------------------

var editor = null
var editorBack = 'present' // mode to return to when the editor is quit

function openEditor (back) {
  mode = 'edit'
  editorBack = back || 'present'
  editor = new Editor(deck.raw, function onSave (text) {
    fs.writeFileSync(deck.file, text)
  })
  // jump editor to the current slide's first line for context
  editor.gotoFraction(deck.slides.length ? slideIndex / deck.slides.length : 0)
}

function drawEditor () {
  var view = editor.view(termRows() - 3, termCols() - 2)
  var body = [''].concat(view.lines)
  var titleBar = ' EDIT  ' + path.basename(deck.file) +
    (editor.dirty ? '  ●' : '')
  // modeLabel() carries the contextual hint (position, Esc menu, save/quit).
  var footer = ' ' + editor.modeLabel()
  drawFrame(titleBar, body, footer)
}

// ---- theme picker + configurator (ekphos) ---------------------------------

function cycleTheme () {
  var names = themes.names()
  var i = names.indexOf(theme.name)
  theme = themes.get(names[(i + 1) % names.length])
}

// The theme picker: a scrollable, type-to-filter list of every available theme
// (built-ins + Gogh), each with a colour preview. Enter activates and saves the
// chosen theme; `e` opens the per-role configurator for fine-tuning.
function openThemePicker (back) {
  mode = 'themepick'
  var all = themes.names()
  var cur = all.indexOf(theme.name)
  overlay = { all: all, filter: '', cursor: cur < 0 ? 0 : cur, top: 0, back: back || 'present' }
}

function filteredThemes () {
  var q = overlay.filter.toLowerCase()
  if (!q) return overlay.all
  return overlay.all.filter(function (n) {
    var t = themes.get(n)
    return n.toLowerCase().indexOf(q) !== -1 || (t.label || '').toLowerCase().indexOf(q) !== -1
  })
}

// A compact colour preview: solid blocks in the theme's main roles.
function themeSwatch (t) {
  return themes.paint('███', t.heading) + themes.paint('███', t.accent) +
    themes.paint('███', t.link) + themes.paint('███', t.code) +
    themes.paint('███', t.quote)
}

function drawThemePicker () {
  var list = filteredThemes()
  if (overlay.cursor >= list.length) overlay.cursor = Math.max(0, list.length - 1)

  var rows = termRows()
  var visible = rows - 8 // leave room for header, filter, footer
  if (overlay.cursor < overlay.top) overlay.top = overlay.cursor
  if (overlay.cursor >= overlay.top + visible) overlay.top = overlay.cursor - visible + 1

  var body = ['', C('  Themes', 'heading', { bold: true }),
    C('  ' + list.length + ' available    type to filter', 'dim'), '']
  body.push('  filter: ' + C((overlay.filter || '') + '█', 'accent'))
  body.push('')

  for (var i = overlay.top; i < overlay.top + visible && i < list.length; i++) {
    var name = list[i]
    var t = themes.get(name)
    var sel = i === overlay.cursor
    var marker = sel ? C('❯ ', 'accent') : '  '
    var label = t.label || name
    if (label.length > 24) label = label.slice(0, 24)
    while (label.length < 26) label += ' '
    var active = name === theme.name ? C(' (current)', 'dim') : ''
    body.push('  ' + marker + themeSwatch(t) + '  ' + (sel ? C(label, 'accent') : label) + active)
  }

  var footer = ' enter: use   ↑/↓: move   type: filter   tab: edit colours   esc: back'
  drawFrame(' Themes', body, footer)
}

function themePickerKeys (ch, key) {
  var list = filteredThemes()
  if (key.name === 'escape') { mode = overlay.back; return draw() }
  if (key.name === 'down') { overlay.cursor = Math.min(overlay.cursor + 1, list.length - 1); return draw() }
  if (key.name === 'up') { overlay.cursor = Math.max(overlay.cursor - 1, 0); return draw() }
  if (key.name === 'pagedown') { overlay.cursor = Math.min(overlay.cursor + 10, list.length - 1); return draw() }
  if (key.name === 'pageup') { overlay.cursor = Math.max(overlay.cursor - 10, 0); return draw() }
  if (isEnter(key)) {
    if (list.length) { theme = themes.get(list[overlay.cursor]); themes.save(theme) }
    return draw()
  }
  if (key.name === 'tab') { // fine-tune the current theme's colours
    return (openThemeEditor('themepick'), draw())
  }
  if (key.name === 'backspace') { overlay.filter = overlay.filter.slice(0, -1); overlay.cursor = 0; return draw() }
  if (ch && ch.length === 1 && ch >= ' ' && ch !== '\r' && ch !== '\n') {
    overlay.filter += ch; overlay.cursor = 0; return draw()
  }
  draw()
}

// The theme configurator: pick a role, change its colour with h/l (named
// colours) or type a #hex code, see it live on a preview, then `s` saves it
// into theme.json. overlay.hex holds an in-progress hex entry (null otherwise).
function openThemeEditor (back) {
  mode = 'theme'
  overlay = { roles: themes.roles(), cursor: 0, saved: false, hex: null, back: back || 'present' }
}

// A wide swatch painted in `color` (named or hex), 10 cells of solid block.
function swatch (color) {
  return themes.paint('██████████', color)
}

function drawThemeEditor () {
  var roles = overlay.roles
  var body = ['', C('  Configure theme: ' + theme.name, 'heading', { bold: true }), '']

  roles.forEach(function (role, i) {
    var sel = i === overlay.cursor
    var marker = sel ? C('❯ ', 'accent') : '  '
    var label = role + ':'
    while (label.length < 9) label += ' '
    // role name, then a wide live swatch, then the colour value (named or hex)
    var value = (sel && overlay.hex != null) ? ('#' + overlay.hex + '█') : theme[role]
    var name = sel ? C(label, 'accent') : label
    body.push('  ' + marker + name + ' ' + swatch(theme[role]) + '  ' + value)
  })

  body.push('')
  body.push('  preview')
  body.push('    ' + C('A heading', 'heading', { bold: true }) +
    '   ' + C('an accent', 'accent') +
    '   ' + C('a link', 'link') +
    '   ' + C(' code ', 'code'))
  body.push('    ' + C('│ a quote', 'quote'))
  body.push('')
  body.push(C('  config: ' + (themes.configPath() || 'theme.json'), 'dim'))
  if (overlay.saved) body.push(C('  saved ✓', 'accent'))

  var footer = overlay.hex != null
    ? ' type 6 hex digits then enter   esc: cancel hex'
    : ' j/k: role   h/l: named colour   #: type a hex   s: save   esc: back'
  drawFrame(' Theme configurator', body, footer)
}

// ---- start menu -----------------------------------------------------------
// The home screen. SLOTH opens here, and returns here on quitting a deck.

var MENU_ITEMS = [
  { key: 'New', desc: 'start a new deck from a template', action: menuNew },
  { key: 'Open', desc: 'pick a deck to view', action: menuOpen },
  { key: 'Present', desc: 'present to an audience on a shareable URL', action: menuPresent },
  { key: 'Edit', desc: 'pick a deck to edit', action: menuEdit },
  { key: 'Survey', desc: 'add an audience survey to the current deck', action: menuSurvey },
  { key: 'Upload', desc: 'add a .md file from your computer', action: menuUpload },
  { key: 'Download', desc: 'save the current project (with survey data) as a zip', action: menuDownload },
  { key: 'Files', desc: 'create files for runnable code (package.json, etc.)', action: menuFiles },
  { key: 'Controls', desc: 'view and rebind the presenting keys', action: menuControls },
  { key: 'Settings', desc: 'configure colours and theme', action: menuSettings },
  { key: 'Tutorial', desc: 'a guided tour of SLOTH', action: menuTutorial }
]

function openMenu () {
  mode = 'menu'
  overlay = { cursor: overlay && overlay.menuCursor != null ? overlay.menuCursor : 0 }
}

// Center a single (possibly ANSI-styled) line within `width` columns.
function hcenter (line, width) {
  var len = stripAnsi(line).length
  var pad = Math.max(0, Math.floor((width - len) / 2))
  return ' '.repeat(pad) + line
}

function drawMenu () {
  var cols = termCols()
  var rows = termRows()

  var block = []
  // The host page overlays a PNG logo at the top of the home screen (the
  // terminal can't render images), so leave a blank band here for it. If the
  // page logo fails to load it just shows empty space, so keep a small text
  // wordmark below as a graceful fallback cue.
  var logoBand = Math.max(6, Math.floor((rows - 2) * 0.32))
  for (var lb = 0; lb < logoBand; lb++) block.push('')
  block.push(hcenter(C('terminal slide decks', 'dim'), cols))
  block.push('')
  block.push('')

  // Pad keys to a common width so descriptions align. Build each item line as
  // one left-aligned string, then center the whole group of lines by the width
  // of the widest line (so the block moves as a unit and items don't stagger).
  var labelW = 0
  MENU_ITEMS.forEach(function (it) { if (it.key.length > labelW) labelW = it.key.length })

  var itemLines = MENU_ITEMS.map(function (item, i) {
    var selected = i === overlay.cursor
    var label = item.key
    while (label.length < labelW) label += ' '
    var left = (selected ? C('❯ ', 'accent') : '  ') +
      (selected ? C(label, 'accent', { bold: true }) : label.bold)
    return left + '    ' + C(item.desc, 'dim')
  })

  // The common left margin centers the longest item; all items share it so the
  // key column lines up and the block reads as a single left-aligned list.
  var widest = 0
  itemLines.forEach(function (l) { var n = stripAnsi(l).length; if (n > widest) widest = n })
  var margin = Math.max(0, Math.floor((cols - widest) / 2))
  itemLines.forEach(function (l) { block.push(' '.repeat(margin) + l) })

  block.push('')
  block.push('')
  block.push(hcenter(C('↑/↓ to move      enter to choose', 'dim'), cols))

  // Vertically center the block in the area between the top and bottom bars.
  var avail = rows - 2 // minus the two bars
  var padTop = Math.max(0, Math.floor((avail - block.length) / 2))
  var body = []
  for (var p = 0; p < padTop; p++) body.push('')
  body = body.concat(block)

  // Body lines are already centered; render with no indent and body starting
  // right below the top bar. No quit option: this is the app's home, and the
  // page relaunches SLOTH if the process ever exits, so quitting is meaningless.
  var footer = overlay && overlay.toast
    ? ' ' + overlay.toast
    : ' enter: choose    ↑/↓ or j/k: move'
  drawFrame(' SLOTH', body, footer, { indent: 0, top: 1 })
}

function menuKeys (ch, key) {
  if (key.name === 'j' || key.name === 'down') overlay.cursor = Math.min(overlay.cursor + 1, MENU_ITEMS.length - 1)
  else if (key.name === 'k' || key.name === 'up') overlay.cursor = Math.max(overlay.cursor - 1, 0)
  else if (isEnter(key)) {
    var item = MENU_ITEMS[overlay.cursor]
    overlay = { menuCursor: overlay.cursor } // remember position for next return
    return item.action()
  }
  draw()
}

// Starter templates offered by "New".
var TEMPLATES = [
  {
    key: 'Blank',
    desc: 'a title slide and one more, nothing else',
    body: '%title: Untitled\n%author: \n\n# Title\n\nYour subtitle here.\n\n---\n\n## Next slide\n\nStart typing. Separate slides with a line of ---\n'
  },
  {
    key: 'Code-ready',
    desc: 'runnable code blocks and a cat directive wired up',
    body: '%title: Code talk\n%author: \n\n# Code talk\n\nA deck with runnable blocks.\n\n---\n\n## Run this\n\nPress r to run it inside the Pod.\n\n<!-- run: node hello.js as: hello.js -->\n```js\nconsole.log(\'hello from a slide\')\n```\n\n---\n\n## Show a file live\n\n<!-- cat: package.json -->\n\nUse the Files menu to add package.json and source files.\n'
  },
  {
    key: 'Talk',
    desc: 'intro, agenda, sections, and a closing slide',
    body: '%title: My talk\n%author: \n%date: \n\n-> # My talk <-\n\n-> a one-line summary <-\n\n---\n\n## Agenda\n\n* First thing\n* Second thing\n* Third thing\n\n---\n\n## First thing\n\nThe point of this section.\n\n<!-- speaker_note: remember to mention the example -->\n\n---\n\n## Second thing\n\n> a quote that lands\n\n---\n\n-> ## Thanks <-\n\nquestions?\n'
  }
]

// New: choose a template, then create the deck and open it in the editor.
function menuNew () { openTemplates(); draw() }

function openTemplates () {
  mode = 'template'
  overlay = { cursor: 0 }
}

function drawTemplates () {
  var body = ['', C('  New deck from a template', 'heading', { bold: true }), '']
  TEMPLATES.forEach(function (t, i) {
    var sel = i === overlay.cursor
    var marker = sel ? C('❯ ', 'accent') : '  '
    var label = t.key
    while (label.length < 12) label += ' '
    body.push('  ' + marker + (sel ? C(label, 'accent', { bold: true }) : label.bold) + '  ' + C(t.desc, 'dim'))
  })
  drawFrame(' New', body, ' enter: create   j/k: move   esc: back')
}

function templateKeys (ch, key) {
  if (key.name === 'escape' || ch === 'q') { openMenu() }
  else if (key.name === 'j' || key.name === 'down') overlay.cursor = Math.min(overlay.cursor + 1, TEMPLATES.length - 1)
  else if (key.name === 'k' || key.name === 'up') overlay.cursor = Math.max(overlay.cursor - 1, 0)
  else if (isEnter(key)) {
    var tpl = TEMPLATES[overlay.cursor]
    var base = tpl.key.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    var dest = path.join(decksRoot(), base + '.md')
    var n = 1
    while (fileExists(dest)) { dest = path.join(decksRoot(), base + '-' + (n++) + '.md') }
    try { fs.writeFileSync(dest, tpl.body) } catch (e) {}
    loadDeck(dest, false)
    openEditor('menu')
  }
  draw()
}

function fileExists (p) {
  try { fs.statSync(p); return true } catch (e) { return false }
}

// Open: browse for a deck and present it. Escape returns to the menu.
function menuOpen () { openBrowse('present', 'menu'); draw() }

// Present: browse for a deck, then present it to an audience on a portal while
// you drive from the presenter view.
function menuPresent () { openBrowse('live', 'menu'); draw() }

// Edit: browse for a deck and open it in the editor. Escape returns to menu.
function menuEdit () { openBrowse('edit', 'menu'); draw() }

// Upload: ask the host page to open a file dialog. BrowserPod fires the page's
// onOpen callback when a Pod process runs xdg-open, so we run it with a
// sentinel. The page writes the chosen file into /project and records its name
// in the handshake file below; we poll for that and then open the deck.
var UPLOAD_SENTINEL = 'sloth:upload'
// The page writes the chosen filename here, in SLOTH's working directory (the
// Pod runs SLOTH with cwd /project, and the page writes /project/.sloth-upload).
var UPLOAD_RESULT = path.resolve('.sloth-upload')

function menuUpload () {
  // clear any stale handshake, then trigger the page's file dialog
  try { fs.unlinkSync(UPLOAD_RESULT) } catch (e) {}
  try {
    cp.spawn('xdg-open', [UPLOAD_SENTINEL], { stdio: 'ignore', detached: true }).unref()
  } catch (e) {}
  mode = 'upload'
  overlay = { tick: 0 } // tick drives the little waiting animation
  pollUpload()
  draw()
}

// Download starter project: signal the page (which can trigger a browser
// download) to build and download a zip of the empty project structure. The
// page owns the zip + download; SLOTH just fires the sentinel.
var DOWNLOAD_SENTINEL = 'sloth:download-starter'
function downloadStarter () {
  try {
    cp.spawn('xdg-open', [DOWNLOAD_SENTINEL], { stdio: 'ignore', detached: true }).unref()
  } catch (e) {}
  overlay.toast = 'starter project downloading…'
  draw()
  // clear the toast shortly after
  setTimeout(function () { if (mode === 'files' && overlay) { overlay.toast = null; draw() } }, 2500)
}

// Survey: a guided wizard that builds a typed survey and writes it into the
// deck as a survey block (which renders as a form on the audience portal).
function menuSurvey () {
  // With no deck open, pick one first; the browser's 'survey' intent then opens
  // the wizard on the chosen deck.
  if (!deck) return (openBrowse('survey', 'menu'), draw())
  openSurveyWizard()
}

// Wizard state lives in overlay:
//   { id, questions:[{type,q,options?}], step, draft:{...} }
// step: 'menu' (the action list), 'addq' (choosing a type), or a typing step.
function openSurveyWizard () {
  mode = 'wizard'
  overlay = { id: 'feedback', questions: [], step: 'menu', input: '', draft: null }
}

var WIZ_TYPES = [
  { type: 'single', label: 'Single choice (pick one)' },
  { type: 'multi', label: 'Multiple choice (pick many)' },
  { type: 'rating', label: 'Rating (1-5)' },
  { type: 'text', label: 'Free text' }
]

// The main wizard screen is a normal arrow+Enter list, like every other screen.
// Rows: each question (Enter removes it), then Add a question / Set id / Write.
function wizardMenuRows () {
  var o = overlay
  var rows = []
  o.questions.forEach(function (q, i) {
    var opts = q.options && q.options.length ? '  [' + q.options.join(', ') + ']' : ''
    rows.push({ kind: 'q', i: i, label: '(' + q.type + ') ' + q.q + opts })
  })
  rows.push({ kind: 'add', label: '+ Add a question' })
  rows.push({ kind: 'id', label: 'Survey id: ' + o.id })
  rows.push({ kind: 'write', label: o.questions.length ? 'Write survey to deck' : 'Write survey to deck (add a question first)' })
  return rows
}

function drawWizard () {
  var o = overlay
  var body = ['', C('  Build a survey', 'heading', { bold: true }),
    C('  answers are saved locally to data/responses-' + o.id + '.csv', 'dim'), '']

  if (o.step === 'id') {
    body.push('  survey id: ' + C(o.input + '█', 'accent'))
    return drawFrame(' Survey wizard', body, ' type an id, then enter   esc to cancel')
  }
  if (o.step === 'qtext') {
    body.push('  ' + C(o.draft.type, 'accent') + ' question:')
    body.push('  ' + C(o.input + '█', 'accent'))
    return drawFrame(' Survey wizard', body, ' type the question, then enter   esc to cancel')
  }
  if (o.step === 'qopt') {
    body.push('  question: ' + o.draft.q)
    body.push('  options: ' + (o.draft.options.length ? o.draft.options.join(', ') : C('(none yet)', 'dim')))
    body.push('')
    body.push('  add option: ' + C(o.input + '█', 'accent'))
    return drawFrame(' Survey wizard', body, ' enter adds an option, empty enter finishes   esc to cancel')
  }
  if (o.step === 'addq') {
    body.push(C('  choose a question type', 'dim'))
    body.push('')
    WIZ_TYPES.forEach(function (t, i) {
      var sel = i === o.cursor
      body.push('  ' + (sel ? C('❯ ', 'accent') : '  ') + (sel ? C(t.label, 'accent') : t.label))
    })
    return drawFrame(' Survey wizard', body, ' ↑/↓ move    enter pick    esc back')
  }

  // main list
  var rows = wizardMenuRows()
  rows.forEach(function (r, i) {
    var sel = i === o.cursor
    var marker = sel ? C('❯ ', 'accent') : '  '
    var label = (r.kind === 'q') ? C((r.i + 1) + '. ', 'accent') + r.label : r.label
    body.push('  ' + marker + (sel ? C(stripAnsi(label), 'accent') : label))
  })
  drawFrame(' Survey wizard', body, ' ↑/↓ move    enter select    (on a question, enter removes it)    esc cancel')
}

function wizardKeys (ch, key) {
  var o = overlay
  var typing = (ch && ch.length === 1 && ch >= ' ' && ch !== '\r' && ch !== '\n')

  if (o.step === 'id') {
    if (key.name === 'escape') { o.step = 'menu' }
    else if (isEnter(key)) { if (o.input.trim()) o.id = o.input.trim().replace(/[^\w.-]/g, '_'); o.input = ''; o.step = 'menu' }
    else if (key.name === 'backspace') o.input = o.input.slice(0, -1)
    else if (typing) o.input += ch
    return draw()
  }
  if (o.step === 'qtext') {
    if (key.name === 'escape') { o.draft = null; o.input = ''; o.step = 'menu' }
    else if (isEnter(key)) {
      if (!o.input.trim()) return draw()
      o.draft.q = o.input.trim(); o.input = ''
      if (o.draft.type === 'single' || o.draft.type === 'multi') { o.draft.options = []; o.step = 'qopt' }
      else { o.questions.push(o.draft); o.draft = null; o.step = 'menu' }
    }
    else if (key.name === 'backspace') o.input = o.input.slice(0, -1)
    else if (typing) o.input += ch
    return draw()
  }
  if (o.step === 'qopt') {
    if (key.name === 'escape') { o.draft = null; o.input = ''; o.step = 'menu' }
    else if (isEnter(key)) {
      if (o.input.trim()) { o.draft.options.push(o.input.trim()); o.input = '' }
      else { if (o.draft.options.length) o.questions.push(o.draft); o.draft = null; o.step = 'menu' }
    }
    else if (key.name === 'backspace') o.input = o.input.slice(0, -1)
    else if (typing) o.input += ch
    return draw()
  }
  if (o.step === 'addq') {
    if (key.name === 'escape') { o.step = 'menu' }
    else if (key.name === 'j' || key.name === 'down') o.cursor = Math.min((o.cursor || 0) + 1, WIZ_TYPES.length - 1)
    else if (key.name === 'k' || key.name === 'up') o.cursor = Math.max((o.cursor || 0) - 1, 0)
    else if (isEnter(key)) { o.draft = { type: WIZ_TYPES[o.cursor || 0].type, q: '' }; o.input = ''; o.step = 'qtext' }
    return draw()
  }

  // main list: arrows + enter, consistent with the rest of the app
  var rows = wizardMenuRows()
  if (o.cursor == null || o.cursor >= rows.length) o.cursor = 0
  if (key.name === 'escape') { openMenu() }
  else if (key.name === 'j' || key.name === 'down') o.cursor = Math.min(o.cursor + 1, rows.length - 1)
  else if (key.name === 'k' || key.name === 'up') o.cursor = Math.max(o.cursor - 1, 0)
  else if (isEnter(key)) {
    var r = rows[o.cursor]
    if (r.kind === 'q') { o.questions.splice(r.i, 1); if (o.cursor >= wizardMenuRows().length) o.cursor = 0 } // remove
    else if (r.kind === 'add') { o.cursor = 0; o.step = 'addq' }
    else if (r.kind === 'id') { o.input = o.id; o.step = 'id' }
    else if (r.kind === 'write' && o.questions.length) { return writeSurveyToDeck() }
  }
  draw()
}

// Compose the survey block from the wizard's questions and append it as a new
// slide to the open deck, then open the editor there.
function writeSurveyToDeck () {
  var lines = ['', '---', '', '## Your turn', '', '<!-- survey id: ' + overlay.id]
  overlay.questions.forEach(function (q) {
    if (q.type === 'single' || q.type === 'multi') {
      lines.push(q.type + ': ' + q.q + ' | ' + q.options.join(' | '))
    } else {
      lines.push(q.type + ': ' + q.q)
    }
  })
  lines.push('-->', '')
  try { fs.appendFileSync(deck.file, lines.join('\n')) } catch (e) {}
  loadDeck(deck.file, false)
  slideIndex = deck.slides.length - 1
  mode = 'present' // show the new survey slide
  draw()
}

// Download the CURRENT project. SLOTH (in the Pod) can read the filesystem but
// can't trigger a browser download; the page can build/download a zip but can't
// read the Pod tree. So SLOTH walks the project, writes a manifest of every
// file (base64) to .sloth-download.json, and signals the page to zip + save it.
var DOWNLOAD_PROJECT_SENTINEL = 'sloth:download-project'
var DOWNLOAD_MANIFEST = path.resolve('.sloth-download.json')

// SLOTH's own machinery / demo files, never part of a user's exported project.
var DOWNLOAD_SKIP = {
  'node_modules': 1, 'present-server.js': 1, 'present-slides.json': 1,
  'present-state.json': 1, 'sloth.js': 1, 'sloth-art.txt': 1, 'lib': 1,
  'package.json': 1, 'package-lock.json': 1, 'intro.md': 1, 'features.md': 1
}
var CONVENTION = ['content', 'media', 'attachments', 'snippets', 'repositories', 'config', 'data']

function menuDownload () {
  var root = deck ? projectRoot() : path.resolve('.')
  var name = (deck ? path.basename(root) : 'sloth-project') || 'sloth-project'
  if (name === 'project') name = 'sloth-project' // /project -> friendlier name
  var files = [] // { name, b64 }

  function addFile (relPath, full) {
    try { files.push({ name: name + '/' + relPath, b64: fs.readFileSync(full).toString('base64') }) } catch (e) {}
  }
  function addText (relPath, text) {
    files.push({ name: name + '/' + relPath, b64: Buffer.from(text, 'utf-8').toString('base64') })
  }

  var hasConvention = CONVENTION.some(function (f) { return fileExistsSafe(path.join(root, f)) })

  if (hasConvention) {
    // export the existing convention folders verbatim (minus SLOTH machinery)
    CONVENTION.forEach(function (folder) {
      var fdir = path.join(root, folder)
      if (!fileExistsSafe(fdir)) return
      ;(function walk (dir, rel, depth) {
        if (depth > 5) return
        var entries
        try { entries = fs.readdirSync(dir) } catch (e) { return }
        entries.forEach(function (n) {
          if (n[0] === '.' || DOWNLOAD_SKIP[n]) return
          var full = path.join(dir, n)
          var st; try { st = fs.statSync(full) } catch (e) { return }
          if (st.isDirectory()) walk(full, rel + n + '/', depth + 1)
          else addFile(rel + n, full)
        })
      })(fdir, folder + '/', 0)
    })
  } else {
    // a loose project: wrap the user's decks into content/ and scaffold the rest
    var ddir = deck ? path.dirname(deck.file) : root
    try {
      fs.readdirSync(ddir).forEach(function (n) {
        if (n[0] === '.' || DOWNLOAD_SKIP[n]) return
        if (!/\.(md|markdown)$/i.test(n)) return
        addFile('content/' + n, path.join(ddir, n))
      })
    } catch (e) {}
  }

  // always include survey results from data/ (created during Present)
  var dataDir = path.join(root, 'data')
  if (fileExistsSafe(dataDir)) {
    try {
      fs.readdirSync(dataDir).forEach(function (n) {
        if (n[0] === '.') return
        addFile('data/' + n, path.join(dataDir, n))
      })
    } catch (e) {}
  }

  // ensure every convention folder exists in the zip (a .gitkeep if empty)
  CONVENTION.forEach(function (folder) {
    var has = files.some(function (f) { return f.name.indexOf(name + '/' + folder + '/') === 0 })
    if (!has) addText(folder + '/.gitkeep', '')
  })

  // a README describing the structure
  addText('README.md', [
    '# ' + name,
    '',
    'A SLOTH project. Edit the decks in content/, then upload the folder to SLOTH.',
    '',
    '- content/      your .md decks',
    '- media/        images, video, audio',
    '- attachments/  downloadable files',
    '- snippets/     runnable code',
    '- repositories/ full apps to run on a portal',
    '- config/       sloth.json, theme.json, controls.json',
    '- data/         survey responses (CSV), saved locally',
    ''
  ].join('\n'))

  try { fs.writeFileSync(DOWNLOAD_MANIFEST, JSON.stringify({ zip: name + '.zip', files: files })) } catch (e) {}
  try { cp.spawn('xdg-open', [DOWNLOAD_PROJECT_SENTINEL], { stdio: 'ignore', detached: true }).unref() } catch (e) {}
  openMenu()
  overlay.toast = 'preparing ' + name + '.zip…'
  draw()
  setTimeout(function () { if (mode === 'menu' && overlay) { overlay.toast = null; draw() } }, 3000)
}

var uploadTimer = null
function pollUpload () {
  if (uploadTimer) clearTimeout(uploadTimer)
  uploadTimer = setTimeout(function () {
    if (mode !== 'upload') return
    var name = null
    try { name = fs.readFileSync(UPLOAD_RESULT, 'utf-8').trim() } catch (e) {}
    if (name) {
      try { fs.unlinkSync(UPLOAD_RESULT) } catch (e) {}
      var full = path.isAbsolute(name) ? name : path.resolve(name)
      if (fileExists(full)) { loadDeck(full, false); mode = 'present'; draw(); return }
    }
    overlay.tick = (overlay.tick + 1) % 4
    draw()
    pollUpload()
  }, 250)
}

function drawUpload () {
  var dots = '.'.repeat(overlay.tick) + ' '.repeat(3 - overlay.tick)
  var body = [
    '',
    C('  Upload a deck', 'heading', { bold: true }),
    '',
    '  A file picker has opened in your browser' + dots,
    '  choose a .md file to present it here.',
    '',
    C('  esc to cancel', 'dim')
  ]
  drawFrame(' Upload', body, ' waiting for your browser file picker…   esc: cancel')
}

function uploadKeys (ch, key) {
  if (key.name === 'escape' || ch === 'q') {
    if (uploadTimer) clearTimeout(uploadTimer)
    openMenu()
  }
  draw()
}

// Settings: the theme picker (choose a whole theme). From there, `e` opens the
// per-role configurator to fine-tune. Escape returns to the menu.
function menuSettings () { openThemePicker('menu'); draw() }

// Controls: view and rebind the present-mode keys, saved to controls.json.
function menuControls () { openControls(); draw() }

function openControls () {
  mode = 'controls'
  overlay = { cursor: 0, capturing: false, saved: false }
}

function drawControls () {
  var list = controls.list()
  var body = ['', C('  Controls', 'heading', { bold: true }),
    C('  rebind the keys used while presenting', 'dim'), '']

  list.forEach(function (b, i) {
    var sel = i === overlay.cursor
    var marker = sel ? C('❯ ', 'accent') : '  '
    var keyCell = '[ ' + b.key + ' ]'
    if (sel && overlay.capturing) keyCell = C('[ press a key ]', 'accent')
    else if (sel) keyCell = C('[ ' + b.key + ' ]', 'accent')
    var lab = b.label
    while (lab.length < 26) lab += ' '
    body.push('  ' + marker + (sel ? C(lab, 'accent') : lab) + ' ' + keyCell)
  })

  body.push('')
  body.push(C('  config: ' + (controls.configPath() || 'controls.json'), 'dim'))
  if (overlay.saved) body.push(C('  saved ✓', 'accent'))

  var footer = overlay.capturing
    ? ' press the new key for this action   esc: cancel'
    : ' j/k: move   enter: rebind   s: save to controls.json   esc: back'
  drawFrame(' Controls', body, footer)
}

function controlsKeys (ch, key) {
  var list = controls.list()

  // capturing the next key for the selected action
  if (overlay.capturing) {
    if (key.name === 'escape') { overlay.capturing = false; return draw() }
    // accept a single printable char as the new binding
    if (ch && ch.length === 1 && ch >= ' ') {
      var ok = controls.rebind(list[overlay.cursor].action, ch)
      overlay.capturing = false
      overlay.saved = false
      overlay.lastError = ok ? null : (ch + ' is already used')
    }
    return draw()
  }

  if (key.name === 'escape' || ch === 'q') { mode = 'menu'; openMenu() }
  else if (key.name === 'j' || key.name === 'down') { overlay.cursor = Math.min(overlay.cursor + 1, list.length - 1); overlay.saved = false }
  else if (key.name === 'k' || key.name === 'up') { overlay.cursor = Math.max(overlay.cursor - 1, 0); overlay.saved = false }
  else if (isEnter(key)) { overlay.capturing = true }
  else if (ch === 's') { overlay.saved = controls.save() }
  draw()
}

// Files: a folder-aware browser over the SLOTH project convention. Level 1
// lists the project folders (content, media, ...); drilling into one lists its
// files, where you can create and edit. This is how SLOTH reflects the project
// structure a user authored in Obsidian or any editor.
function menuFiles () { openFiles(); draw() }

// SLOTH's own machinery, hidden from file listings.
var SLOTH_OWN = {
  'present-server.js': 1, 'present-slides.json': 1, 'present-state.json': 1,
  'sloth.js': 1, 'sloth-art.txt': 1
}

// overlay.folder is null at the folder list, or a folder name when drilled in.
function openFiles () {
  mode = 'files'
  overlay = { folder: null, cursor: 0, naming: null, files: [] }
}

function projectFolders () {
  var root = projectRoot()
  // Show the convention folders that exist, plus any other dirs present.
  var known = project.folders()
  var present = []
  known.forEach(function (f) { if (fileExistsSafe(path.join(root, f))) present.push(f) })
  // also include the project root itself as "(root)" for loose files
  return present
}

function listFilesIn (folder) {
  var dir = path.join(projectRoot(), folder)
  var out = []
  try {
    fs.readdirSync(dir).forEach(function (name) {
      if (name[0] === '.') return
      if (SLOTH_OWN[name]) return
      var stat
      try { stat = fs.statSync(path.join(dir, name)) } catch (e) { return }
      if (stat.isDirectory()) return
      out.push(name)
    })
  } catch (e) {}
  return out
}

function drawFiles () {
  // name-entry sub-mode (creating a new file in the current folder)
  if (overlay.naming != null) {
    var nb = ['', C('  New file in ' + overlay.folder + '/', 'heading', { bold: true }), '']
    nb.push('  name: ' + C(overlay.naming + '█', 'accent'))
    nb.push('')
    nb.push(C('  enter: create & edit    esc: cancel', 'dim'))
    drawFrame(' Files', nb, ' type a filename then enter')
    return
  }

  // level 1: the folder list
  if (overlay.folder == null) {
    var folders = projectFolders()
    var body = ['', C('  Project files', 'heading', { bold: true }),
      C('  ' + projectRoot(), 'dim'), '']

    // First row: download a starter project structure to author in any editor.
    var dlSel = overlay.cursor === 0
    body.push('  ' + (dlSel ? C('❯ ', 'accent') : '  ') +
      (dlSel ? C('⬇ Download starter project', 'accent') : '⬇ Download starter project'))
    body.push('')

    if (!folders.length) body.push(C('  (upload a project, or download the starter above)', 'dim'))
    folders.forEach(function (f, i) {
      var sel = (i + 1) === overlay.cursor // +1 because the download row is index 0
      var marker = sel ? C('❯ ', 'accent') : '  '
      var count = listFilesIn(f).length
      var label = f + '/'
      while (label.length < 16) label += ' '
      body.push('  ' + marker + (sel ? C(label, 'accent') : label) + C('' + count + ' file' + (count === 1 ? '' : 's'), 'dim'))
    })
    var f1 = overlay.toast ? ' ' + overlay.toast : ' enter: open / download   j/k: move   esc: back'
    drawFrame(' Files', body, f1)
    return
  }

  // level 2: files within the selected folder
  var rows = ['+ new file'].concat(overlay.files)
  var b2 = ['', C('  ' + overlay.folder + '/', 'heading', { bold: true }), '']
  rows.forEach(function (name, i) {
    var sel = i === overlay.cursor
    var marker = sel ? C('❯ ', 'accent') : '  '
    b2.push('  ' + marker + (sel ? C(name, 'accent') : name))
  })
  drawFrame(' Files', b2, ' enter: new/edit   j/k: move   esc: folders')
}

function filesKeys (ch, key) {
  // name-entry sub-mode
  if (overlay.naming != null) {
    if (key.name === 'escape') { overlay.naming = null }
    else if (isEnter(key)) {
      var nm = overlay.naming.trim()
      if (nm) {
        var full = path.join(projectRoot(), overlay.folder, nm)
        if (!fileExists(full)) { try { fs.writeFileSync(full, '') } catch (e) {} }
        return openFileEditor(full, overlay.folder)
      }
      overlay.naming = null
    }
    else if (key.name === 'backspace') { overlay.naming = overlay.naming.slice(0, -1) }
    else if (ch && ch.length === 1 && ch >= ' ' && ch !== '\r' && ch !== '\n') { overlay.naming += ch }
    return draw()
  }

  // level 1: folder list (index 0 is the "download starter" row)
  if (overlay.folder == null) {
    var folders = projectFolders()
    var last = folders.length // download row at 0, folders at 1..folders.length
    if (key.name === 'escape' || ch === 'q') { openMenu() }
    else if (key.name === 'j' || key.name === 'down') overlay.cursor = Math.min(overlay.cursor + 1, last)
    else if (key.name === 'k' || key.name === 'up') overlay.cursor = Math.max(overlay.cursor - 1, 0)
    else if (isEnter(key)) {
      if (overlay.cursor === 0) { return downloadStarter() } // download starter project
      var f = folders[overlay.cursor - 1]
      if (f) { overlay.folder = f; overlay.files = listFilesIn(f); overlay.cursor = 0 }
    }
    return draw()
  }

  // level 2: files in a folder
  var rows = ['+ new file'].concat(overlay.files)
  if (key.name === 'escape' || ch === 'q') { overlay.folder = null; overlay.cursor = 0 }
  else if (key.name === 'j' || key.name === 'down') overlay.cursor = Math.min(overlay.cursor + 1, rows.length - 1)
  else if (key.name === 'k' || key.name === 'up') overlay.cursor = Math.max(overlay.cursor - 1, 0)
  else if (isEnter(key)) {
    if (overlay.cursor === 0) { overlay.naming = ''; return draw() } // + new file
    return openFileEditor(path.join(projectRoot(), overlay.folder, rows[overlay.cursor]), overlay.folder)
  }
  draw()
}

// Edit an arbitrary file (not a deck) in the modeless editor, returning to the
// Files list (in the same folder) on quit.
var fileEditPath = null
var fileEditFolder = null
function openFileEditor (full, folder) {
  fileEditPath = full
  fileEditFolder = folder || null
  mode = 'fileedit'
  var text = ''
  try { text = fs.readFileSync(full, 'utf-8') } catch (e) {}
  editor = new Editor(text, function (t) { fs.writeFileSync(full, t) })
  draw()
}

function drawFileEditor () {
  var view = editor.view(termRows() - 3, termCols() - 2)
  var body = [''].concat(view.lines)
  var loc = (fileEditFolder ? fileEditFolder + '/' : '') + path.basename(fileEditPath)
  var titleBar = ' FILE  ' + loc + (editor.dirty ? '  ●' : '')
  drawFrame(titleBar, body, ' ' + editor.modeLabel())
}

function fileEditKeys (ch, key) {
  var result = editor.key(ch, key)
  if (result === 'quit-edit') {
    openFiles()
    if (fileEditFolder) { overlay.folder = fileEditFolder; overlay.files = listFilesIn(fileEditFolder) }
  }
  draw()
}

// Tutorial: open the bundled intro deck if present, else just note its absence.
function menuTutorial () {
  var intro = path.join(decksRoot(), 'intro.md')
  if (fileExists(intro)) { loadDeck(intro, false); mode = 'present' }
  else { openMenu() } // no tutorial deck nearby; stay on the menu
  draw()
}

// ---------------------------------------------------------------------------
// Redraw dispatcher
// ---------------------------------------------------------------------------

// Tell the host page when we enter or leave the menu, so it can overlay the
// PNG logo on the home screen (the terminal itself can't render images). Uses
// the same xdg-open sentinel channel as upload; fires only on transitions.
var lastScreenSignal = null
function signalScreen () {
  var screen = (mode === 'menu') ? 'sloth:menu' : 'sloth:deck'
  if (screen === lastScreenSignal) return
  lastScreenSignal = screen
  try { cp.spawn('xdg-open', [screen], { stdio: 'ignore', detached: true }).unref() } catch (e) {}
}

function draw () {
  signalScreen()
  switch (mode) {
    case 'menu': return drawMenu()
    case 'upload': return drawUpload()
    case 'run': return drawRun()
    case 'files': return drawFiles()
    case 'fileedit': return drawFileEditor()
    case 'controls': return drawControls()
    case 'template': return drawTemplates()
    case 'presenter': return drawPresenter()
    case 'present': return drawPresent()
    case 'toc': return drawToc()
    case 'search': return drawSearch()
    case 'graph': return drawGraph()
    case 'browse': return drawBrowse()
    case 'edit': return drawEditor()
    case 'wizard': return drawWizard()
    case 'themepick': return drawThemePicker()
    case 'theme': return drawThemeEditor()
  }
}

// ---------------------------------------------------------------------------
// Input handling, dispatched per mode.
// ---------------------------------------------------------------------------

process.stdin.setRawMode(true)
process.stdin.resume()

// Coalesce stdin into complete key chunks before keypress parses them. If a
// read ends with an incomplete escape sequence (a lone ESC, or ESC[ with no
// final letter yet), hold it and prepend it to the next read. A short timer
// flushes a dangling ESC so pressing Escape on its own still registers.
var pending = ''
var escTimer = null

function looksIncomplete (s) {
  if (s.length === 0) return false
  var esc = s.lastIndexOf('\x1b')
  if (esc === -1) return false
  var tail = s.slice(esc)
  // a finished sequence ends in a letter or ~ ; if the tail is just ESC, ESC[,
  // ESC O, or ESC[<digits/;> with no final byte, it is still incomplete
  if (tail === '\x1b' || tail === '\x1b[' || tail === '\x1bO') return true
  if (/^\x1b\[[0-9;]*$/.test(tail)) return true
  return false
}

function feed (chunk) {
  var s = pending + chunk
  pending = ''
  if (escTimer) { clearTimeout(escTimer); escTimer = null }
  if (looksIncomplete(s)) {
    // hold from the last ESC onward; forward anything before it now
    var esc = s.lastIndexOf('\x1b')
    if (esc > 0) keyStream.write(s.slice(0, esc))
    pending = s.slice(esc)
    // flush a lone ESC after a short wait so Escape-by-itself still works
    escTimer = setTimeout(function () {
      if (pending) { keyStream.write(pending); pending = '' }
    }, 40)
    return
  }
  keyStream.write(s)
}

process.stdin.on('data', function (buf) { feed(buf.toString('utf-8')) })

keyStream.on('keypress', function (ch, key) {
  key = key || {}

  // global quit
  if (key.ctrl && key.name === 'c') { return quit() }

  if (mode === 'menu') return menuKeys(ch, key)
  if (mode === 'upload') return uploadKeys(ch, key)
  if (mode === 'run') return runKeys(ch, key)
  if (mode === 'files') return filesKeys(ch, key)
  if (mode === 'fileedit') return fileEditKeys(ch, key)
  if (mode === 'controls') return controlsKeys(ch, key)
  if (mode === 'template') return templateKeys(ch, key)
  if (mode === 'presenter') return presenterKeys(ch, key)
  if (mode === 'edit') return editKeys(ch, key)
  if (mode === 'toc') return tocKeys(ch, key)
  if (mode === 'search') return searchKeys(ch, key)
  if (mode === 'browse') return browseKeys(ch, key)
  if (mode === 'graph') return graphKeys(ch, key)
  if (mode === 'themepick') return themePickerKeys(ch, key)
  if (mode === 'wizard') return wizardKeys(ch, key)
  if (mode === 'theme') return themeKeys(ch, key)
  return presentKeys(ch, key)
})

// keypress names Return 'enter' (sequence \r or \n); some terminals say
// 'return'. Match every form so Enter works in the Pod's browser terminal.
function isEnter (key) {
  return key.name === 'enter' || key.name === 'return' ||
    key.sequence === '\r' || key.sequence === '\n'
}

function presentKeys (ch, key) {
  var name = key.name

  // Multi-digit slide-jump prompt (started by the 'jump' action). While active,
  // digits accumulate; it commits on Enter or at 3 digits, Esc/anything else
  // cancels.
  if (jumpBuf != null) {
    if (isEnter(key)) { commitJump(); return draw() }
    if (key.name === 'escape') { jumpBuf = null; return draw() }
    if (ch && /[0-9]/.test(ch)) {
      jumpBuf += ch
      if (jumpBuf.length >= 3) { commitJump(); return draw() }
      return draw()
    }
    // a single digit 1-9 with no prompt is handled below; anything else cancels
    jumpBuf = null
    return draw()
  }

  // Fixed navigation conveniences, always active regardless of custom bindings.
  if (name === 'escape') return (openMenu(), draw())
  if (name === 'right' || name === 'pagedown' || name === 'space' || isEnter(key)) { nextStepOrSlide(); return draw() }
  if (name === 'left' || name === 'pageup' || name === 'backspace') { prevStepOrSlide(); return draw() }
  if (name === 'j') { slideIndex++; revealCount = 0; clampSlide(); return draw() }
  if (name === 'k') { slideIndex--; revealCount = 0; clampSlide(); return draw() }
  if (name === 'home') { slideIndex = 0; revealCount = 0; return draw() }
  if (name === 'end') { slideIndex = deck.slides.length - 1; revealCount = 0; return draw() }

  // A bare digit 1-9 jumps to that slide directly (single-digit shortcut).
  if (ch >= '1' && ch <= '9') { slideIndex = Math.min(+ch - 1, deck.slides.length - 1); revealCount = 0; return draw() }

  // Everything else goes through the configurable bindings.
  var action = controls.actionFor(ch)
  if (!action) return
  doPresentAction(action)
}

// jumpBuf holds the digits typed after the jump key, or null when inactive.
var jumpBuf = null

// The currently-bound key for an action (for footer hints).
function keyFor (action) {
  var list = controls.list()
  for (var i = 0; i < list.length; i++) if (list[i].action === action) return list[i].key
  return '?'
}

function commitJump () {
  var n = parseInt(jumpBuf, 10)
  jumpBuf = null
  if (!isNaN(n) && n >= 1) { slideIndex = Math.min(n - 1, deck.slides.length - 1); revealCount = 0 }
}

function doPresentAction (action) {
  switch (action) {
    case 'next': nextStepOrSlide(); break
    case 'prev': prevStepOrSlide(); break
    case 'first': slideIndex = 0; revealCount = 0; break
    case 'last': slideIndex = deck.slides.length - 1; revealCount = 0; break
    case 'run': if (slideHasRun(curSlide())) { runSlide() } ; return draw()
    case 'reload': loadDeck(deck.file, false); break
    case 'toc': openToc(); return draw()
    case 'search': openSearch(); return draw()
    case 'open': openBrowse(); return draw()
    case 'edit': openEditor(); return draw()
    case 'map': openGraph(); return draw()
    case 'notes': showNotes = !showNotes; break
    case 'theme': cycleTheme(); break
    case 'config': openThemePicker('present'); return draw()
    case 'jump': jumpBuf = ''; break
    case 'followLink': return followLink(0)
    case 'back': return goBack()
    case 'menu': openMenu(); return draw()
    default: return
  }
  draw()
}

function themeKeys (ch, key) {
  var roles = overlay.roles
  var role = roles[overlay.cursor]

  // Hex entry sub-mode: collect up to 6 hex digits, enter applies, esc cancels.
  if (overlay.hex != null) {
    if (key.name === 'escape') { overlay.hex = null }
    else if (isEnter(key)) {
      if (overlay.hex.length === 6) { theme[role] = '#' + overlay.hex.toLowerCase(); overlay.saved = false }
      overlay.hex = null
    }
    else if (key.name === 'backspace') { overlay.hex = overlay.hex.slice(0, -1) }
    else if (ch && /[0-9a-fA-F]/.test(ch) && overlay.hex.length < 6) { overlay.hex += ch }
    return draw()
  }

  if (key.name === 'escape' || ch === 'q') {
    // returning to the picker rebuilds its list state; elsewhere just switch mode
    if (overlay.back === 'themepick') return (openThemePicker('menu'), draw())
    mode = overlay.back
  }
  else if (key.name === 'j' || key.name === 'down') { overlay.cursor = Math.min(overlay.cursor + 1, roles.length - 1); overlay.saved = false }
  else if (key.name === 'k' || key.name === 'up') { overlay.cursor = Math.max(overlay.cursor - 1, 0); overlay.saved = false }
  else if (key.name === 'right' || ch === 'l') { theme[role] = themes.nextColor(theme[role]); overlay.saved = false }
  else if (key.name === 'left' || ch === 'h') { theme[role] = themes.prevColor(theme[role]); overlay.saved = false }
  else if (ch === '#') { overlay.hex = '' } // begin typing a hex code
  else if (ch === 's') { overlay.saved = themes.save(theme) }
  draw()
}

function followLink (which) {
  var links = curSlide().links
  if (!links.length) return
  var target = links[which] || links[0]
  var all = discoverDecks()
  var match = all.filter(function (f) {
    var base = path.basename(f).replace(/\.(md|markdown)$/i, '').toLowerCase()
    return base === target.toLowerCase()
  })[0]
  if (match) { loadDeck(match, true); draw() }
}

function goBack () {
  if (!history.length) return
  var prev = history.pop()
  deck = parseDeck(prev.file)
  slideIndex = prev.slideIndex
  revealCount = 0
  draw()
}

function tocKeys (ch, key) {
  if (key.name === 'escape' || ch === 'q') { mode = 'present' }
  else if (key.name === 'j' || key.name === 'down') overlay.cursor = Math.min(overlay.cursor + 1, deck.slides.length - 1)
  else if (key.name === 'k' || key.name === 'up') overlay.cursor = Math.max(overlay.cursor - 1, 0)
  else if (isEnter(key)) { slideIndex = overlay.cursor; revealCount = 0; mode = 'present' }
  draw()
}

function searchKeys (ch, key) {
  if (key.name === 'escape') { mode = 'present' }
  else if (isEnter(key)) {
    if (overlay.results.length) { slideIndex = overlay.results[overlay.cursor].slide; revealCount = 0 }
    mode = 'present'
  }
  else if (key.name === 'down') overlay.cursor = Math.min(overlay.cursor + 1, overlay.results.length - 1)
  else if (key.name === 'up') overlay.cursor = Math.max(overlay.cursor - 1, 0)
  else if (key.name === 'backspace') { overlay.query = overlay.query.slice(0, -1); runSearch(overlay.query) }
  else if (ch && ch.length === 1 && ch >= ' ' && ch !== '\r' && ch !== '\n') { overlay.query += ch; runSearch(overlay.query) }
  draw()
}

function browseKeys (ch, key) {
  if (key.name === 'escape' || ch === 'q') { mode = overlay.back }
  else if (key.name === 'j' || key.name === 'down') overlay.cursor = Math.min(overlay.cursor + 1, overlay.files.length - 1)
  else if (key.name === 'k' || key.name === 'up') overlay.cursor = Math.max(overlay.cursor - 1, 0)
  else if (isEnter(key) && overlay.files.length) {
    var chosen = overlay.files[overlay.cursor]
    var intent = overlay.intent
    loadDeck(chosen, true)
    if (intent === 'edit') return openEditor(overlay.back), draw() // quit edit returns where we came from
    if (intent === 'live') return startPresent() // audience-present this deck
    if (intent === 'survey') return openSurveyWizard(), draw() // build a survey for this deck
    mode = 'present'
  }
  draw()
}

function graphKeys (ch, key) {
  if (key.name === 'escape' || ch === 'q' || ch === 'm') { mode = 'present' }
  draw()
}

function editKeys (ch, key) {
  var result = editor.key(ch, key)
  if (result === 'quit-edit') {
    if (editorBack === 'menu') {
      mode = 'menu'
    } else {
      mode = 'present'
      loadDeck(deck.file, false) // re-parse, picking up any saved edits
    }
  }
  draw()
}

function quit () {
  charm.reset()
  charm.cursor(true)
  process.stdout.write('\n')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

charm.cursor(false)
// One-time clear so the first frame starts from a blank screen. Subsequent
// frames overwrite in place (see drawFrame), so this never repeats and cannot
// cause the per-keystroke strobe a clear-every-frame approach would.
process.stdout.write('\x1b[2J\x1b[H')

// With no deck argument, start on the menu (initialises its overlay state).
if (mode === 'menu') openMenu()
draw()

// On resize (e.g. the portal side panel opening shrinks the terminal), clear
// once and repaint, so stale cells from the old grid size don't linger as a
// blank/garbled frame until the next keypress.
process.stdout.on('resize', function () {
  process.stdout.write('\x1b[2J\x1b[H')
  draw()
})
