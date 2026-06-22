// A plain, modeless text editor.
//
// Most people don't want vim. You open this, you type. Arrow keys move,
// Enter splits a line, Backspace/Delete remove characters, Home/End jump to
// the line ends. There are no modes to get stuck in.
//
// Save and quit go through Esc, because the browser swallows Ctrl-S (save
// page), Ctrl-W (close tab) and friends before the terminal ever sees them.
// Esc opens a small action bar: S save, Q quit, R resume editing.
//
//   normal editing : type / arrows / Enter / Backspace / Delete / Home / End
//   Esc            : open the action bar
//   action bar     : s = save, q = quit (asks if unsaved), r / Esc = resume

// keypress names Return 'enter' (sequence \r or \n); some terminals say
// 'return'. Accept every form.
function isEnter (key) {
  return key.name === 'enter' || key.name === 'return' ||
    key.sequence === '\r' || key.sequence === '\n'
}

function Editor (text, onSave) {
  this.lines = text.split('\n')
  if (!this.lines.length) this.lines = ['']
  this.cx = 0
  this.cy = 0
  this.top = 0
  this.dirty = false
  this.onSave = onSave
  // bar: null when editing, otherwise the action bar state.
  //   { confirmQuit: bool }  confirmQuit asks before discarding unsaved edits
  this.bar = null
  this.flash = '' // transient message shown in the status line (e.g. "saved")
}

Editor.prototype.clamp = function () {
  if (this.cy < 0) this.cy = 0
  if (this.cy >= this.lines.length) this.cy = this.lines.length - 1
  // modeless: the cursor may sit one past the last character (insert point)
  var max = this.lines[this.cy].length
  if (this.cx > max) this.cx = max
  if (this.cx < 0) this.cx = 0
}

Editor.prototype.gotoFraction = function (f) {
  this.cy = Math.floor(f * this.lines.length)
  this.cx = 0
  this.clamp()
}

Editor.prototype.modeLabel = function () {
  if (this.flash) return this.flash
  if (this.bar) {
    if (this.bar.confirmQuit) return 'Discard unsaved changes?  y: discard   n: keep editing'
    return 'Esc menu:   s: save   q: quit   r: resume editing'
  }
  return (this.dirty ? '● ' : '') + 'Ln ' + (this.cy + 1) + ', Col ' + (this.cx + 1) +
    '    Esc: menu'
}

// Returns a viewport: { lines: [...] } sized to rows x cols, cursor marked.
Editor.prototype.view = function (rows, cols) {
  if (this.cy < this.top) this.top = this.cy
  if (this.cy >= this.top + rows) this.top = this.cy - rows + 1

  var out = []
  for (var i = this.top; i < this.top + rows && i < this.lines.length; i++) {
    var ln = this.lines[i]
    var num = (' ' + (i + 1)).slice(-4) + ' '
    if (i === this.cy && !this.bar) {
      // render the cursor as an inverse cell (hidden while the bar is open)
      var before = ln.slice(0, this.cx)
      var at = ln.slice(this.cx, this.cx + 1) || ' '
      var after = ln.slice(this.cx + 1)
      ln = before + at.inverse + after
    }
    var line = (num.grey + ln)
    out.push(line.length > cols + 12 ? line.slice(0, cols + 12) : line)
  }
  return { lines: out }
}

// Process a key. Returns 'quit-edit' when the editor should be left.
Editor.prototype.key = function (ch, key) {
  key = key || {}
  this.flash = '' // any keypress clears a transient message
  if (this.bar) return this.barKey(ch, key)
  return this.editKey(ch, key)
}

// The Esc action bar.
Editor.prototype.barKey = function (ch, key) {
  if (this.bar.confirmQuit) {
    if (ch === 'y') return 'quit-edit'
    // anything else cancels the discard prompt and resumes editing
    this.bar = null
    return
  }
  if (ch === 's') {
    this.save()
    this.bar = null
    this.flash = 'saved'
    return
  }
  if (ch === 'q') {
    if (this.dirty) { this.bar = { confirmQuit: true }; return }
    return 'quit-edit'
  }
  // r, Esc, or anything else: resume editing
  this.bar = null
}

// Modeless editing.
Editor.prototype.editKey = function (ch, key) {
  var name = key.name
  var l = this.lines[this.cy]

  if (name === 'escape') { this.bar = { confirmQuit: false }; return }

  // movement
  if (name === 'left') { this.cx-- ; return this.clamp() }
  if (name === 'right') { this.cx++ ; return this.clamp() }
  if (name === 'up') { this.cy-- ; return this.clamp() }
  if (name === 'down') { this.cy++ ; return this.clamp() }
  if (name === 'home') { this.cx = 0; return }
  if (name === 'end') { this.cx = l.length; return }
  if (name === 'pageup') { this.cy -= 10; return this.clamp() }
  if (name === 'pagedown') { this.cy += 10; return this.clamp() }

  // Enter: split the line at the cursor
  if (isEnter(key)) {
    var rest = l.slice(this.cx)
    this.lines[this.cy] = l.slice(0, this.cx)
    this.lines.splice(this.cy + 1, 0, rest)
    this.cy++
    this.cx = 0
    this.dirty = true
    return
  }

  // Backspace: delete the char before the cursor, joining lines at column 0
  if (name === 'backspace') {
    if (this.cx > 0) {
      this.lines[this.cy] = l.slice(0, this.cx - 1) + l.slice(this.cx)
      this.cx--
    } else if (this.cy > 0) {
      var prev = this.lines[this.cy - 1]
      this.cx = prev.length
      this.lines[this.cy - 1] = prev + l
      this.lines.splice(this.cy, 1)
      this.cy--
    }
    this.dirty = true
    return
  }

  // Delete: remove the char under the cursor, pulling up the next line at EOL
  if (name === 'delete') {
    if (this.cx < l.length) {
      this.lines[this.cy] = l.slice(0, this.cx) + l.slice(this.cx + 1)
    } else if (this.cy < this.lines.length - 1) {
      this.lines[this.cy] = l + this.lines[this.cy + 1]
      this.lines.splice(this.cy + 1, 1)
    }
    this.dirty = true
    return
  }

  // Tab inserts two spaces (a literal tab is awkward in a slide deck)
  if (name === 'tab') {
    this.lines[this.cy] = l.slice(0, this.cx) + '  ' + l.slice(this.cx)
    this.cx += 2
    this.dirty = true
    return
  }

  // printable character
  if (ch && ch.length === 1 && ch >= ' ') {
    this.lines[this.cy] = l.slice(0, this.cx) + ch + l.slice(this.cx)
    this.cx++
    this.dirty = true
  }
}

Editor.prototype.save = function () {
  if (this.onSave) this.onSave(this.lines.join('\n'))
  this.dirty = false
}

module.exports = Editor
