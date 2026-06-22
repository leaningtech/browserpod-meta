// Audience server for SLOTH's Present mode.
//
// SLOTH spawns this (node present-server.js) inside the Pod. It serves a single
// audience page that shows the current slide, and pushes slide changes over an
// SSE stream so the audience view follows the presenter live. Calling listen()
// makes BrowserPod fire onPortal on the page, which opens the audience URL in
// the side panel.
//
// State lives in two files in the same directory, written by SLOTH:
//   present-slides.json : { clean: [html,...], terminal: [html,...] }  (once)
//   present-state.json  : { index: <n>, style: 'clean'|'terminal', rev: <n> }
//
// The server watches present-state.json and pushes {index, style} on change.
// No third-party dependencies: only Node's http/fs.

var http = require('http')
var fs = require('fs')
var path = require('path')

var dir = process.cwd()
var SLIDES = path.join(dir, 'present-slides.json')
var STATE = path.join(dir, 'present-state.json')
var PORT = parseInt(process.env.SLOTH_PRESENT_PORT || '8088', 10)

function readJson (p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch (e) { return fallback }
}

function currentState () {
  return readJson(STATE, { index: 0, style: 'clean', rev: 0 })
}

// Live annotations: freehand strokes the host draws from the phone, kept in
// memory keyed by slide index. Each stroke is { color, points:[[x,y],...] }
// with x/y as 0..1 fractions of the slide area, so they scale to any viewer.
// annRev bumps on every change so the audience canvas can poll for updates.
var annotations = {} // { '<slideIndex>': [stroke, ...] }
var annRev = 0
function annForSlide (i) { return annotations[String(i)] || [] }

var clients = [] // open SSE responses

function broadcast () {
  var st = currentState()
  var payload = 'data: ' + JSON.stringify(st) + '\n\n'
  clients.forEach(function (res) { try { res.write(payload) } catch (e) {} })
}

// Watch the state file; on any change, push to all SSE clients. fs.watch can be
// flaky across platforms, so also poll the rev as a backstop.
var lastRev = -1
function checkState () {
  var st = currentState()
  if (st.rev !== lastRev) { lastRev = st.rev; broadcast() }
}
try { fs.watch(dir, function (ev, name) { if (name === 'present-state.json') checkState() }) } catch (e) {}
setInterval(checkState, 500)

var PAGE = function () {
  var slides = readJson(SLIDES, { clean: [], terminal: [] })
  return '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>SLOTH</title>' +
    '<style>' +
    'html,body{margin:0;height:100%;background:#111;color:#eee;font-family:-apple-system,Segoe UI,Roboto,sans-serif;}' +
    '#wrap{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:5vmin;box-sizing:border-box;}' +
    '.slide{max-width:1100px;width:100%;}' +
    '.slide h1{font-size:clamp(2rem,7vw,5rem);margin:0 0 .4em;}' +
    '.slide h2{font-size:clamp(1.5rem,5vw,3.2rem);margin:0 0 .5em;}' +
    '.slide p,.slide li{font-size:clamp(1.1rem,2.6vw,2rem);line-height:1.5;}' +
    '.slide pre{background:#000;padding:1em;border-radius:.4em;overflow:auto;font-size:clamp(.9rem,2vw,1.4rem);}' +
    '.slide blockquote{border-left:.3em solid #555;margin:0;padding-left:.8em;color:#bbb;font-style:italic;}' +
    '.slide.center{text-align:center;}' +
    '.term{white-space:pre;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:clamp(.7rem,1.6vw,1.2rem);line-height:1.1;}' +
    '.survey{display:block;margin-top:1em;font-size:clamp(1.1rem,2.6vw,2rem);}' +
    '.survey .sq{margin:0 0 1.2em;}' +
    '.survey .q{font-weight:600;margin-bottom:.4em;}' +
    '.survey label{display:block;margin:.3em 0;cursor:pointer;}' +
    '.survey .rating{display:flex;gap:.6em;}' +
    '.survey label.rate{display:inline-flex;flex-direction:column;align-items:center;gap:.2em;}' +
    '.survey textarea{display:block;width:100%;margin:.3em 0;background:#000;color:#eee;border:1px solid #444;border-radius:.3em;padding:.5em;font:inherit;}' +
    '.survey button{font:inherit;padding:.5em 1.4em;border:none;border-radius:.3em;background:#4a7;color:#000;cursor:pointer;margin-top:.4em;}' +
    '.survey .thanks{color:#4a7;}' +
    '#count{position:fixed;bottom:1rem;right:1.2rem;color:#666;font-size:.9rem;}' +
    '#anno{position:fixed;inset:0;pointer-events:none;z-index:20;}' +
    '</style></head><body>' +
    '<div id="wrap"><div id="slide" class="slide"></div></div>' +
    '<canvas id="anno"></canvas>' +
    '<div id="count"></div>' +
    '<script>' +
    'var SLIDES=' + JSON.stringify(slides) + ';' +
    'var el=document.getElementById("slide");var cnt=document.getElementById("count");' +
    'function render(st){var set=SLIDES[st.style]||SLIDES.clean||[];' +
    'var html=set[st.index]||"";el.className="slide"+(st.style==="terminal"?" ":"");' +
    'if(st.style==="terminal"){el.innerHTML=\'<div class="term">\'+html+\'</div>\';}else{el.innerHTML=html;}' +
    'cnt.textContent=(st.index+1)+" / "+set.length;}' +
    // transparent annotation canvas: poll the current slide's strokes and draw.
    'var cv=document.getElementById("anno");var ctx=cv.getContext("2d");var annRev=-1;var strokes=[];' +
    'function sizeCanvas(){cv.width=window.innerWidth;cv.height=window.innerHeight;drawAnno();}' +
    'window.addEventListener("resize",sizeCanvas);' +
    'function drawAnno(){ctx.clearRect(0,0,cv.width,cv.height);ctx.lineCap="round";ctx.lineJoin="round";ctx.lineWidth=Math.max(3,cv.width*0.004);' +
    'strokes.forEach(function(s){if(!s.points||s.points.length<1)return;ctx.strokeStyle=s.color||"#f33";ctx.beginPath();' +
    's.points.forEach(function(p,i){var x=p[0]*cv.width,y=p[1]*cv.height;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();});}' +
    'function pollAnno(){fetch("/annotations?t="+Date.now(),{cache:"no-store"}).then(function(r){return r.json();}).then(function(a){' +
    'if(a&&a.rev!==annRev){annRev=a.rev;strokes=a.strokes||[];drawAnno();}}).catch(function(){});}' +
    'sizeCanvas();pollAnno();setInterval(pollAnno,400);' +
    'var lastRev=-1;' +
    'function apply(st){if(st&&st.rev!==lastRev){lastRev=st.rev;render(st);annRev=-1;pollAnno();}}' +
    // SSE for instant updates when the portal proxy passes the stream through,
    'try{var es=new EventSource("/events");es.onmessage=function(e){try{apply(JSON.parse(e.data));}catch(_){}};}catch(_){}' +
    // plus a polling fallback so it updates even if the proxy buffers SSE.
    'function poll(){fetch("/state?t="+Date.now(),{cache:"no-store"}).then(function(r){return r.json();}).then(apply).catch(function(){});}' +
    'poll();setInterval(poll,500);' +
    // Survey forms (rendered into a slide) POST to /survey; responses are saved
    // to data/ on the Pod. Delegated so it works as slides re-render.
    'document.addEventListener("submit",function(ev){' +
    'var f=ev.target;if(!f.classList||!f.classList.contains("survey"))return;ev.preventDefault();' +
    'var id=f.getAttribute("data-id")||"survey";' +
    'var cols=[];try{cols=JSON.parse(f.getAttribute("data-cols")||"[]");}catch(_){}' +
    'var answers=[];var qi=0;' +
    'while(f.querySelector("[name=q"+qi+"]")){var nm="q"+qi;' +
    'var checks=f.querySelectorAll("input[name="+nm+"]");var val="";' +
    'if(checks.length&&checks[0].type==="checkbox"){var picks=[];checks.forEach(function(c){if(c.checked)picks.push(c.value);});val=picks.join("; ");}' +
    'else if(checks.length){var sel=f.querySelector("input[name="+nm+"]:checked");val=sel?sel.value:"";}' +
    'else{var ta=f.querySelector("[name="+nm+"]");val=ta?ta.value:"";}' +
    'answers.push(val);qi++;}' +
    'fetch("/survey",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:id,cols:cols,answers:answers})})' +
    '.then(function(){f.innerHTML=\'<p class="thanks">Thanks for your response.</p>\';}).catch(function(){});' +
    '});' +
    '</script></body></html>'
}

// Append a survey response as a CSV row to data/responses-<id>.csv. The header
// (time + each question) is written once when the file is first created. The
// data folder lives at the project root (this server's cwd). Everything stays
// on the Pod filesystem; nothing is sent anywhere outside the browser.
function csvCell (s) {
  s = String(s == null ? '' : s)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
function csvRow (cells) { return cells.map(csvCell).join(',') + '\n' }

function recordSurvey (body, cb) {
  var rec
  try { rec = JSON.parse(body) } catch (e) { return cb(new Error('bad json')) }
  var id = String(rec.id || 'survey').replace(/[^\w.-]/g, '_')
  var cols = Array.isArray(rec.cols) ? rec.cols : []
  var answers = Array.isArray(rec.answers) ? rec.answers : []

  var dataDir = path.join(dir, 'data')
  try { fs.mkdirSync(dataDir, { recursive: true }) } catch (e) {}
  var file = path.join(dataDir, 'responses-' + id + '.csv')

  var out = ''
  var needHeader = false
  try { fs.statSync(file) } catch (e) { needHeader = true }
  if (needHeader) out += csvRow(['time'].concat(cols))
  out += csvRow([new Date().toISOString()].concat(answers))

  fs.appendFile(file, out, function (err) { cb(err || null) })
}

// The phone clicker. A tap POSTs an action; we update present-state.json (the
// same file the audience follows and SLOTH polls), so the clicker, the
// presenter's keyboard, and the audience view all stay in sync.
// Actions the phone clicker can send. Navigation moves the slide index; other
// actions (run the slide's code, toggle the audience render style, black out)
// are recorded as request counters in the state file. SLOTH polls the state
// file and performs these in the app, since it owns the deck and the run logic.
function applyClicker (action, cb) {
  var st = currentState()
  var total = st.total || 1
  var idx = st.index || 0
  if (action === 'next') idx++
  else if (action === 'prev') idx--
  else if (action === 'first') idx = 0
  else if (action === 'last') idx = total - 1
  else if (action === 'run') st.runReq = (st.runReq || 0) + 1
  else if (action === 'style') st.styleReq = (st.styleReq || 0) + 1
  if (idx < 0) idx = 0
  if (idx > total - 1) idx = total - 1
  st.index = idx
  st.rev = (st.rev || 0) + 1
  try { fs.writeFileSync(STATE, JSON.stringify(st)) } catch (e) { return cb(e) }
  broadcast()
  cb(null, st)
}

function clickerPage () {
  var slides = readJson(SLIDES, { clean: [], terminal: [] })
  return '<!doctype html><html><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">' +
  '<title>SLOTH clicker</title><style>' +
  'html,body{margin:0;height:100%;background:#111;color:#eee;font-family:-apple-system,Segoe UI,Roboto,sans-serif;' +
  'display:flex;flex-direction:column;-webkit-user-select:none;user-select:none;touch-action:none;overflow:hidden;}' +
  '#count{flex:0 0 auto;text-align:center;padding:.7rem;font-size:1.1rem;color:#aaa;}' +
  '.row{flex:1 1 auto;display:flex;}' +
  'button{border:none;color:#fff;font-weight:600;}' +
  '.row button{flex:1;font-size:2rem;}' +
  '#prev{background:#243;} #next{background:#254;} ' +
  '.ends{flex:0 0 auto;display:flex;}' +
  '.ends button{flex:1;font-size:1.05rem;padding:.9rem;background:#222;color:#bbb;border-top:1px solid #333;}' +
  // a row of present-mode actions that mirror the host keys
  '.acts{flex:0 0 auto;display:flex;}' +
  '.acts button{flex:1;font-size:1.05rem;padding:.9rem;border-top:1px solid #333;}' +
  '#run{background:#143d2a;color:#9f9;} #style{background:#2a2433;color:#caf;} #black{background:#222;color:#bbb;}' +
  '#drawToggle{flex:0 0 auto;font-size:1.05rem;padding:.9rem;background:#1a2a3a;color:#9cf;border-top:1px solid #333;}' +
  // draw overlay
  '#draw{position:fixed;inset:0;background:#111;display:none;flex-direction:column;z-index:10;}' +
  '#draw.on{display:flex;}' +
  // the stage holds the dimmed slide preview + the canvas. The canvas is the
  // flex child that fills the stage and takes the touches (as before); the
  // preview is a non-interactive background layer behind it.
  '#stage{position:relative;flex:1 1 auto;display:flex;overflow:hidden;}' +
  '#preview{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:5vmin;box-sizing:border-box;opacity:.5;pointer-events:none;z-index:1;}' +
  '#preview .slide{max-width:1100px;width:100%;}' +
  '#preview h1{font-size:clamp(1.4rem,7vw,3rem);margin:0 0 .3em;}' +
  '#preview h2{font-size:clamp(1.1rem,5vw,2rem);margin:0 0 .4em;}' +
  '#preview p,#preview li{font-size:clamp(.9rem,3vw,1.4rem);line-height:1.4;}' +
  '#preview pre{background:#000;padding:.6em;border-radius:.3em;overflow:hidden;font-size:clamp(.7rem,2.4vw,1rem);}' +
  '#preview.center{text-align:center;}' +
  '#pad{flex:1 1 auto;touch-action:none;position:relative;z-index:2;}' +
  '#tools{flex:0 0 auto;display:flex;align-items:center;gap:.5rem;padding:.6rem;background:#000;}' +
  '.sw{width:2.2rem;height:2.2rem;border-radius:50%;border:3px solid #000;}' +
  '.sw.sel{border-color:#fff;}' +
  '#tools .spacer{flex:1;}' +
  '#tools button{padding:.7rem 1rem;border-radius:.4rem;font-size:1rem;}' +
  '#clear{background:#622;color:#fdd;} #done{background:#264;color:#dfd;}' +
  '</style></head><body>' +
  '<div id="count">SLOTH</div>' +
  '<div class="row"><button id="prev">‹ Prev</button><button id="next">Next ›</button></div>' +
  '<div class="ends"><button data-a="first">⟪ First</button><button data-a="last">Last ⟫</button></div>' +
  '<div class="acts"><button id="run" data-a="run">▶ Run code</button>' +
  '<button id="style" data-a="style">◧ Style</button></div>' +
  '<button id="drawToggle">✎ Draw on slide</button>' +
  '<div id="draw"><div id="stage"><div id="preview"></div><canvas id="pad"></canvas></div>' +
  '<div id="tools">' +
  '<span class="sw sel" data-col="#f33" style="background:#f33"></span>' +
  '<span class="sw" data-col="#fd3" style="background:#fd3"></span>' +
  '<span class="sw" data-col="#fff" style="background:#fff"></span>' +
  '<span class="spacer"></span>' +
  '<button id="clear">Clear</button><button id="done">Done</button>' +
  '</div></div>' +
  '<script>' +
  'var SLIDES=' + JSON.stringify(slides) + ';var curIdx=0;' +
  'function send(a){fetch("/clicker",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a})})' +
  '.then(function(r){return r.json();}).then(applyState).catch(function(){});}' +
  'var cnt=document.getElementById("count");var preview=document.getElementById("preview");' +
  'function showPreview(idx){var set=SLIDES.clean||[];preview.innerHTML=set[idx]||"";}' +
  'function applyState(s){if(!s||s.index==null)return;cnt.textContent=(s.index+1)+" / "+(s.total||"?");' +
  'if(s.index!==curIdx){curIdx=s.index;showPreview(curIdx);if(draw.classList.contains("on")){pctx.clearRect(0,0,pad.width,pad.height);} }}' +
  'document.getElementById("prev").onclick=function(){send("prev");};' +
  'document.getElementById("next").onclick=function(){send("next");};' +
  'document.querySelectorAll(".ends button,.acts button").forEach(function(b){b.onclick=function(){send(b.getAttribute("data-a"));};});' +
  'function refresh(){fetch("/state?t="+Date.now(),{cache:"no-store"}).then(function(r){return r.json();}).then(applyState).catch(function(){});}' +
  'refresh();setInterval(refresh,1000);' +
  // ---- drawing ----
  'var draw=document.getElementById("draw"),pad=document.getElementById("pad"),pctx=pad.getContext("2d");' +
  'var color="#f33",pts=[],drawing=false;' +
  'function sizePad(){var w=pad.clientWidth,h=pad.clientHeight;if(w&&h){pad.width=w;pad.height=h;}else{setTimeout(sizePad,50);}}' +
  'document.getElementById("drawToggle").onclick=function(){draw.classList.add("on");showPreview(curIdx);requestAnimationFrame(sizePad);};' +
  'window.addEventListener("resize",function(){if(draw.classList.contains("on"))sizePad();});' +
  'document.getElementById("done").onclick=function(){draw.classList.remove("on");};' +
  'document.querySelectorAll(".sw").forEach(function(s){s.onclick=function(){' +
  'document.querySelectorAll(".sw").forEach(function(x){x.classList.remove("sel");});s.classList.add("sel");color=s.getAttribute("data-col");};});' +
  'document.getElementById("clear").onclick=function(){fetch("/clear",{method:"POST"}).catch(function(){});pctx.clearRect(0,0,pad.width,pad.height);};' +
  'function pos(e){var t=e.touches?e.touches[0]:e;var r=pad.getBoundingClientRect();return [(t.clientX-r.left)/r.width,(t.clientY-r.top)/r.height];}' +
  'function start(e){e.preventDefault();if(!pad.width||!pad.height)sizePad();drawing=true;pts=[pos(e)];}' +
  'function move(e){if(!drawing)return;e.preventDefault();var p=pos(e);pts.push(p);' +
  'pctx.strokeStyle=color;pctx.lineWidth=Math.max(3,pad.width*0.008);pctx.lineCap="round";pctx.lineJoin="round";' +
  'var n=pts.length;if(n>1){pctx.beginPath();pctx.moveTo(pts[n-2][0]*pad.width,pts[n-2][1]*pad.height);pctx.lineTo(p[0]*pad.width,p[1]*pad.height);pctx.stroke();}}' +
  'function end(e){if(!drawing)return;drawing=false;if(pts.length>1){' +
  'fetch("/draw",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({color:color,points:pts})}).catch(function(){});}pts=[];}' +
  'pad.addEventListener("touchstart",start);pad.addEventListener("touchmove",move);pad.addEventListener("touchend",end);' +
  'pad.addEventListener("mousedown",start);pad.addEventListener("mousemove",move);pad.addEventListener("mouseup",end);' +
  '</script></body></html>'
}

var server = http.createServer(function (req, res) {
  // Allow cross-origin requests: the host's page (on localhost) draws on the
  // portal by POSTing here cross-origin, so /draw and /clear need CORS. This is
  // a local presentation tool, so a permissive policy is fine.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  if (req.method === 'POST' && req.url === '/clicker') {
    var cbody = ''
    req.on('data', function (c) { cbody += c; if (cbody.length > 1e4) req.destroy() })
    req.on('end', function () {
      var action = 'next'
      try { action = (JSON.parse(cbody).action || 'next') } catch (e) {}
      applyClicker(action, function (err, st) {
        res.writeHead(err ? 400 : 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify(err ? { ok: false } : st))
      })
    })
    return
  }
  if (req.url === '/clicker') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(clickerPage())
    return
  }
  // Annotations: the audience canvas polls /annotations for the current slide's
  // strokes; the phone POSTs /draw (a finished stroke) and /clear (wipe slide).
  if (req.url.indexOf('/annotations') === 0) {
    var st = currentState()
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ rev: annRev, index: st.index, strokes: annForSlide(st.index) }))
    return
  }
  if (req.method === 'POST' && req.url === '/draw') {
    var dbody = ''
    req.on('data', function (c) { dbody += c; if (dbody.length > 2e5) req.destroy() })
    req.on('end', function () {
      try {
        var rec = JSON.parse(dbody)
        var idx = String(currentState().index)
        if (!annotations[idx]) annotations[idx] = []
        if (rec.points && rec.points.length) {
          annotations[idx].push({ color: String(rec.color || '#f33'), points: rec.points })
          annRev++
        }
      } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, rev: annRev }))
    })
    return
  }
  if (req.method === 'POST' && req.url === '/clear') {
    var idx2 = String(currentState().index)
    annotations[idx2] = []
    annRev++
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, rev: annRev }))
    return
  }
  if (req.method === 'POST' && req.url === '/survey') {
    var body = ''
    req.on('data', function (c) { body += c; if (body.length > 1e5) req.destroy() })
    req.on('end', function () {
      recordSurvey(body, function (err) {
        res.writeHead(err ? 400 : 200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: !err }))
      })
    })
    return
  }
  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })
    res.write('retry: 1000\n\n')
    res.write('data: ' + JSON.stringify(currentState()) + '\n\n')
    clients.push(res)
    req.on('close', function () {
      var i = clients.indexOf(res)
      if (i !== -1) clients.splice(i, 1)
    })
    return
  }
  if (req.url.indexOf('/state') === 0) {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    })
    res.end(JSON.stringify(currentState()))
    return
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(PAGE())
})

server.listen(PORT, function () {
  console.log('audience server on ' + PORT)
})
