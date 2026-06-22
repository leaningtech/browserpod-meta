// ANSI-aware word wrap (glow's -w behaviour).
//
// Wraps a styled line to `width` visible columns without splitting inside an
// escape sequence. Leading indentation is preserved on continuation lines so
// wrapped list items and quotes stay aligned.

var ANSI = /\[[0-9;]*m/g

function visibleLength (s) {
  return s.replace(ANSI, '').length
}

function leadingSpace (s) {
  var m = /^(\s*)/.exec(s.replace(ANSI, ''))
  return m ? m[1] : ''
}

module.exports = function wrap (line, width) {
  if (width < 4) width = 4
  if (visibleLength(line) <= width) return [line]

  var indent = leadingSpace(line)
  var words = line.split(/(\s+)/) // keep separators so styling stays intact
  var out = []
  var cur = ''
  var curLen = 0

  function flush () {
    if (cur.length) out.push(cur)
    cur = indent
    curLen = indent.length
  }

  words.forEach(function (w) {
    if (w === '') return
    var wl = visibleLength(w)
    if (/^\s+$/.test(w)) {
      // whitespace: only keep if we are mid-line
      if (curLen > indent.length) { cur += w; curLen += wl }
      return
    }
    if (curLen + wl > width && curLen > indent.length) {
      flush()
    }
    // a single word longer than width: hard-break it
    if (wl > width) {
      var plain = w
      while (visibleLength(plain) > width) {
        out.push(indent + plain.slice(0, width - indent.length))
        plain = plain.slice(width - indent.length)
      }
      cur = indent + plain
      curLen = indent.length + visibleLength(plain)
      return
    }
    cur += w
    curLen += wl
  })
  if (cur.replace(ANSI, '').trim().length || out.length === 0) out.push(cur)
  return out
}

module.exports.visibleLength = visibleLength
