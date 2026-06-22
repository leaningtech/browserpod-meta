
//apply indentation!

function indent (line) {
  return /^\s*$/.test(line) ? line : '  ' + line
}

function deindent (line) {
  var l = /^\s*/.exec(line)[0].length
  return line.substring(l > 1 ? 2 : l)
}

module.exports = function (doc, keys) {

  var rc = this.config

  keys.on('keypress', function (ch, key) {

    if(key.name !== 'tab') return

    // apply indentation to selected lines.
    if(doc.marks) {
      console.error('INDENT SELECTION')
      var m = doc.marks[0]
      var M = doc.marks[1]

      for(var i = m.y; i <= M.y; i++) {
        doc.updateLine(i, 
          (key.shift ? deindent : indent) (doc.lines[i])
        )
      }
    
    }
    else {
      //pad current line to an even number of spaces.
      var m 
      var i = (m = /^[ \t]*/.exec(doc.line()))[0].length
      console.error('INDENT SINGLE LINE', i, m)

      //only indentation if we are at the start of the line.
      //else allow entry to insert spaces!
      if(i < doc.column) return

      doc.pos(i, doc.row) //move to the end of the indentation.
              
      if(!key.shift)
        doc.write(i % 2 ? ' ' : '  ')
      else  if(i) doc.delete(i % 2 ? -1 : -2)

      // add spaces.
//      else
//        doc.updateLine(doc.row, (i % 2 ? ' ' : '  ') + doc.line())

//      doc.move()//something is putting the cursor in the wrong place.
    }

    //Refactor this when there is another command that needs to veto something.
    //vvv TOTALLY HIDEOUS WAY TO PREVENT OTHER COMMANDS TRIGGERING.
     key.name = 'VETOED'
  })
}

