const express = require("express");
const app = express();

const webhooks = [];

// Parse body manually so we handle JSON, text, and empty bodies uniformly
app.use(function (req, res, next) {
  var data = "";
  req.on("data", function (chunk) { data += chunk; });
  req.on("end", function () {
    req.rawBody = data;
    if (data.trim()) {
      try { req.parsedBody = JSON.parse(data); }
      catch (_) { req.parsedBody = data; }
    } else {
      req.parsedBody = null;
    }
    next();
  });
});

// Dashboard — open the portal URL in a browser to see this
app.get("/", function (req, res) {
  res.setHeader("Content-Type", "text/html");
  res.send(DASHBOARD);
});

// Polling endpoint for the dashboard
app.get("/__webhooks", function (req, res) {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(webhooks));
});

// Catch-all: treat every other request as an incoming webhook
app.use(function (req, res) {
  var keepHeaders = [
    "content-type", "user-agent",
    "x-github-event", "x-github-delivery", "x-hub-signature-256",
    "x-stripe-signature", "x-hook-id", "x-forwarded-for",
  ];
  var headers = {};
  keepHeaders.forEach(function (k) {
    if (req.headers[k]) headers[k] = req.headers[k];
  });

  var entry = {
    id: webhooks.length + 1,
    method: req.method,
    path: req.path,
    headers: headers,
    body: req.parsedBody,
    receivedAt: new Date().toISOString(),
  };

  webhooks.unshift(entry);
  if (webhooks.length > 100) webhooks.pop();

  console.log("[#" + entry.id + "] " + entry.method + " " + entry.path);

  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ received: true, id: entry.id }));
});

app.listen(3000, function () {
  console.log("Webhook receiver running on port 3000");
});

// ─── Embedded dashboard ───────────────────────────────────────────────────────
var DASHBOARD = '<!DOCTYPE html>' +
'<html lang="en">' +
'<head>' +
'<meta charset="utf-8"/>' +
'<meta name="viewport" content="width=device-width,initial-scale=1"/>' +
'<title>General Hook</title>' +
'<style>' +
'*{box-sizing:border-box;margin:0;padding:0}' +
'body{font-family:monospace;background:#020304;color:#f5f2ea;padding:24px}' +
'.shell{max-width:1040px;margin:0 auto;border:2px solid #ede6d8;background:#050505;box-shadow:6px 6px 0 #1e0e06}' +
'.head{padding:18px 20px 14px;border-bottom:1px solid rgba(255,255,255,0.08)}' +
'h1{font-size:28px;line-height:1.1;color:#24e3ef;margin-bottom:8px;text-transform:uppercase}' +
'.sub{color:#ffd200;font-size:14px;margin-bottom:6px}' +
'.count{display:inline-block;background:#111;border:1px solid #30363d;border-radius:20px;padding:2px 10px;font-size:11px;margin-left:8px;vertical-align:middle;color:#8b949e}' +
'.content{padding:20px}' +
'.empty{color:#8b949e;text-align:center;padding:48px;border:1px dashed #30363d;border-radius:8px;font-size:14px}' +
'.wh{border:1px solid #30363d;border-radius:8px;margin-bottom:12px;overflow:hidden}' +
'.wh-head{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#161b22}' +
'.method{font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;letter-spacing:0.3px}' +
'.GET{background:#2ea043;color:#fff}.POST{background:#1f6feb;color:#fff}' +
'.PUT,.PATCH{background:#d29922;color:#fff}.DELETE{background:#da3633;color:#fff}' +
'.OTHER{background:#6e7681;color:#fff}' +
'.path{font-family:monospace;font-size:13px}' +
'.time{margin-left:auto;color:#8b949e;font-size:12px;white-space:nowrap}' +
'.wh-body{padding:12px 14px}' +
'.lbl{font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#8b949e;margin-bottom:6px}' +
'pre{background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:10px;font-size:12px;overflow-x:auto;white-space:pre-wrap;word-break:break-all}' +
'.mt{margin-top:12px}' +
'</style>' +
'</head>' +
'<body>' +
'<div class="shell"><div class="head"><h1>General Hook <span class="count" id="count">0 received</span></h1>' +
'<p class="sub">Webhook capture</p></div><div class="content"><div id="list"></div></div></div>' +
'<script>' +
'var lastCount=-1;' +
'function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}' +
'function render(data){' +
'  document.getElementById("count").textContent=data.length+" received";' +
'  if(!data.length){document.getElementById("list").innerHTML=\'<div class="empty">No webhooks yet.<br>POST to any path on this server.</div>\';return;}' +
'  var html="";' +
'  for(var i=0;i<data.length;i++){' +
'    var w=data[i];' +
'    var m=["GET","POST","PUT","PATCH","DELETE"].indexOf(w.method)!==-1?w.method:"OTHER";' +
'    var body=w.body!=null?JSON.stringify(w.body,null,2):"(empty)";' +
'    var hdrs=Object.keys(w.headers).length?JSON.stringify(w.headers,null,2):"(none)";' +
'    var t=new Date(w.receivedAt).toLocaleTimeString();' +
'    html+=\'<div class="wh"><div class="wh-head">\'+' +
'      \'<span class="method \'+m+\'">\'+esc(w.method)+\'</span>\'+' +
'      \'<span class="path">\'+esc(w.path)+\'</span>\'+' +
'      \'<span class="time">#\'+w.id+\' &middot; \'+t+\'</span></div>\'+' +
'      \'<div class="wh-body"><div class="lbl">Body</div><pre>\'+esc(body)+\'</pre>\'+' +
'      \'<div class="lbl mt">Headers</div><pre>\'+esc(hdrs)+\'</pre></div></div>\';' +
'  }' +
'  document.getElementById("list").innerHTML=html;' +
'}' +
'async function poll(){' +
'  try{var r=await fetch("/__webhooks");var d=await r.json();if(d.length!==lastCount){lastCount=d.length;render(d);}' +
'  }catch(e){}' +
'}' +
'render([]);poll();setInterval(poll,2000);' +
'<\/script>' +
'</body></html>';
