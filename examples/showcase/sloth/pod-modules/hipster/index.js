#!/usr/bin/env node

var fs = require('fs')
var Document = require('./lib/document')
var key = require('keypress')
var render = require('./lib/render')

key(process.stdin)

process.stdin.setRawMode(true)
process.stdin.resume()

module.exports = Hipster

function Hipster (rc, doc) {

  //internal representation of our text file
  doc = doc || new Document()
  
  render = render(doc, rc)
  
  var hip = {
    config: rc,
    plugins: [],

    //the list of things that want to draw.
    renderers: render.renderers,

    //the thing that owns drawing. 
    render: render,

    //pass this things to use
    use: function (plugin) {
      if(plugin)
        this.plugins.push(plugin)
      return this
    },

    //call all the plugins, passing them the things they will need.
    init: function () {
      var self = this
      this.plugins.forEach(function (plug) {
        plug.call(self, doc, process.stdin, render)
      })
      render.redraw()
      return this
    }
  }

  return hip
}

if(!module.parent)

  Hipster(require('./lib/config'))
    .use(require('./plugins/basics'))
    .use(require('./plugins/lines'))
    .use(require('./plugins/indent'))
    .use(require('./plugins/comment'))
    .use(require('./plugins/entry'))
    .use(require('./plugins/highlight'))
    .use(require('./plugins/easy-writer'))
    .use(require('./plugins/control'))
    .use(require('./plugins/movement'))
    .use(require('./plugins/selection')) //MUST come after movement.
    .use(require('./plugins/line-nums')) //MUST come after selection.
    .init()

