// ASCII link graph (ekphos's graph view).
//
// Builds a directed graph of decks connected by [[wikilink]] references and
// renders it as an indented adjacency listing. The current deck is marked, and
// each node shows what it links out to. This is the terminal-friendly stand-in
// for ekphos's visual graph: no canvas, just a readable map.

var fs = require('fs')
var path = require('path')

function deckName (file) {
  return path.basename(file).replace(/\.(md|markdown)$/i, '')
}

// Read just the [[links]] out of a file without a full parse.
function linksOf (file) {
  var links = []
  var text
  try { text = fs.readFileSync(file, 'utf-8') } catch (e) { return links }
  var re = /\[\[([^\]]+)\]\]/g
  var m
  while ((m = re.exec(text))) links.push(m[1].trim().toLowerCase())
  return links
}

// deck: the currently-open parsed deck. allFiles: every nearby .md path.
module.exports.render = function (deck, allFiles, width) {
  var nodes = {}
  allFiles.forEach(function (f) {
    nodes[deckName(f).toLowerCase()] = { name: deckName(f), file: f, out: linksOf(f) }
  })

  // make sure the current deck is present even if it lives elsewhere
  var curKey = deckName(deck.file).toLowerCase()
  if (!nodes[curKey]) {
    nodes[curKey] = { name: deckName(deck.file), file: deck.file, out: [] }
    deck.slides.forEach(function (s) {
      s.links.forEach(function (l) { nodes[curKey].out.push(l.toLowerCase()) })
    })
  }

  var keys = Object.keys(nodes).sort()
  if (!keys.length) return ['(no decks found)']

  // compute incoming counts for a small "popularity" hint
  var incoming = {}
  keys.forEach(function (k) {
    nodes[k].out.forEach(function (t) { incoming[t] = (incoming[t] || 0) + 1 })
  })

  var lines = []
  keys.forEach(function (k) {
    var n = nodes[k]
    var here = k === curKey ? ' ◀ here' : ''
    var inb = incoming[k] ? '  (' + incoming[k] + ' in)' : ''
    lines.push((k === curKey ? '● ' : '○ ') + n.name + here + inb)
    var outs = n.out.filter(function (t, i, a) { return a.indexOf(t) === i })
    outs.forEach(function (t, i) {
      var branch = i === outs.length - 1 ? '└─▶ ' : '├─▶ '
      var dangling = nodes[t] ? '' : '  (missing)'
      lines.push('   ' + branch + t + dangling)
    })
    if (!outs.length) lines.push('   └─ (no outgoing links)')
    lines.push('')
  })

  // clip to width
  return lines.map(function (l) { return l.length > width ? l.slice(0, width) : l })
}
