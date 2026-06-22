

//var iq = require('insert-queue')
var styles = require('../lib/styles')

var keyword       = /function|if|return|var|while|for|throw|catch|finally|new|typeof/g
var rbrace  = /[\(\)]/g
var sbrace  = /[\[\]]/g
var cbrace  = /[\{\}]/g
var number        = /-?\d+(?:\.\d+)?(?:e-?\d+)?/g
var string        = /('[^']*')|("[^"]*")/g
var primitive       = /true|false|null|NaN/g
var comment       = /\/\/[^\n]*/g

//not gonna bother supporting multiline syntax yet...
//wrapping and undo is more important than that.

exports.highlight = function (q) {
//  console.error('HIGHLIGHT JS' ,q)

  q.wrap(keyword    , styles.cyan)
  q.wrap(rbrace     , styles.brightGrey)
  q.wrap(sbrace     , styles.yellow)
  q.wrap(cbrace     , styles.green)
  q.wrap(number     , styles.brightMagenta)
  q.wrap(string     , styles.red)
  q.wrap(primitive  , styles.magenta)
  q.wrap(comment    , styles.blue)

}

exports.test = function (file) {
  return true
  return /\.(json|js)$/.test(file)
}
