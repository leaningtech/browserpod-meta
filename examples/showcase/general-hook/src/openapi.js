import yaml from "js-yaml";

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractPath(urlStr) {
  if (!urlStr) return "/";
  try { return new URL(urlStr).pathname || "/"; } catch (_) {}
  // Relative or path-only
  const stripped = urlStr.replace(/^https?:\/\/[^/]+/, "");
  return stripped.startsWith("/") ? stripped.split("?")[0] : "/" + stripped.split("?")[0];
}

function inferExample(schema) {
  if (!schema || typeof schema !== "object") return {};
  if (schema.example !== undefined) return schema.example;
  if (schema.type === "array") return [inferExample(schema.items || {})];
  if (schema.type === "object" || schema.properties) {
    const obj = {};
    for (const [k, v] of Object.entries(schema.properties || {})) obj[k] = inferExample(v);
    return obj;
  }
  if (schema.type === "string")  return "string";
  if (schema.type === "integer") return 0;
  if (schema.type === "number")  return 0;
  if (schema.type === "boolean") return false;
  return {};
}

// ── OpenAPI 3.x → routes[] ────────────────────────────────────────────────────

export function openapiToRoutes(spec) {
  const routes = [];
  const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

  for (const [path, pathItem] of Object.entries(spec.paths || {})) {
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op) continue;

      const responses = op.responses || {};
      const successCode = Object.keys(responses).find((c) => String(c).match(/^2/)) || "200";
      const response = responses[successCode] || {};
      const content = (response.content || {})["application/json"] || {};
      const schema = content.schema || {};

      const body =
        schema.example !== undefined      ? schema.example :
        op["x-mock-response"] !== undefined ? op["x-mock-response"] :
        inferExample(schema);

      routes.push({ method: method.toUpperCase(), path, status: parseInt(successCode) || 200, body });
    }
  }
  return routes;
}

// ── Swagger 2.0 → routes[] ────────────────────────────────────────────────────

function swagger2ToRoutes(spec) {
  const routes = [];
  const basePath = spec.basePath || "";
  const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

  for (const [pathStr, pathItem] of Object.entries(spec.paths || {})) {
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op) continue;

      const responses = op.responses || {};
      const successCode = Object.keys(responses).find((c) => String(c).match(/^2/)) || "200";
      const response = responses[successCode] || {};

      let body = {};
      if (response.examples?.["application/json"]) {
        body = response.examples["application/json"];
      } else if (response.schema?.example !== undefined) {
        body = response.schema.example;
      } else if (op["x-mock-response"] !== undefined) {
        body = op["x-mock-response"];
      } else if (response.schema) {
        body = inferExample(response.schema);
      }

      routes.push({ method: method.toUpperCase(), path: basePath + pathStr, status: parseInt(successCode) || 200, body });
    }
  }
  return routes;
}

// ── Postman Collection v2.x → routes[] ───────────────────────────────────────

function postmanToRoutes(collection) {
  const routes = [];

  function processItems(items) {
    for (const item of items || []) {
      if (item.item) { processItems(item.item); continue; } // folder

      const req = item.request;
      if (!req) continue;

      const urlVal = req.url;
      let path = "/";
      if (typeof urlVal === "string") {
        path = extractPath(urlVal);
      } else if (urlVal?.raw) {
        path = extractPath(urlVal.raw);
      } else if (urlVal?.path) {
        path = "/" + (Array.isArray(urlVal.path) ? urlVal.path.filter(s => !s.startsWith(":")).join("/") : urlVal.path);
      }

      // Use first saved response example if available
      let status = 200;
      let body = {};
      const responses = item.response || [];
      if (responses.length > 0) {
        const first = responses[0];
        status = first.code || first.status || 200;
        if (first.body) {
          try { body = JSON.parse(first.body); } catch (_) { body = first.body; }
        }
      }

      routes.push({ method: (req.method || "GET").toUpperCase(), path, status, body });
    }
  }

  processItems(collection.item);
  return routes;
}

// ── HAR → routes[] ────────────────────────────────────────────────────────────

function harToRoutes(har) {
  const routes = [];
  const seen = new Set();

  for (const entry of (har.log?.entries || [])) {
    const req = entry.request;
    const res = entry.response;
    if (!req || !res) continue;

    const path = extractPath(req.url);
    const key = req.method + " " + path;
    if (seen.has(key)) continue; // keep first occurrence only
    seen.add(key);

    const mime = (res.content?.mimeType || "").toLowerCase();
    let body = {};
    if (res.content?.text && mime.includes("json")) {
      try { body = JSON.parse(res.content.text); } catch (_) {}
    }

    routes.push({ method: (req.method || "GET").toUpperCase(), path, status: res.status || 200, body });
  }
  return routes;
}

// ── Insomnia export v4 → routes[] ────────────────────────────────────────────

function insomniaToRoutes(data) {
  const routes = [];
  const requests = (data.resources || []).filter((r) => r._type === "request");

  for (const req of requests) {
    const path = extractPath(req.url || "/");
    routes.push({ method: (req.method || "GET").toUpperCase(), path, status: 200, body: {} });
  }
  return routes;
}

// ── Format detection ──────────────────────────────────────────────────────────

function detectFormat(parsed) {
  if (parsed.openapi)                                                    return "openapi3";
  if (parsed.swagger)                                                    return "swagger2";
  if (parsed.info?.schema?.includes("getpostman.com") || (parsed.info && parsed.item)) return "postman";
  if (parsed.log?.entries)                                               return "har";
  if (parsed._type === "export" || parsed.resources?.some((r) => r._type === "request")) return "insomnia";
  if (Array.isArray(parsed))                                             return "routes";
  return null;
}

const FORMAT_LABELS = {
  openapi3:  "OpenAPI 3.x",
  swagger2:  "Swagger 2.0",
  postman:   "Postman Collection",
  har:       "HAR (captured traffic)",
  insomnia:  "Insomnia Export",
  routes:    "routes.json",
};

// ── Public parse entry point ──────────────────────────────────────────────────

export function parseUploadedFile(filename, content) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".js")) return { type: "raw", formatLabel: "Server file" };

  let parsed;
  try {
    parsed = yaml.load(content);
  } catch (e) {
    throw new Error("Could not parse file: " + e.message);
  }

  const format = detectFormat(parsed);
  const formatLabel = FORMAT_LABELS[format] || "Unknown";

  if (!format) {
    throw new Error(
      "Unrecognized format. Supported: OpenAPI 3.x, Swagger 2.0, Postman Collection, HAR, Insomnia, routes.json, server.js"
    );
  }

  let routes;
  switch (format) {
    case "openapi3": routes = openapiToRoutes(parsed);    break;
    case "swagger2": routes = swagger2ToRoutes(parsed);   break;
    case "postman":  routes = postmanToRoutes(parsed);    break;
    case "har":      routes = harToRoutes(parsed);        break;
    case "insomnia": routes = insomniaToRoutes(parsed);   break;
    case "routes":
      for (const r of parsed) {
        if (!r.method || !r.path) throw new Error("Each route needs a method and path.");
      }
      routes = parsed;
      break;
  }

  return { type: format === "routes" ? "routes" : "openapi", routes, formatLabel };
}

// ── Spec generator ────────────────────────────────────────────────────────────

export function buildOpenApiSpec(info, endpoints) {
  const paths = {};

  for (const ep of endpoints) {
    if (!paths[ep.path]) paths[ep.path] = {};
    const method = ep.method.toLowerCase();
    const op = {
      responses: {
        [String(ep.status)]: {
          description: ep.status >= 200 && ep.status < 300 ? "Success" : "Response",
          content: { "application/json": { schema: { example: ep.body } } },
        },
      },
    };
    if (ep.summary) op.summary = ep.summary;
    paths[ep.path][method] = op;
  }

  return {
    openapi: "3.0.3",
    info: { title: info.title || "", version: info.version || "" },
    paths,
  };
}

export function specToYaml(spec) {
  return yaml.dump(spec, { lineWidth: 100, noRefs: true, quotingType: '"' });
}

export function specToRoutes(info, endpoints) {
  return openapiToRoutes(buildOpenApiSpec(info, endpoints));
}
