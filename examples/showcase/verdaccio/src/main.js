import { BrowserPod } from '@leaningtech/browserpod'
import configYaml from '../pod/config.yaml?raw'
import runScript from '../pod/run.mjs?raw'
import setupScript from '../pod/setup.sh?raw'
import startScript from '../pod/start.sh?raw'

const HOME = "/home/user";
const APP_DIR = `${HOME}/verdaccio`;
const PORT = 4873;
const START_TIMEOUT_MS = 120000;
const MAX_LOG_CHARS = 200000;

const $ = (id) => document.getElementById(id);
const loadingEl = $("loading");
const stepEl = $("step");
const detailEl = $("detail");
const appEl = $("app");
const logsEl = $("logs");

function setStep(step, detail) {
  stepEl.textContent = step;
  if (detail !== undefined) detailEl.textContent = detail;
}

function showError(message) {
  loadingEl.hidden = false;
  loadingEl.classList.add("error");
  $("spinner").hidden = true;
  appEl.hidden = true;
  setStep(message, "The logs below show what happened.");
  setLogsOpen(true);
}

function setLogsOpen(open) {
  logsEl.hidden = !open;
  if (open) logsEl.scrollTop = logsEl.scrollHeight;
}

// Collect process output
let logText = "";
const decoder = new TextDecoder();
const ANSI = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07]*\x07|\r/g;
function appendLog(text) {
  logText = (logText + text.replace(ANSI, "")).slice(-MAX_LOG_CHARS);
  const atBottom = logsEl.scrollTop + logsEl.clientHeight >= logsEl.scrollHeight - 4;
  logsEl.textContent = logText;
  if (atBottom) logsEl.scrollTop = logsEl.scrollHeight;
}
function onOutput(buf) {
  const view = ArrayBuffer.isView(buf)
    ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    : new Uint8Array(buf);
  appendLog(decoder.decode(view.slice(), {stream:true}));
}

// Boot the pod, key from .env
setStep("Starting BrowserPod");
const pod = await BrowserPod.boot({
  apiKey:import.meta.env.VITE_BP_APIKEY,
  storageKey:"verdaccio"
});

async function writeFile(path, text) {
  const file = await pod.createFile(path, "utf-8");
  await file.write(text);
  await file.close();
}

// Show Verdaccio when it's up
let ready = false;
pod.onPortal(async ({url, port}) => {
  if (port !== PORT) return;
  ready = true;
  // Asset URLs depend on it
  try {
    await writeFile(`${APP_DIR}/public-url`, url);
  } catch (err) {
    console.error(err);
  }
  loadingEl.hidden = true;
  appEl.src = url;
  appEl.hidden = false;
});

// Copy helpers into the pod
await pod.createDirectory(APP_DIR, {recursive:true});
await writeFile(`${APP_DIR}/config.default.yaml`, configYaml);
await writeFile(`${APP_DIR}/run.mjs`, runScript);
await writeFile(`${APP_DIR}/public-url`, "");
await writeFile(`${APP_DIR}/frame-origin`, location.origin);
await writeFile(`${HOME}/setup.sh`, setupScript);
await writeFile(`${HOME}/start.sh`, startScript);

const terminal = await pod.createCustomTerminal({cols:160, rows:50, onOutput});

// Install Verdaccio if needed
setStep("Checking Verdaccio", "This page runs the registry, so keep it open while you use it.");
const installWatch = setInterval(() => {
  if (logText.includes("Installing Verdaccio")) {
    setStep("Installing Verdaccio", "First run only, this takes a minute or two.");
    clearInterval(installWatch);
  }
}, 250);
await pod.run("bash", [`${HOME}/setup.sh`], {terminal, cwd:HOME});
clearInterval(installWatch);

if (!logText.includes("SETUP_DONE")) {
  showError("Installing Verdaccio failed");
} else {
  // Start Verdaccio
  setStep("Starting Verdaccio", "This page runs the registry, so keep it open while you use it.");
  Promise.resolve(pod.run("bash", [`${HOME}/start.sh`], {terminal, cwd:HOME}))
    .then(() => showError("Verdaccio stopped"))
    .catch((err) => {
      console.error(err);
      showError("Verdaccio stopped");
    });
  setTimeout(() => {
    if (!ready) showError("Verdaccio didn't start");
  }, START_TIMEOUT_MS);
}
