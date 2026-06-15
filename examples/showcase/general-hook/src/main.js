import { BrowserPod } from "@leaningtech/browserpod";
import { copyFile, copyFileTo, writeTextFile } from "./utils.js";
import {
  parseUploadedFile,
  buildOpenApiSpec,
  specToYaml,
  specToRoutes,
} from "./openapi.js";

// ── State ────────────────────────────────────────────────────────────────────
let currentTab = "builder";

let routes = [];

let uploadMode = null;           // 'routes' | 'openapi' | 'raw'
let uploadedRawContent = null;

let editingTarget = null;        // { arr, index }

const specInfo = { title: "", version: "" };
let specEndpoints = [];
let specBlobUrl = null;

// ── DOM ───────────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const statusEl        = $("status");
const statusTextEl    = $("status-text");
const startBtn        = $("start-btn");
const consoleEl       = $("console");
const portalCard      = $("portal-card");
const portalUrlEl     = $("portal-url");
const copyBtn         = $("copy-btn");
const openBtn         = $("open-btn");
const exampleRoute    = $("example-route");
const bodyEditorCard  = $("body-editor-card");
const bodyEditorLabel = $("body-editor-label");
const bodyEditorTA    = $("body-editor-textarea");
const asciiSuccess    = $("ascii-success");
const consoleCard     = $("console-card");
const notebookBtn      = $("notebook-btn");
const notebookPanel    = $("notebook-panel");
const notebookClose    = $("notebook-close");
const notebookTextarea = $("notebook-textarea");
const notebookDownload = $("notebook-download");
const poopCanvas      = $("poop-canvas");
const poopCtx         = poopCanvas?.getContext("2d");
const EASTER_EGG_WORD = "gracjan";
const NOTE_STORAGE_KEY     = "general-hook:notebook-note";
const AMBIENCE_STORAGE_KEY = "general-hook:sea-ambience";
const THEME_STORAGE_KEY    = "general-hook:theme";
const themeBtn = $("theme-btn");
let lastPointerPos = {
  x: window.innerWidth * 0.5,
  y: window.innerHeight * 0.5,
};
let serverState = null;
let typedBuffer = "";
let poopParticles = [];
let poopAnimId = null;
let lastPoopFrame = 0;
let ambienceEnabled = loadAmbiencePreference();
let ambienceArmed = ambienceEnabled;
let ambiencePlayPending = false;
const ambienceAudio = new Audio("/audio/577424__legnalegna55__water-wave.mp3");
ambienceAudio.loop = true;
ambienceAudio.volume = 0.1;
ambienceAudio.preload = "auto";

// ── Welcome screen ────────────────────────────────────────────────────────────
if (localStorage.getItem("general-hook:welcomed")) {
  $("welcome-screen").classList.add("hidden");
}

$("welcome-start-btn").addEventListener("click", () => {
  localStorage.setItem("general-hook:welcomed", "1");
  const ws = $("welcome-screen");
  ws.classList.add("fading");
  setTimeout(() => ws.classList.add("hidden"), 350);
});

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 5000);
}

// ── Settings dropdown ─────────────────────────────────────────────────────────
let terminalVisible = false;

$("settings-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  $("settings-dropdown").classList.toggle("hidden");
});

document.addEventListener("click", () => {
  $("settings-dropdown").classList.add("hidden");
});

$("toggle-terminal-btn").addEventListener("click", () => {
  terminalVisible = !terminalVisible;
  consoleCard.classList.toggle("hidden", !terminalVisible);
  $("toggle-terminal-btn").textContent = terminalVisible ? "HIDE TERMINAL" : "SEE TERMINAL";
  $("settings-dropdown").classList.add("hidden");
});

$("toggle-ambience-btn").addEventListener("click", async () => {
  await setAmbienceEnabled(!ambienceEnabled);
  $("settings-dropdown").classList.add("hidden");
});

notebookBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  $("settings-dropdown").classList.add("hidden");
  notebookPanel.classList.toggle("hidden");
});

notebookClose.addEventListener("click", () => {
  notebookPanel.classList.add("hidden");
});

// ── Theme toggle ──────────────────────────────────────────────────────────────
function applyTheme(light) {
  document.body.classList.toggle("light", light);
  themeBtn.setAttribute("aria-checked", String(light));
}

applyTheme(localStorage.getItem(THEME_STORAGE_KEY) === "light");

themeBtn.addEventListener("click", () => {
  const light = !document.body.classList.contains("light");
  applyTheme(light);
  localStorage.setItem(THEME_STORAGE_KEY, light ? "light" : "dark");
});

window.addEventListener("pointermove", (event) => {
  lastPointerPos = { x: event.clientX, y: event.clientY };
});

document.addEventListener("pointerdown", armAmbiencePlayback, { passive: true });
document.addEventListener("keydown", armAmbiencePlayback, true);

document.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.key === "Backspace") {
    typedBuffer = typedBuffer.slice(0, -1);
    return;
  }

  if (event.key === "Escape") {
    typedBuffer = "";
    return;
  }

  if (event.key.length !== 1) return;

  typedBuffer = (typedBuffer + event.key.toLowerCase()).slice(-EASTER_EGG_WORD.length);
  if (typedBuffer !== EASTER_EGG_WORD) return;

  const origin = getCaretViewportPosition(event.target) || lastPointerPos;
  spawnPoopBurst(origin.x, origin.y);
  typedBuffer = "";
}, true);


window.addEventListener("resize", resizePoopCanvas);
resizePoopCanvas();

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (serverState) {
      showToast(`Your ${serverState.isWebhook ? "webhook" : "API"} is live. Refresh this tab to start a new server — your current one will be stopped.`);
      return;
    }
    currentTab = btn.dataset.tab;
    document.querySelectorAll(".tab").forEach((t) =>
      t.classList.toggle("active", t === btn)
    );
    document.querySelectorAll(".tab-panel").forEach((p) =>
      p.classList.add("hidden")
    );
    $("tab-" + currentTab).classList.remove("hidden");
    syncStatusLabel();
  });
});

// ── Builder tab ───────────────────────────────────────────────────────────────
function renderRoutes() {
  const el = $("routes-list");
  el.innerHTML = routes.length
    ? routes.map((r, i) => routeRowHtml(r, i)).join("")
    : '<div class="empty-routes">No routes yet.</div>';
  bindRowEvents(el, routes, "builder");
}

function routeRowHtml(r, i) {
  const mc = methodCls(r.method);
  return `<div class="route-row">
    <span class="route-method ${mc}">${r.method}</span>
    <span class="route-path">${esc(r.path)}</span>
    <span class="route-status">${r.status}</span>
    <button class="route-body-btn" data-i="${i}">Edit body</button>
    <button class="route-delete" data-i="${i}" title="Remove">&#x2715;</button>
  </div>`;
}

function bindRowEvents(container, arr, source) {
  container.querySelectorAll(".route-body-btn").forEach((btn) => {
    btn.addEventListener("click", () =>
      openBodyEditor(arr, parseInt(btn.dataset.i))
    );
  });
  container.querySelectorAll(".route-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      arr.splice(parseInt(btn.dataset.i), 1);
      source === "spec" ? renderSpecEndpoints() : renderRoutes();
    });
  });
}

$("add-btn").addEventListener("click", () => {
  $("new-route-form").classList.remove("hidden");
  $("nr-path").focus();
});
$("nr-cancel").addEventListener("click", () => {
  $("new-route-form").classList.add("hidden");
  $("nr-path").value = "";
  $("nr-status").value = "200";
});
$("nr-save").addEventListener("click", () => {
  const path = $("nr-path").value.trim();
  if (!path.startsWith("/")) { $("nr-path").focus(); return; }
  routes.push({
    method: $("nr-method").value,
    path,
    status: parseInt($("nr-status").value) || 200,
    body: {},
  });
  renderRoutes();
  $("new-route-form").classList.add("hidden");
  $("nr-path").value = "";
  $("nr-status").value = "200";
});

$("download-routes-btn").addEventListener("click", () => {
  const rts = getRoutes();
  if (!rts.length) return;
  const blob = new Blob([JSON.stringify(rts, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "routes.json";
  a.click();
  URL.revokeObjectURL(url);
});

// ── Upload tab ────────────────────────────────────────────────────────────────
const dropzone   = $("dropzone");
const fileInput  = $("file-input");
const uploadResult = $("upload-result");

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("drag-over");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("drag-over");
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    const lower = file.name.toLowerCase();

    if (lower.endsWith(".js")) {
      uploadMode = "raw";
      uploadedRawContent = content;
      showUploadResult("raw", file.name, null);
      return;
    }

    try {
      const result = parseUploadedFile(file.name, content);
      uploadMode = result.type;
      if (result.routes) routes = result.routes;
      showUploadResult(result.formatLabel, file.name, result.routes);
    } catch (err) {
      uploadResult.innerHTML = `<div class="upload-error">${esc(err.message)}</div>`;
      uploadResult.classList.remove("hidden");
    }
  };
  reader.readAsText(file);
}

function showUploadResult(formatLabel, filename, parsedRoutes) {
  const typeDesc = parsedRoutes
    ? `${parsedRoutes.length} route(s) extracted.`
    : "Will run directly. Server must listen on port 3000.";
  const previewRows =
    parsedRoutes?.length
      ? parsedRoutes
          .slice(0, 5)
          .map(
            (r) =>
              `<div class="route-row small">
                <span class="route-method ${methodCls(r.method)}">${r.method}</span>
                <span class="route-path">${esc(r.path)}</span>
                <span class="route-status">${r.status}</span>
              </div>`
          )
          .join("") +
        (parsedRoutes.length > 5
          ? `<div class="more-routes">+${parsedRoutes.length - 5} more</div>`
          : "")
      : "";

  uploadResult.innerHTML = `
    <div class="upload-success">
      <span class="upload-tag">${esc(formatLabel)}</span>
      <span class="upload-filename">${esc(filename)}</span>
      <span class="upload-desc">${typeDesc}</span>
    </div>
    ${previewRows ? `<div class="upload-routes-preview">${previewRows}</div>` : ""}
  `;
  uploadResult.classList.remove("hidden");
}

// ── Spec Generator tab ────────────────────────────────────────────────────────
function renderSpecEndpoints() {
  const el = $("spec-endpoints-list");
  el.innerHTML = specEndpoints.length
    ? specEndpoints.map((ep, i) => routeRowHtml(ep, i)).join("")
    : '<div class="empty-routes">No endpoints yet.</div>';
  bindRowEvents(el, specEndpoints, "spec");
  refreshSpecPreview();
}

function refreshSpecPreview() {
  specInfo.title   = $("spec-title").value.trim();
  specInfo.version = $("spec-version").value.trim();
  const spec = buildOpenApiSpec(specInfo, specEndpoints);
  const yamlStr = specToYaml(spec);
  $("spec-preview").textContent = yamlStr;
  if (specBlobUrl) URL.revokeObjectURL(specBlobUrl);
  specBlobUrl = URL.createObjectURL(new Blob([yamlStr], { type: "text/yaml" }));
  $("spec-download-btn").href = specBlobUrl;
}

$("spec-title").addEventListener("input", refreshSpecPreview);
$("spec-version").addEventListener("input", refreshSpecPreview);

$("spec-add-btn").addEventListener("click", () => {
  $("spec-new-form").classList.remove("hidden");
  $("sp-path").focus();
});
$("sp-cancel").addEventListener("click", () => {
  $("spec-new-form").classList.add("hidden");
  $("sp-path").value = "";
  $("sp-status").value = "200";
  $("sp-summary").value = "";
});
$("sp-save").addEventListener("click", () => {
  const path = $("sp-path").value.trim();
  if (!path.startsWith("/")) { $("sp-path").focus(); return; }
  specEndpoints.push({
    method: $("sp-method").value,
    path,
    status: parseInt($("sp-status").value) || 200,
    summary: $("sp-summary").value.trim(),
    body: {},
  });
  renderSpecEndpoints();
  $("spec-new-form").classList.add("hidden");
  $("sp-path").value = "";
  $("sp-status").value = "200";
  $("sp-summary").value = "";
});

$("spec-copy-btn").addEventListener("click", () => {
  navigator.clipboard.writeText($("spec-preview").textContent);
  const btn = $("spec-copy-btn");
  const orig = btn.innerHTML;
  btn.innerHTML = "✓";
  btn.style.color = "var(--green)";
  setTimeout(() => { btn.innerHTML = orig; btn.style.color = ""; }, 2000);
});

// ── Body editor ───────────────────────────────────────────────────────────────
function openBodyEditor(arr, index) {
  editingTarget = { arr, index };
  const r = arr[index];
  bodyEditorLabel.textContent = `${r.method} ${r.path}`;
  // Body: if binary (data URI) show the raw string; otherwise pretty-print JSON
  bodyEditorTA.value = typeof r.body === "string"
    ? r.body
    : JSON.stringify(r.body, null, 2);
  $("body-editor-ct").value = r.contentType || "application/json";
  bodyEditorCard.classList.remove("hidden");
  bodyEditorTA.focus();
}

$("body-editor-save").addEventListener("click", () => {
  const ct  = $("body-editor-ct").value;
  const raw = bodyEditorTA.value;
  const route = editingTarget.arr[editingTarget.index];

  // Store content-type on the route
  route.contentType = ct;

  if (ct === "application/json") {
    try {
      route.body = JSON.parse(raw);
    } catch (_) {
      bodyEditorTA.style.borderColor = "var(--red)";
      setTimeout(() => { bodyEditorTA.style.borderColor = ""; }, 1500);
      return;
    }
  } else {
    // Non-JSON: store body as raw string (or data URI for binary)
    route.body = raw;
  }

  bodyEditorCard.classList.add("hidden");
  if (currentTab === "spec") refreshSpecPreview();
  editingTarget = null;
});
$("body-editor-close").addEventListener("click", () => {
  bodyEditorCard.classList.add("hidden");
  editingTarget = null;
});

$("body-editor-ct").addEventListener("change", syncBodyEditorHint);

function syncBodyEditorHint() {
  const ct   = $("body-editor-ct").value;
  const hint = $("body-editor-hint");
  if (ct === "application/json") {
    hint.textContent = 'VALID JSON — { }, [ ], "string", 42, true';
  } else if (ct.startsWith("image/") || ct === "application/pdf" || ct === "application/octet-stream") {
    hint.textContent = "BINARY — use UPLOAD FILE to load from disk";
  } else {
    hint.textContent = "PLAIN TEXT OR MARKUP";
  }
}

$("body-upload-btn").addEventListener("click", () => $("body-file-input").click());

$("body-file-input").addEventListener("change", () => {
  const file = $("body-file-input").files[0];
  if (!file) return;

  const ctSelect = $("body-editor-ct");
  if      (file.type === "image/png")             ctSelect.value = "image/png";
  else if (file.type === "image/jpeg")            ctSelect.value = "image/jpeg";
  else if (file.type === "application/pdf")       ctSelect.value = "application/pdf";
  else                                            ctSelect.value = "application/octet-stream";
  syncBodyEditorHint();

  const reader = new FileReader();
  reader.onload = (e) => { bodyEditorTA.value = e.target.result; };
  reader.readAsDataURL(file);
  $("body-file-input").value = "";
});

// ── Copy / open portal ────────────────────────────────────────────────────────
copyBtn.addEventListener("click", () => {
  const url = openBtn.href;
  if (url && url !== "#") {
    navigator.clipboard.writeText(url);
    copyBtn.textContent = "COPIED!";
    setTimeout(() => { copyBtn.textContent = "COPY"; }, 2000);
  }
});

// ── Spectrum tape-load overlay ────────────────────────────────────────────────
// Modal-only loading state. No scanline or border frame.

let dotsTimer = null;

function startSpectrumOverlay() {
  const overlay = $("spectrum-overlay");
  clearInterval(dotsTimer);

  // Reset modal position (may have been dragged)
  const modal = $("sov-modal");
  modal.style.position = "";
  modal.style.left = "";
  modal.style.top = "";
  modal.style.transform = "";
  modal.style.width = "";
  modal.style.margin = "";

  // Reset modal content
  $("sov-art").textContent = "";
  $("sov-url-row").classList.add("hidden");
  $("sov-actions").classList.add("hidden");
  $("sov-url").textContent = "";
  $("sov-meta").textContent = "";

  overlay.classList.add("active");
  overlay.classList.remove("done");
  $("sov-loading").classList.remove("hidden");

  // Animate the dots
  let dotCount = 3;
  dotsTimer = setInterval(() => {
    dotCount = dotCount === 3 ? 1 : dotCount + 1;
    $("sov-dots").textContent = ".".repeat(dotCount);
  }, 400);
}

function hideSpectrumOverlay() {
  const overlay = $("spectrum-overlay");
  overlay.style.transition = "opacity 0.3s";
  overlay.style.opacity = "0";
  setTimeout(() => {
    overlay.classList.remove("active");
    overlay.style.opacity = "";
    overlay.style.transition = "";
  }, 300);
}

function completeSpectrumOverlay(url, routeCount, isWebhook) {
  clearInterval(dotsTimer);
  $("sov-loading").classList.add("hidden"); // hide "LOADING..." text

  // Populate modal content — scanner will reveal it as it sweeps the rest
  $("sov-art").textContent = isWebhook
    ? `╔══════════════════════════════╗
║  WEBHOOK RECEIVER  LIVE      ║
║                              ║
║  ALL REQUESTS LOGGED         ║
║  OPEN URL FOR DASHBOARD      ║
╚══════════════════════════════╝`
    : `╔══════════════════════════════╗
║  SERVER  READY               ║
║                              ║
║  ROUTES : ${String(routeCount).padEnd(19)}║
║  CORS   : ENABLED            ║
╚══════════════════════════════╝`;

  $("sov-url").textContent = url;
  $("sov-open").href       = url;
  $("sov-meta").textContent = isWebhook
    ? "CAPTURING ALL HTTP REQUESTS"
    : `${routeCount} ROUTE${routeCount !== 1 ? "S" : ""} ACTIVE`;
  $("sov-url-row").classList.remove("hidden");
  $("sov-actions").classList.remove("hidden");

  // Copy button inside modal
  $("sov-copy").onclick = () => {
    navigator.clipboard.writeText(url);
    $("sov-copy").textContent = "COPIED!";
    setTimeout(() => { $("sov-copy").textContent = "COPY"; }, 2000);
  };
}

$("sov-dismiss").addEventListener("click", () => {
  hideSpectrumOverlay();
});

// ── Start server ──────────────────────────────────────────────────────────────
startBtn.addEventListener("click", start);

async function start() {
  startBtn.disabled = true;
  const isWebhook = currentTab === "webhooks";
  setStatus(isWebhook ? "Booting Webhook..." : "Booting API...", "loading");
  portalCard.classList.add("hidden");
  startSpectrumOverlay();

  const pod = await BrowserPod.boot({ apiKey: import.meta.env.VITE_BP_APIKEY });
  await new Promise((r) => setTimeout(r, 500));

  const terminal = await pod.createDefaultTerminal(consoleEl);

  pod.onPortal(({ url }) => {
    const routeCount = getRoutes().length;
    serverState = { url, routeCount, isWebhook };
    completeSpectrumOverlay(url, routeCount, isWebhook);
    setStatus(isWebhook ? "Webhook Live" : "API Running", "running");
    startBtn.textContent = "RUNNING";
    document.querySelector(".tabs").classList.add("locked");
    $("view-portal-btn").classList.remove("hidden");
    portalUrlEl.textContent = url;
    openBtn.href = url;
    if (isWebhook) {
      exampleRoute.textContent = url + "/webhook";
    } else {
      const first = getRoutes()[0];
      if (first) exampleRoute.textContent = url + first.path;
    }
  });

  await pod.createDirectory("/project");

  const isRaw = currentTab === "upload" && uploadMode === "raw";

  if (isWebhook) {
    await copyFileTo(pod, "webhook/main.js", "/project/main.js");
    await copyFileTo(pod, "webhook/package.json", "/project/package.json");
    setStatus("Installing Webhook...", "loading");
    await pod.run("npm", ["install"], { echo: true, terminal, cwd: "/project" });
    setStatus("Starting Webhook...", "loading");
    pod.run("node", ["main.js"], { echo: true, terminal, cwd: "/project" });
  } else if (isRaw) {
    await writeTextFile(pod, "/project/raw-server.js", uploadedRawContent);
    await copyFile(pod, "project/package.json");
    setStatus("Starting API...", "loading");
    pod.run("node", ["raw-server.js"], { echo: true, terminal, cwd: "/project" });
  } else {
    await copyFile(pod, "project/main.js");
    await copyFile(pod, "project/package.json");
    await writeTextFile(pod, "/project/routes.json", JSON.stringify(getRoutes()));
    setStatus("Installing API...", "loading");
    await pod.run("npm", ["install"], { echo: true, terminal, cwd: "/project" });
    setStatus("Starting API...", "loading");
    pod.run("node", ["main.js"], { echo: true, terminal, cwd: "/project" });
  }
}

function getRoutes() {
  if (currentTab === "spec") return specToRoutes(specInfo, specEndpoints);
  return routes;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function setStatus(text, state) {
  statusTextEl.textContent = text;
  statusEl.className = "status status-" + state;
}

function syncStatusLabel() {
  $("status-label").textContent = currentTab === "webhooks" ? "WEBHOOK" : "API";
}

$("view-portal-btn").addEventListener("click", () => {
  if (!serverState) return;
  startSpectrumOverlay();
  completeSpectrumOverlay(serverState.url, serverState.routeCount, serverState.isWebhook);
});

function methodCls(m) {
  return ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(m) ? m : "GET";
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function loadAmbiencePreference() {
  try {
    return window.localStorage.getItem(AMBIENCE_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function persistAmbiencePreference() {
  try {
    window.localStorage.setItem(AMBIENCE_STORAGE_KEY, ambienceEnabled ? "on" : "off");
  } catch {
    // Ignore storage failures.
  }
}

function syncAmbienceButton() {
  $("toggle-ambience-btn").textContent = ambienceEnabled ? "SEA SOUND: ON" : "SEA SOUND: OFF";
}

async function setAmbienceEnabled(enabled) {
  ambienceEnabled = enabled;
  ambienceArmed = enabled;
  persistAmbiencePreference();
  syncAmbienceButton();

  if (!enabled) {
    ambiencePlayPending = false;
    ambienceAudio.pause();
    ambienceAudio.currentTime = 0;
    return;
  }

  await tryStartAmbience();
}

async function tryStartAmbience() {
  if (!ambienceEnabled || ambiencePlayPending || !ambienceAudio.paused) {
    return;
  }

  ambiencePlayPending = true;
  try {
    await ambienceAudio.play();
    ambienceArmed = false;
  } catch {
    // If autoplay is blocked or a play is interrupted, keep it armed for the next gesture.
    ambienceArmed = true;
  } finally {
    ambiencePlayPending = false;
  }
}

function armAmbiencePlayback() {
  if (!ambienceArmed || !ambienceEnabled) return;
  void tryStartAmbience();
}

function loadNotebookNote() {
  try {
    return window.localStorage.getItem(NOTE_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

notebookTextarea.addEventListener("input", () => {
  try {
    window.localStorage.setItem(NOTE_STORAGE_KEY, notebookTextarea.value);
  } catch {
    // Ignore storage failures.
  }
});

notebookDownload.addEventListener("click", () => {
  const text = notebookTextarea.value;
  const blob = new Blob([text], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "notebook.txt";
  a.click();
  URL.revokeObjectURL(url);
});

function getCaretViewportPosition(target) {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return getTextInputCaretPosition(target);
  }

  if (target?.isContentEditable) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rect = range.getClientRects()[0] || range.getBoundingClientRect();
    if (!rect) return null;
    return { x: rect.left, y: rect.top + rect.height * 0.5 };
  }

  return null;
}

function getTextInputCaretPosition(input) {
  if (typeof input.selectionStart !== "number") return null;

  const style = window.getComputedStyle(input);
  const mirror = document.createElement("div");
  const marker = document.createElement("span");
  const inputRect = input.getBoundingClientRect();
  const before = input.value.slice(0, input.selectionStart);
  const after = input.value.slice(input.selectionStart) || ".";

  mirror.style.position = "fixed";
  mirror.style.left = "-9999px";
  mirror.style.top = "0";
  mirror.style.whiteSpace = input instanceof HTMLTextAreaElement ? "pre-wrap" : "pre";
  mirror.style.overflowWrap = "break-word";
  mirror.style.visibility = "hidden";
  mirror.style.font = style.font;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.textTransform = style.textTransform;
  mirror.style.padding = style.padding;
  mirror.style.border = style.border;
  mirror.style.boxSizing = style.boxSizing;
  mirror.style.width = `${input.clientWidth}px`;
  mirror.style.lineHeight = style.lineHeight;

  mirror.textContent = before;
  marker.textContent = after[0];
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const mirrorRect = mirror.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  document.body.removeChild(mirror);

  return {
    x: inputRect.left + (markerRect.left - mirrorRect.left),
    y: inputRect.top + (markerRect.top - mirrorRect.top) + parseFloat(style.fontSize || "16") * 0.5 - input.scrollTop,
  };
}

function spawnPoopBurst(x, y) {
  const count = 84;

  for (let i = 0; i < count; i++) {
    const angle = (-Math.PI / 2) + ((i / (count - 1)) - 0.5) * 1.95;
    const speed = 260 + Math.random() * 260;
    poopParticles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (40 + Math.random() * 120),
      gravity: 220 + Math.random() * 80,
      rotation: (Math.random() - 0.5) * 0.9,
      spin: (Math.random() - 0.5) * 3.8,
      size: 28 + Math.random() * 18,
      life: 0,
      ttl: 2200 + Math.random() * 700,
      alpha: 1,
    });
  }

  if (!poopAnimId) {
    lastPoopFrame = performance.now();
    poopAnimId = requestAnimationFrame(stepPoopParticles);
  }
}

function resizePoopCanvas() {
  if (!poopCanvas || !poopCtx) return;

  const dpr = window.devicePixelRatio || 1;
  poopCanvas.width = Math.floor(window.innerWidth * dpr);
  poopCanvas.height = Math.floor(window.innerHeight * dpr);
  poopCanvas.style.width = `${window.innerWidth}px`;
  poopCanvas.style.height = `${window.innerHeight}px`;
  poopCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  poopCtx.textAlign = "center";
  poopCtx.textBaseline = "middle";
}

function stepPoopParticles(now) {
  if (!poopCtx || !poopCanvas) return;

  const dt = Math.min((now - lastPoopFrame) / 1000, 0.033);
  lastPoopFrame = now;

  poopCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  poopParticles = poopParticles.filter((particle) => {
    particle.life += dt * 1000;
    particle.vy += particle.gravity * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.rotation += particle.spin * dt;

    const progress = particle.life / particle.ttl;
    if (progress >= 1) return false;

    particle.alpha = progress < 0.82 ? 1 : 1 - ((progress - 0.82) / 0.18);

    poopCtx.save();
    poopCtx.globalAlpha = Math.max(0, particle.alpha);
    poopCtx.translate(particle.x, particle.y);
    poopCtx.rotate(particle.rotation);
    poopCtx.font = `${particle.size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    poopCtx.fillText("💩", 0, 0);
    poopCtx.restore();
    return true;
  });

  if (poopParticles.length) {
    poopAnimId = requestAnimationFrame(stepPoopParticles);
  } else {
    poopAnimId = null;
    poopCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
}

// ── Draggable windows ─────────────────────────────────────────────────────────
function makeDraggable(card, handle, zIndex = "10") {
  handle.addEventListener("mousedown", (e) => {
    if (e.target.closest("button, a, input, select, textarea")) return;
    e.preventDefault();
    const rect = card.getBoundingClientRect();
    // Detach from document flow on first drag
    if (getComputedStyle(card).position !== "fixed") {
      card.style.position = "fixed";
      card.style.width    = rect.width + "px";
      card.style.zIndex   = zIndex;
      card.style.margin   = "0";
    }
    card.style.left      = rect.left + "px";
    card.style.top       = rect.top  + "px";
    card.style.right     = "auto";
    card.style.bottom    = "auto";
    card.style.transform = "none";
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;
    handle.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    function onMove(e) {
      card.style.left = (e.clientX - startX) + "px";
      card.style.top  = (e.clientY - startY) + "px";
    }
    function onUp() {
      handle.style.cursor = "grab";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  });
}

makeDraggable($("config-card"),   $("config-card").querySelector(".config-card-title"));
makeDraggable(bodyEditorCard,     bodyEditorCard.querySelector(".section-header"));
makeDraggable(portalCard,         portalCard.querySelector(".portal-label"));
makeDraggable(asciiSuccess,       asciiSuccess);
makeDraggable(consoleCard,        consoleCard.querySelector(".terminal-label"));
makeDraggable(notebookPanel,      notebookPanel.querySelector(".notebook-header"));
makeDraggable($("sov-modal"),     $("sov-modal").querySelector(".sov-inner"), "9001");

// ── Page close warning ────────────────────────────────────────────────────────
window.addEventListener("beforeunload", (e) => {
  if (serverState) {
    e.preventDefault();
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
renderRoutes();
renderSpecEndpoints();
notebookTextarea.value = loadNotebookNote();
syncStatusLabel();
syncAmbienceButton();
