// SLOTH project convention.
//
// A SLOTH project is a folder a user lays out in any editor (Obsidian, etc.),
// then uploads and runs. It has a fixed set of subfolders:
//
//   content/       .md decks
//   media/         images, video, audio
//   attachments/   downloadable files
//   snippets/      inline runnable code
//   repositories/  full apps to run on portals
//   config/        readable project config
//   data/          survey results, written locally
//
// SLOTH does not manage projects; it just reads this convention. Given an open
// deck, it walks up the directory tree to find the project root (the nearest
// ancestor that contains any of these folders), and resolves references against
// it. Everything stays on the Pod filesystem; nothing leaves the browser.

var fs = require('fs')
var path = require('path')

var FOLDERS = ['content', 'media', 'attachments', 'snippets', 'repositories', 'config', 'data']

function isDir (p) {
  try { return fs.statSync(p).isDirectory() } catch (e) { return false }
}

function hasAnyFolder (dir) {
  for (var i = 0; i < FOLDERS.length; i++) {
    if (isDir(path.join(dir, FOLDERS[i]))) return true
  }
  return false
}

// Find the project root for a deck: the nearest ancestor (including the deck's
// own dir) that contains one of the known folders. Falls back to the deck's
// directory when no convention folders are found (a loose, single-file deck).
module.exports.rootFor = function (deckFile) {
  if (!deckFile) return path.resolve('.')
  var dir = path.dirname(path.resolve(deckFile))
  var seen = dir
  for (var hops = 0; hops < 6; hops++) {
    if (hasAnyFolder(dir)) return dir
    var parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return seen // no convention folders; the deck's own dir is the root
}

// Absolute path to a project folder (may not exist).
module.exports.folder = function (root, name) {
  return path.join(root, name)
}

module.exports.folders = function () { return FOLDERS.slice() }

// Resolve a reference (as written in a deck) to an absolute path. A bare name
// with no slash is looked up in `defaultFolder` first (e.g. an image name in
// media/), then relative to the deck dir. A path with a slash resolves relative
// to the project root, then the deck dir.
module.exports.resolve = function (root, deckDir, ref, defaultFolder) {
  ref = String(ref).trim()
  var candidates = []
  if (ref.indexOf('/') === -1 && defaultFolder) {
    candidates.push(path.join(root, defaultFolder, ref))
  }
  candidates.push(path.join(root, ref))
  candidates.push(path.join(deckDir, ref))
  for (var i = 0; i < candidates.length; i++) {
    try { fs.statSync(candidates[i]); return candidates[i] } catch (e) {}
  }
  // nothing found; return the most likely intended path for error messages
  return candidates[0]
}

// Scaffold the folder structure under `root` (used when creating a project).
module.exports.scaffold = function (root) {
  FOLDERS.forEach(function (name) {
    try { fs.mkdirSync(path.join(root, name), { recursive: true }) } catch (e) {}
  })
}
