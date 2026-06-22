module.exports = function (doc, keys, cursor) {

  var styles = require('../lib/styles')

  //wether or not we are currently selecting text 
  var shift = false

  //we need to intercept after keypress
  //both before and after so that we can
  //select text properly if the keypress
  //has moved the cursor.

  //to achive this, remove all the listeners
  //add our first listener, then readd the listeners
  //then add our last listener.

  var listeners = keys.listeners('keypress')
  keys.removeAllListeners('keypress')

  function startSelection (ch, key) {
    //only start selection if it's a movement key.
    if(/up|down|left|right|pageup|pagedown|home|end/.test(key.name))
      key.movement = true

      //if it's shifted, _and_ they have pressed a directional key...
      if(key.shift && key.movement) {
        if(!shift) doc.unmark()
        shift = true
        doc.mark()
      } else if (shift)
        shift = false
  }

  function endSelection (ch, key) {
    if(key.movement)
      if(key.shift)
        doc.mark().move()
      else  if(/up|down|left|right|pageup|pagedown|home|end/.test(key.name))
        doc.unmark().move()
  }

  keys.on('keypress', startSelection)

  listeners.forEach(function (listener) {
    keys.on('keypress', listener)
  })   

  keys.on('keypress', endSelection)


  this.renderers.push(function (q, x, y) {

    if(doc.marks) {
      console.error(doc.marks, y)
      var m = doc.marks[0]
      var M = doc.marks[1]
      var diff = 0

      //if the match starts and ends on the same line
      if(m.y == M.y && m.y + 1 == y) {
        q.insertAfter (m.x, styles.inverse[0])
        q.insertBefore(M.x, styles.inverse[1])

      }

      //if we are inbetween the first and last matched lines.
      else if(m.y + 1 < y && y < M.y + 1) {

        q.insertAfter (0, styles.inverse[0])
        q.insertBefore(q.toString().length, styles.inverse[1])
      }

      //if this is the first matched line
      else if(m.y + 1 == y) {
        q.insertAfter (m.x, styles.inverse[0])
        q.insertBefore(q.toString().length, styles.inverse[1])
      }

      //if this is the last matched line (but highligh if x=0)
      else if(M.y + 1 == y && M.x){
        //if the first mark is on the same line, adjust for that.
        q.insertAfter (0, styles.inverse[0])
        q.insertBefore(M.x, styles.inverse[1])
      }
    }

  })

}
