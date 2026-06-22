
// here is where we actually enter characters into the
// text.
//
// A relatively small part of what a text editor actually does.

module.exports = function (doc, keys, cursor) {
  keys.on('keypress', function (ch, key) {

    console.error(key)

    if(key.shift && key.name.length === 1)
      key.name = key.name.toUpperCase()

    if     (key.name == 'delete') {
      if(doc.marks) doc.clearMarked()
      else if(key.ctrl) doc.mark().next().mark().clearMarked()
      else          doc.delete(1)
    }
    else if(key.name == 'backspace') {
      if(doc.marks) doc.clearMarked()
      //quirk in keypress... TODO should make fix.
      else if(key.ctrl || key.sequence == '\b') doc.mark().prev().mark().clearMarked()
      else          doc.delete(-1)
    }
    else if(key.name == 'tab')       doc.write('  ') 
    else if(key.name == 'enter')     doc.clearMarked().newline()
    else if(' ' <= ch && ch <= '~')  doc.clearMarked().write(ch)
  })
}
