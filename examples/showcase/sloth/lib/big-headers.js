// Big headers (mdfried's "headers as Bigger Text").
//
// mdfried renders H1 headers as actual large graphics. Terminals here have no
// guaranteed graphics protocol, so this renders H1 text as a 5-row ASCII
// figure font instead. It degrades gracefully: characters with no glyph fall
// back to their plain form, so nothing is ever dropped.

var themes = require('./themes')

// A compact 5-row uppercase font. Each glyph is 5 strings of equal width.
// Space between glyphs is one column. Lowercase is upcased before lookup.
var H = 5
var FONT = {
  'A': [' ## ', '#  #', '####', '#  #', '#  #'],
  'B': ['### ', '#  #', '### ', '#  #', '### '],
  'C': [' ###', '#   ', '#   ', '#   ', ' ###'],
  'D': ['### ', '#  #', '#  #', '#  #', '### '],
  'E': ['####', '#   ', '### ', '#   ', '####'],
  'F': ['####', '#   ', '### ', '#   ', '#   '],
  'G': [' ###', '#   ', '# ##', '#  #', ' ###'],
  'H': ['#  #', '#  #', '####', '#  #', '#  #'],
  'I': ['###', ' # ', ' # ', ' # ', '###'],
  'J': ['  ##', '   #', '   #', '#  #', ' ## '],
  'K': ['#  #', '# # ', '##  ', '# # ', '#  #'],
  'L': ['#   ', '#   ', '#   ', '#   ', '####'],
  'M': ['#   #', '## ##', '# # #', '#   #', '#   #'],
  'N': ['#  #', '## #', '# ##', '#  #', '#  #'],
  'O': [' ## ', '#  #', '#  #', '#  #', ' ## '],
  'P': ['### ', '#  #', '### ', '#   ', '#   '],
  'Q': [' ## ', '#  #', '#  #', '# ##', ' ###'],
  'R': ['### ', '#  #', '### ', '# # ', '#  #'],
  'S': [' ###', '#   ', ' ## ', '   #', '### '],
  'T': ['#####', '  #  ', '  #  ', '  #  ', '  #  '],
  'U': ['#  #', '#  #', '#  #', '#  #', ' ## '],
  'V': ['#   #', '#   #', '#   #', ' # # ', '  #  '],
  'W': ['#   #', '#   #', '# # #', '## ##', '#   #'],
  'X': ['#  #', ' ## ', ' ## ', ' ## ', '#  #'],
  'Y': ['#   #', ' # # ', '  #  ', '  #  ', '  #  '],
  'Z': ['####', '  # ', ' #  ', '#   ', '####'],
  '0': [' ## ', '#  #', '#  #', '#  #', ' ## '],
  '1': [' # ', '## ', ' # ', ' # ', '###'],
  '2': ['### ', '   #', ' ## ', '#   ', '####'],
  '3': ['### ', '   #', ' ## ', '   #', '### '],
  '4': ['#  #', '#  #', '####', '   #', '   #'],
  '5': ['####', '#   ', '### ', '   #', '### '],
  '6': [' ###', '#   ', '### ', '#  #', ' ## '],
  '7': ['####', '   #', '  # ', ' #  ', ' #  '],
  '8': [' ## ', '#  #', ' ## ', '#  #', ' ## '],
  '9': [' ## ', '#  #', ' ###', '   #', '### '],
  '!': ['#', '#', '#', ' ', '#'],
  '?': ['### ', '   #', ' ## ', '    ', ' #  '],
  '.': ['  ', '  ', '  ', '  ', '##'],
  ',': ['  ', '  ', '  ', '##', ' #'],
  ':': ['  ', '##', '  ', '##', '  '],
  '-': ['    ', '    ', '####', '    ', '    '],
  '+': ['   ', ' # ', '###', ' # ', '   '],
  '/': ['   #', '  # ', ' #  ', '#   ', '#   '],
  '&': [' ## ', '#  #', ' ## ', '#  #', ' ###'],
  "'": ['#', '#', ' ', ' ', ' '],
  ' ': ['  ', '  ', '  ', '  ', '  ']
}

function glyph (ch) {
  return FONT[ch] || FONT[ch.toUpperCase()] || null
}

// Render `text` as themed ASCII-art strings. `scale` (default 1) enlarges the
// glyphs: each cell becomes `scale` columns wide and each row is repeated
// `scale` times, so scale 2 gives a chunky 10-row wordmark. If a line would
// overflow `maxWidth` it falls back to a single bold line.
module.exports.render = function (text, theme, maxWidth, scale) {
  maxWidth = maxWidth || (process.stdout.columns || 80) - 6
  scale = scale || 1

  // strip inline markdown markers for the big render
  var plain = text.replace(/[*_`#]/g, '').trim()

  var rows = ['', '', '', '', '']
  var width = 0
  var renderable = true

  for (var i = 0; i < plain.length; i++) {
    var g = glyph(plain[i])
    if (!g) { renderable = false; break }
    var gw = g[0].length
    // each glyph column is widened by `scale`, plus one space gap (also scaled)
    if (width + (gw + 1) * scale > maxWidth) { renderable = false; break }
    for (var r = 0; r < H; r++) {
      rows[r] += widen(g[r], scale) + ' '.repeat(scale)
    }
    width += (gw + 1) * scale
  }

  if (!renderable) {
    // graceful fallback: plain bold heading in the theme's big colour
    return [themes.paint(text.replace(/[*_`#]/g, ''), theme.big, { bold: true })]
  }

  // widen rows already done; now repeat each row `scale` times vertically and
  // paint with a block glyph for '#', in the theme's big colour (named or hex).
  var out = []
  rows.forEach(function (row) {
    var painted = themes.paint(row.replace(/#/g, '█'), theme.big)
    for (var s = 0; s < scale; s++) out.push(painted)
  })
  return out
}

// Repeat every character of `s` `n` times (horizontal scale).
function widen (s, n) {
  if (n <= 1) return s
  var out = ''
  for (var i = 0; i < s.length; i++) out += s[i].repeat(n)
  return out
}
