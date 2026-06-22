var EventEmitter = require('events').EventEmitter
var inherits = require('util').inherits
var words = require('./words')

inherits(Document, EventEmitter)

module.exports = Document

function Document() {
  this.row = this.column = 0
  this.lines = ['\n']
  this.marks = null
}
//compare marked positions
function cmp (m, n) {
  return m.y - n.y === 0 ? m.x - n.x : m.y - n.y
}

function sameLine(m, n) {
  return m.y == n.y
}

var methods = {

  //get line relative to current
  line: function (n) {
    n = n || 0
  return this.lines[this.row + n]
  },

  //set the current line
  setLine: function (val) {
    this.lines[this.row] = val
  },

  //force the column inside the string
  fixColumn: function () {
    var l
    if(this.column + 1 > (l = this.line().length))
      this.column = l - 1
    return this
  },

  //check if cursor is on first line
  isFirstLine: function () {
    return this.row === 0
  },

  //check if cursor is on last line
  isLastLine: function () {
    return this.row + 1 >= this.lines.length
  },

  //check if cursor is at start of line
  isFirst: function () {
    return this.column === 0
  },

  //check if cursor is at end of line
  isLast: function () {
    return this.column + 1 >= this.line().length
  },

  //set cursor position
  pos: function (x, y) {
    this.column = x
    this.row = y
    return this
  },

  //move cursor to end of line
  end: function () {
    this.column = this.line().length - 1
    return this
  },

  //move cursor to start of line
  start: function () {
    this.column = 0
    return this
  },

  //move cursor up a line
  up: function () {
    if(this.row > 0)
      (--this.row, this.fixColumn())
    return this
  },

  //move cursor down a line
  down: function () {
    if(this.row + 1 < this.lines.length) 
      (++this.row, this.fixColumn())
    return this
  },

  //move cursor left
  left: function () {
    if(this.column > 0) --this.column
    return this
  },

  //move cursor to right
  right: function () {
    if(this.column + 1 < this.line().length) ++this.column
    return this
  },

  //move to previous word
  prev: function () {
   var m = words.prev(this.line(), this.column)
    if(m) this.column = m.index
    else if(this.isFirstLine()) this.start()
    else this.up().end()
    return this
  },

  //move to the end of the word
  next: function () {
    var m = words.current(this.line(), this.column)
    if(m) this.column = m.index + m[0].length
    else if(this.isLastLine()) this.end()
    else  this.down().start()
    return this
  },

  //move to prev section (start of non whitespace block)
  prevSection: function () {
    this.up()
    while(! this.isFirstLine() && !/^\s*$/.test(this.line(-1)))
      this.up()
    while(! this.isFirstLine() && /^\s*$/.test(this.line()))
      this.up()
   return this
  },

  //move to next section (start of non whitespace block)
  nextSection: function () {
    this.down()
    while(! this.isLastLine() && /^\s*$/.test(this.line()))
      this.down()
    while(! this.isLastLine() && !/^\s*$/.test(this.line()))
      this.down()
    return this
  },

  //go to the first line
  firstLine: function () { 
    this.row = 0 
    return this
  },

  //go to the last line
  lastLine: function () {
    this.row = this.lines.length - 1
    return this
  },

  //ACTUALLY MOVE THE TERMINAL CURSOR.
  //IMPORTANT.
  move: function () {
    return this._emit('cursor')
  },

   //set a mark, to mark a section just call this twice
  mark: function (x, y) {
    if(x == null && y == null)
      x = this.column, y = this.row

    var mark = {x: x, y: y}

    if(!this.firstMark) this.firstMark =  mark
    this.secondMark = mark

    this.marks = [this.firstMark, this.secondMark].sort(cmp)
    this.emit('mark', this.marks[0], this.marks[1])
    return this
  },

  //remove marks
  unmark: function () {
    console.error('UNMARK', this.marks)
    var old = this.marks
    this.firstMark = this.secondMark = this.marks = null
    if(old)
      this.emit('unmark', old[0], old[1])
    return this
  },

  getMarked: function () {
    if(!this.marks) return null
    var m = this.marks[0], M = this.marks[1]

    if(sameLine(m, M))
      return this.lines[m.y].substring(m.x, M.x)

    var lines = this.lines[m.y].substring(m.x)
    for (var Y = m.y + 1; Y < M.y; Y++) {
      lines += this.lines[Y]
    }
    lines += this.lines[M.y].substring(0, M.x)
    return lines
  },

  clearMarked: function () {
    if(!this.marks) return this
    //basic thing here is delete.
    //I want te remove the current, then replace.
    //maybe I should use the jumprope module from
    //the sharejs guy. would need to be able to fix the lengths
    //though, to lines, or 80 chars, and be able to address by line too.
    if(!this.marks) return null
    var m = this.marks[0], M = this.marks[1]
    this.pos(m.x,m.y)
    if(sameLine(m, M))
      return this.unmark().delete(M.x - m.x)
    
    //get the remainder of the last line
    var last = this.lines[M.y].substring(M.x)
    //get the start of the first line
    var first = this.lines[m.y].substring(0, m.x)
    //delete all the middle lines
    var lines = M.y - m.y
    this.deleteLines(m.y, lines)
    //join the remainers together
    this.pos(m.x,m.y).setLine(first + last)
    console.error('LINE', this.line())
    return this.unmark().move()
  },

  insert: function (lines) {
    var self = this
    lines.split('\n').forEach(function (line, i, lines) {
      self.write(line)
      if(i + 1 < lines.length)
        self.newline()
    })
    return this.move()
  },

  //internal. emit an event with current line and cursor pos.
  _emit: function (m, l) {
    this.emit(m, l || this.line(), this.column + 1, this.row + 1)
    return this
  },
  
  //create a new line under the cursor
  newline: function () {
    var nl, l = this.line()
    this.setLine(l.slice(0, this.column) + '\n')
    this._emit('update_line') 
    this.lines.splice(++this.row, 0, nl = l.slice(this.column))

    //could it be nice to have options to veto stuff?
    this.column = 0
    this._emit('new_line').move()
  },

  //write some data
  write: function (data) { 
    var l = this.line()
    this.setLine(l.slice(0, this.column) + data + l.slice(this.column))
    this.column += data.length
    this._emit('update_line').move()
    return this
  },

  updateLine: function(line, data) {
    this.lines[line] = data
    this.emit('update_line', data, 1, line + 1)
  },

  deleteLines: function (line, lines) {
    this.lines.splice(line, lines)
    while (lines)
      this.emit('delete_line', '', 1, line + (lines --))
    return this
  },

  //delete (+-charsToDelete)
  delete: function (data) {
    data = data == null ? 1 : data
    if(this.isFirst() && data < 0 ) {
      if(this.isFirstLine()) return this
      this.up()
      //we want to be on the first character of what was the
      //next line, so that we delete the \n character
      this.column = this.line().length
      this._emit('delete_line')

      this.lines.splice(this.row, 2, this.line() + this.line(1))
    } else if (this.isLast() && data > 0) {
      if(this.isLastLine()) return this
      this._emit('delete_line')
      this.end()
      this.lines.splice(this.row, 2, this.line() + this.line(+1))
    }
    var nc = this.column + data
    var l = this.line()
    var s = Math.min(this.column, nc)
    var e = Math.max(this.column, nc)
    this.lines[this.row] = 
      l.slice(0, s) + l.slice(e)
    this.column = s
    if(this.line() == '')
      this.deleteLines(this.row, 1)
    else
      this._emit('update_line').move()
    return this
  },

  //delete backwards
  backspace: function (n) {
    return this.delete(-1 * (n || 1))
  }
}




for (var m in methods)
  Document.prototype[m] = methods[m]
