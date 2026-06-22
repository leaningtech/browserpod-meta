
module.exports = function (doc, _, render) {

// EasyWriter is probably the coolest text-editor ever.
// it's name is a reference to the film 'Easy Rider'
// and was written in FORTH by Cap'n Crunch (inventor of phreaking)
// WHILE HE WAS IN JAIL!!!
// early versions supported CAPITAL LETTERS ONLY.
// and only 40 columns.
//
// EasyWriter was the first text editor on the Apple II
//
// Anyway, I managed to find a version I could run in dosbox,
// and the end of every line is marked with beamed-eight-notes.
//
// http://www.webcrunchers.com/stories/easywriter.html

  require('colors')//make sure we have colors

  var rc = this.config

  render.
    write('\x1b]0;\u266b ' + (rc.title || 'README') + '\007')

  this.renderers.push(function (q) {
    q.string = q.string + '\u266b'.grey
  })

}
