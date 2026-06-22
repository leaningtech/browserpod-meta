// Configurable key bindings for present mode.
//
// Each action has a single rebindable key (its "primary" key, a printable
// character). The fixed navigation conveniences in sloth.js (arrow keys, space,
// page up/down, home/end, Enter) are always active and are not part of this
// map, so remapping can never strand the basic next/prev controls.
//
// Bindings load from controls.json next to the deck (or $SLOTH_CONTROLS_FILE),
// merged over the defaults, and the Controls editor saves back here.

var fs = require('fs')
var path = require('path')

// action -> { key, label }. Order is the order shown in the editor.
var DEFAULTS = [
  { action: 'next', key: 'l', label: 'next slide / reveal' },
  { action: 'prev', key: 'h', label: 'previous slide / reveal' },
  { action: 'first', key: 'g', label: 'first slide' },
  { action: 'last', key: 'G', label: 'last slide' },
  { action: 'run', key: 'r', label: 'run this slide\'s code' },
  { action: 'reload', key: 'R', label: 'reload deck from disk' },
  { action: 'toc', key: 't', label: 'table of contents' },
  { action: 'search', key: '/', label: 'search the deck' },
  { action: 'open', key: 'o', label: 'open another deck' },
  { action: 'edit', key: 'e', label: 'edit this deck' },
  { action: 'map', key: 'm', label: 'link map' },
  { action: 'notes', key: 'n', label: 'toggle speaker notes' },
  { action: 'theme', key: 'T', label: 'cycle theme' },
  { action: 'config', key: 'c', label: 'configure theme' },
  { action: 'jump', key: '-', label: 'jump to slide number' },
  { action: 'followLink', key: ']', label: 'follow wikilink' },
  { action: 'back', key: '[', label: 'back (history)' },
  { action: 'menu', key: 'q', label: 'back to menu' }
]

var bindings = clone(DEFAULTS)
var configPath = null

function clone (o) { return JSON.parse(JSON.stringify(o)) }

function resolvePath (deckFile) {
  if (process.env.SLOTH_CONTROLS_FILE) return process.env.SLOTH_CONTROLS_FILE
  if (deckFile) return path.join(path.dirname(deckFile), 'controls.json')
  return path.resolve('controls.json')
}

// Load controls.json (a flat { action: key } map), merged over defaults.
module.exports.load = function (deckFile) {
  configPath = resolvePath(deckFile)
  bindings = clone(DEFAULTS)
  try {
    var cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    bindings.forEach(function (b) {
      if (typeof cfg[b.action] === 'string' && cfg[b.action]) b.key = cfg[b.action]
    })
  } catch (e) { /* no config; defaults stand */ }
  return module.exports
}

// Persist the current bindings as { action: key }.
module.exports.save = function () {
  if (!configPath) configPath = resolvePath(null)
  var out = {}
  bindings.forEach(function (b) { out[b.action] = b.key })
  try {
    fs.writeFileSync(configPath, JSON.stringify(out, null, 2) + '\n')
    return true
  } catch (e) { return false }
}

module.exports.list = function () { return bindings }
module.exports.configPath = function () { return configPath }

// The action bound to a given character, or null.
module.exports.actionFor = function (ch) {
  if (ch == null) return null
  for (var i = 0; i < bindings.length; i++) {
    if (bindings[i].key === ch) return bindings[i].action
  }
  return null
}

// Set an action's key. Returns false if that key is already used by another
// action (no duplicate bindings).
module.exports.rebind = function (action, key) {
  for (var i = 0; i < bindings.length; i++) {
    if (bindings[i].key === key && bindings[i].action !== action) return false
  }
  for (var j = 0; j < bindings.length; j++) {
    if (bindings[j].action === action) { bindings[j].key = key; return true }
  }
  return false
}
