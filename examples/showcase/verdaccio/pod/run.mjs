import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const APP_DIR = "/home/user/verdaccio";
const URL_FILE = join(APP_DIR, "public-url");
const BUILD_DIR = join(APP_DIR, "node_modules", "verdaccio", "build", "lib");
const userUrl = process.env.VERDACCIO_PUBLIC_URL;
const loader = process.env.VERDACCIO_LOADER === "esm" ? "esm" : "cjs";
const localRequire = createRequire(import.meta.url);

// Keep BrowserPod's Promise
const bpPromise = globalThis.bpPromise;
function canSettle(PromiseClass) {
  try {
    const p = new PromiseClass(() => {});
    return typeof p.resolve === "function" && typeof p.reject === "function";
  } catch {
    return false;
  }
}
let currentPromise = globalThis.Promise;
if (bpPromise && !canSettle(currentPromise)) currentPromise = bpPromise;
Object.defineProperty(globalThis, "Promise", {
  configurable: true,
  enumerable: false,
  get: () => currentPromise,
  set: (value) => {
    if (bpPromise && !canSettle(value)) {
      console.error("[run] blocked an incompatible replacement of the global Promise");
      return;
    }
    currentPromise = value;
  },
});

// Hide Brotli and zstd
function hideVersion(key) {
  if (!(key in process.versions)) return true;
  try {
    delete process.versions[key];
  } catch {}
  if (!(key in process.versions)) return true;
  try {
    const versions = { ...process.versions };
    delete versions[key];
    Object.defineProperty(process, "versions", {
      configurable: true,
      enumerable: true,
      value: Object.freeze(versions),
    });
  } catch {}
  return !(key in process.versions);
}
const zlib = localRequire("zlib");
for (const name of ["createBrotliCompress", "createBrotliDecompress", "createZstdCompress", "createZstdDecompress"]) {
  try {
    delete zlib[name];
  } catch {}
}
const zlibHidden = !("createBrotliCompress" in zlib) && !("createBrotliDecompress" in zlib);
const versionsHidden = hideVersion("brotli") && hideVersion("zstd");
console.error(
  `[run] gzip only, Brotli and zstd hidden: ` +
  `zlib ${zlibHidden ? "yes" : "NO"}, process.versions ${versionsHidden ? "yes" : "NO"}`
);

// Let only our page frame it
const FRAME_FILE = join(APP_DIR, "frame-origin");
let frameOrigin = "";
try {
  frameOrigin = readFileSync(FRAME_FILE, "utf-8").trim();
} catch {}
if (/^https?:\/\/[^\s;,]+$/.test(frameOrigin)) {
  const withFrameAncestors = (policy) =>
    String(policy)
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part && !part.startsWith("frame-ancestors"))
      .concat(`frame-ancestors ${frameOrigin}`)
      .join("; ");
  const http = localRequire("http");
  const setHeader = http.ServerResponse.prototype.setHeader;
  http.ServerResponse.prototype.setHeader = function (name, value) {
    const key = String(name).toLowerCase();
    if (key === "x-frame-options") {
      if (!this.hasHeader("content-security-policy")) {
        setHeader.call(this, "Content-Security-Policy", withFrameAncestors("connect-src 'self'"));
      }
      return this;
    }
    if (key === "content-security-policy") value = withFrameAncestors(value);
    return setHeader.call(this, name, value);
  };
  console.error(`[run] web UI can be framed by ${frameOrigin} only`);
}

// Track the portal URL
function syncPublicUrl() {
  if (userUrl) return;
  try {
    const url = readFileSync(URL_FILE, "utf-8").trim();
    if (url) process.env.VERDACCIO_PUBLIC_URL = url;
    else delete process.env.VERDACCIO_PUBLIC_URL;
  } catch {}
}
syncPublicUrl();
setInterval(syncPublicUrl, 1000).unref();

// Fresh URL for each request
const serverProto = localRequire("http").Server.prototype;
const emit = serverProto.emit;
serverProto.emit = function (event, ...args) {
  if (event === "request") syncPublicUrl();
  return emit.call(this, event, ...args);
};

const bin = join(APP_DIR, "node_modules", "verdaccio", "bin", "verdaccio");
const args = process.argv.slice(2);
if (!args.includes("--config") && !args.includes("-c")) {
  args.unshift("--config", join(APP_DIR, "config.yaml"));
}
process.argv = [process.argv[0], bin, ...args];

// CJS skips the ESM loader
if (loader === "cjs") {
  localRequire(join(BUILD_DIR, "cli.js"));
} else {
  await import(join(BUILD_DIR, "cli.mjs"));
}
