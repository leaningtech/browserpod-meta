var express = require("express");
var fs = require("fs");
var app = express();

app.use(express.json());

// CORS — automatically added so the mock API works from browser frontends
app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  next();
});

// Load routes from config written by the outer app before startup
var routes = [];
try {
  routes = JSON.parse(fs.readFileSync("/project/routes.json", "utf-8"));
  console.log("Loaded " + routes.length + " route(s) from routes.json");
} catch (e) {
  console.error("Could not read routes.json: " + e.message);
}

// Dashboard — open the portal URL to see registered routes
app.get("/", function (req, res) {
  var rows = routes.map(function (r) {
    var methodColors = { GET: "#2ea043", POST: "#1f6feb", PUT: "#d29922", PATCH: "#d29922", DELETE: "#da3633" };
    var color = methodColors[r.method] || "#6e7681";
    return "<tr>" +
      "<td><span style='background:" + color + ";color:#fff;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:700'>" + r.method + "</span></td>" +
      "<td style='font-family:monospace;padding:8px 16px'>" + r.path + "</td>" +
      "<td style='color:#8b949e'>" + r.status + "</td>" +
      "<td><pre style='font-size:11px;white-space:pre-wrap;word-break:break-all;max-width:300px'>" + JSON.stringify(r.body, null, 2) + "</pre></td>" +
      "</tr>";
  }).join("");

  res.setHeader("Content-Type", "text/html");
  res.end(
    "<!DOCTYPE html><html><head><meta charset='utf-8'/><title>General Hook</title>" +
    "<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:monospace;background:#020304;color:#f5f2ea;padding:24px}" +
    ".shell{max-width:1040px;margin:0 auto;border:2px solid #ede6d8;background:#050505;box-shadow:6px 6px 0 #1e0e06}" +
    ".head{padding:18px 20px 14px;border-bottom:1px solid rgba(255,255,255,0.08)}" +
    "h1{font-size:28px;line-height:1.1;color:#24e3ef;margin-bottom:8px;text-transform:uppercase}" +
    ".sub{color:#ffd200;font-size:14px;margin-bottom:6px}.meta{color:#6f6a63;font-size:12px}" +
    ".table-wrap{padding:0 20px 20px}table{width:100%;border-collapse:collapse}" +
    "th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #21262d}" +
    "th{font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#8b949e}" +
    "pre{font-size:12px;white-space:pre-wrap;word-break:break-all;color:#00ff8c}" +
    "</style></head><body>" +
    "<div class='shell'><div class='head'><h1>General Hook</h1><p class='sub'>Mock API routes</p><p class='meta'>" + routes.length + " route(s) active</p></div>" +
    "<div class='table-wrap'><table><thead><tr><th>Method</th><th>Path</th><th>Status</th><th>Response</th></tr></thead><tbody>" +
    rows +
    "</tbody></table></div></div></body></html>"
  );
});

// Register each route from config
routes.forEach(function (r) {
  var method = r.method.toLowerCase();
  if (typeof app[method] !== "function") return;
  app[method](r.path, function (req, res) {
    res.status(r.status);
    var ct = r.contentType || "application/json";
    res.set("Content-Type", ct);
    // Binary body stored as a data URI string ("data:...;base64,...")
    if (typeof r.body === "string" && r.body.startsWith("data:")) {
      var comma = r.body.indexOf(",");
      var b64   = comma !== -1 ? r.body.slice(comma + 1) : r.body;
      res.send(Buffer.from(b64, "base64"));
    } else if (ct === "application/json") {
      res.json(r.body);
    } else {
      res.send(typeof r.body === "string" ? r.body : JSON.stringify(r.body));
    }
  });
  console.log("  " + r.method + " " + r.path + "  ->  " + r.status + "  [" + (r.contentType || "application/json") + "]");
});

// 404 for anything not matched
app.use(function (req, res) {
  res.status(404).json({ error: "No matching route", method: req.method, path: req.path });
});

app.listen(3000, function () {
  console.log("Mock API server running on port 3000");
});
