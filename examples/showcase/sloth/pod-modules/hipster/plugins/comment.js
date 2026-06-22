
//do something else here to inject script for the language of the file.
//for example... 

//  js   is //
//  bash is #
//  ini  is ;

// I spend most of my time editing js, though. 
// so I'll leave that for when it's more important.
// don't comment out empty lines?

function comment (line) {
  return '//' + line
}
function uncomment (line) {
  return isCommented(line) ? line.replace('//', '') : line
}

function isCommented (line) {
  var r =  /^\s*\/\//.test(line) || /^\s*$/.test(line)
  return r
}

module.exports = function (doc, keys) {

  var rc = this.config

  keys.on('keypress', function (ch, key) {

    if('k' == key.name && key.ctrl) {
      if(!doc.marks)
        doc.start().mark().down().mark().up().move()
      var m = doc.marks[0]
      var M = doc.marks[1]
      var from = m.y
      //only indent do not comment the last line if the cursor is at 0
      var to   = M.x || M.y == m.y ? M.y : M.y - 1
      //first decide if we will comment or uncomment.
      //uncomment, if the lines all have comments at the start.
      //else, comment.

      var commented = true
      for(var i = from; i <= to; i++)
        if(!isCommented(doc.lines[i]))
          commented = false

      for(var i = from; i <= to; i++)
        doc.updateLine(i,
          (commented ? uncomment : comment) (doc.lines[i])
        )
    }
  })

}
