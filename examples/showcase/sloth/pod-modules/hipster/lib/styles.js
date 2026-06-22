// c/p from http://github.com/Marak/colors.js
// thx Marak !


var styles = module.exports  = {

    //styles
    'bold' : ['\033[1m', '\033[22m'],
    'italic' : ['\033[3m', '\033[23m'],
    'underline' : ['\033[4m', '\033[24m'],
    'inverse' : ['\033[7m', '\033[27m'],

    //grayscale
    'white' : ['\033[37m', '\033[39m'],
    'grey' : ['\033[90m', '\033[39m'],
    'black' : ['\033[30m', '\033[39m'],

    //colors
    'blue' : ['\033[34m', '\033[39m'],
    'cyan' : ['\033[36m', '\033[39m'],
    'green' : ['\033[32m', '\033[39m'],
    'magenta' : ['\033[35m', '\033[39m'],
    'red' : ['\033[31m', '\033[39m'],
    'yellow' : ['\033[33m', '\033[39m']
  };

'white,grey,black,blue,cyan,green,magenta,red,yellow'.split(',')
  .forEach(function (c) {
    var start = styles.bold[0]
    var end   = styles.bold[1]
    var name = 'bright' + c.charAt(0).toUpperCase() + c.substring(1)
    styles[name] = [start + styles[c][0], styles[c][1] + end]
  })
