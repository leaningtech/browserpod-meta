// QR encoding for the phone clicker. Uses the proven, MIT-licensed
// qrcode-generator (Kazuhiko Arase), vendored into the Pod as
// ./qrcode-generator.js, so the codes actually scan. We keep only the terminal
// rendering (half-block characters) on top of it.

var qrcode = require('./qrcode-generator.cjs')

// Encode `text` to a boolean matrix (true = dark module). Auto-sizes the QR
// (type 0) at error-correction level L, which fits a URL comfortably.
function encode (text) {
  try {
    var qr = qrcode(0, 'L')
    qr.addData(String(text))
    qr.make()
    var n = qr.getModuleCount()
    var m = []
    for (var r = 0; r < n; r++) {
      var row = []
      for (var c = 0; c < n; c++) row.push(qr.isDark(r, c))
      m.push(row)
    }
    return m
  } catch (e) {
    return null
  }
}

// Render a boolean matrix as terminal lines using half-block characters so the
// QR is roughly square (two module rows per text row). A 2-module quiet zone is
// added around it, which scanners need.
function render (matrix) {
  if (!matrix) return ['(QR unavailable)']
  var q = 2
  var size = matrix.length + q * 2
  function on (r, c) {
    var rr = r - q; var cc = c - q
    if (rr < 0 || cc < 0 || rr >= matrix.length || cc >= matrix.length) return false
    return matrix[rr][cc]
  }
  var lines = []
  for (var r = 0; r < size; r += 2) {
    var line = ''
    for (var c = 0; c < size; c++) {
      var top = on(r, c)
      var bot = (r + 1 < size) ? on(r + 1, c) : false
      if (top && bot) line += '█'
      else if (top) line += '▀'
      else if (bot) line += '▄'
      else line += ' '
    }
    lines.push(line)
  }
  return lines
}

module.exports = { encode: encode, render: render }
