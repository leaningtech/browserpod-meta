// Themes, configurable (ekphos's theme picker, made user-editable).
//
// Built-in themes are the starting point. On top of them, a `theme.json` next
// to the deck (or at $SLOTH_THEME_FILE) can:
//   * override roles of an existing theme, and/or
//   * define entirely new named themes.
//
// Each theme maps roles -> `colors` method names, applied as `string[role]`,
// e.g. `'hi'[theme.accent]`. The editor (mode 'theme' in sloth.js) writes the
// active theme back into theme.json, so changes persist between runs.

var fs = require('fs')
var path = require('path')

// The Gogh terminal themes, generated from Gogh-master by
// scripts/build-gogh-themes.mjs into ./gogh-themes.js (a { key: {role:hex} }
// map). Loaded defensively: if the file is absent, SLOTH still runs with just
// its hand-written built-ins.
var GOGH = {}
try { GOGH = require('./gogh-themes') } catch (e) { GOGH = {} }

// Roles a theme must define. The editor cycles through exactly these.
var ROLES = ['heading', 'accent', 'link', 'code', 'quote', 'bar', 'dim', 'big']

// Named colours we cycle through in the configurator (besides typing a hex).
var PALETTE = [
  'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'grey',
  'inverse'
]

// ANSI foreground codes for the named colours.
var NAMED = {
  black: 30, red: 31, green: 32, yellow: 33, blue: 34, magenta: 35,
  cyan: 36, white: 37, grey: 90, gray: 90
}

var ESC = '\x1b['
var RESET = ESC + '0m'

function isHex (c) {
  return typeof c === 'string' && /^#?[0-9a-fA-F]{6}$/.test(c)
}

function hexToRgb (c) {
  var h = c.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

// Apply a colour (named like 'cyan', or a #rrggbb hex) to text, with optional
// bold/inverse/italic/underline. Hex emits 24-bit truecolor, which xterm.js and
// most terminals support; named colours emit standard ANSI. This is what lets
// theme roles hold arbitrary hex values that `colors` 0.6 could never render.
function paint (text, color, opts) {
  opts = opts || {}
  var codes = []
  if (opts.bold) codes.push('1')
  if (opts.italic) codes.push('3')
  if (opts.underline) codes.push('4')
  if (color === 'inverse' || opts.inverse) {
    codes.push('7')
  } else if (isHex(color)) {
    var rgb = hexToRgb(color)
    codes.push('38;2;' + rgb[0] + ';' + rgb[1] + ';' + rgb[2])
  } else if (NAMED[color] != null) {
    codes.push(String(NAMED[color]))
  }
  if (!codes.length) return text
  return ESC + codes.join(';') + 'm' + text + RESET
}

var BUILTIN = {
  default: {
    name: 'default',
    heading: 'cyan', accent: 'yellow', link: 'blue', code: 'green',
    quote: 'magenta', bar: 'inverse', dim: 'grey', big: 'cyan'
  },
  dracula: {
    name: 'dracula',
    heading: 'magenta', accent: 'green', link: 'cyan', code: 'yellow',
    quote: 'blue', bar: 'inverse', dim: 'grey', big: 'magenta'
  },
  dawn: {
    name: 'dawn',
    heading: 'yellow', accent: 'red', link: 'magenta', code: 'blue',
    quote: 'cyan', bar: 'inverse', dim: 'grey', big: 'yellow'
  },
  mono: {
    name: 'mono',
    heading: 'white', accent: 'white', link: 'underline', code: 'grey',
    quote: 'grey', bar: 'inverse', dim: 'grey', big: 'white'
  }
}

// The base set offered everywhere (get/names/configurator/--theme): the
// hand-written built-ins plus every converted Gogh theme. Built-ins win on a
// name clash so SLOTH's defaults are stable. Each entry carries its own `name`.
function baseThemes () {
  var out = {}
  Object.keys(GOGH).forEach(function (k) {
    var t = Object.assign({}, GOGH[k]); t.name = k; out[k] = t
  })
  Object.keys(BUILTIN).forEach(function (k) {
    out[k] = Object.assign({}, BUILTIN[k]) // built-ins take precedence
  })
  return out
}

// The resolved set: base themes merged with whatever theme.json supplied.
var themes = baseThemes()
var configPath = null

function clone (o) { return JSON.parse(JSON.stringify(o)) }

// Resolve where theme.json lives: explicit env, else alongside the deck.
function resolveConfigPath (deckFile) {
  if (process.env.SLOTH_THEME_FILE) return process.env.SLOTH_THEME_FILE
  if (deckFile) return path.join(path.dirname(deckFile), 'theme.json')
  return path.resolve('theme.json')
}

// Load theme.json, merging onto built-ins. Call once at startup with the deck
// path; safe to call when the file is absent.
module.exports.load = function (deckFile) {
  configPath = resolveConfigPath(deckFile)
  themes = baseThemes()
  try {
    var raw = fs.readFileSync(configPath, 'utf-8')
    var cfg = JSON.parse(raw)
    Object.keys(cfg).forEach(function (name) {
      var base = themes[name] || clone(BUILTIN.default)
      var merged = Object.assign({}, base, cfg[name])
      merged.name = name
      themes[name] = merged
    })
  } catch (e) { /* no config, or invalid; built-ins stand */ }
  return module.exports
}

// Persist a single theme's roles back into theme.json, preserving any other
// themes already defined there. Returns true on success.
module.exports.save = function (theme) {
  if (!configPath) configPath = resolveConfigPath(null)
  var existing = {}
  try { existing = JSON.parse(fs.readFileSync(configPath, 'utf-8')) } catch (e) {}
  var roles = {}
  ROLES.forEach(function (r) { roles[r] = theme[r] })
  existing[theme.name] = roles
  try {
    fs.writeFileSync(configPath, JSON.stringify(existing, null, 2) + '\n')
    themes[theme.name] = Object.assign({ name: theme.name }, roles)
    return true
  } catch (e) { return false }
}

module.exports.get = function (name) {
  return clone(themes[name] || themes.default)
}

module.exports.names = function () {
  return Object.keys(themes)
}

module.exports.roles = function () { return ROLES.slice() }
module.exports.palette = function () { return PALETTE.slice() }
module.exports.configPath = function () { return configPath }
module.exports.paint = paint
module.exports.isHex = isHex

// Advance a role's colour to the next palette entry. If the current value is a
// custom hex it isn't in the palette, so cycling starts from the front.
module.exports.nextColor = function (current) {
  var i = PALETTE.indexOf(current)
  return PALETTE[(i + 1) % PALETTE.length]
}
module.exports.prevColor = function (current) {
  var i = PALETTE.indexOf(current)
  if (i === -1) return PALETTE[PALETTE.length - 1]
  return PALETTE[(i - 1 + PALETTE.length) % PALETTE.length]
}
