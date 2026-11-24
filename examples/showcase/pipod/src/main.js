import { MODELS } from './models.js'
import { runBridge } from './bridge.js'
import { chooseSetup } from './setup.js'
import providerSource from '../pod/webllm-provider.ts?raw'

// Built by build-little-coder.sh
const PART_URLS = Object.entries(import.meta.glob('../pod/little-coder.tgz.*', { query:'?url', import:'default', eager:true }))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url);

// VITE_BP_APIKEY comes from .env
const API_KEY = import.meta.env.VITE_BP_APIKEY;

// Nothing downloads before this
const { modelId:MODEL_ID, keyed } = await chooseSetup({ hasKey:!!API_KEY });
const config = MODELS[MODEL_ID];

const CONTEXT = config.context ?? 32768;
const MAX_TOKENS = config.maxTokens ?? 4096;
const HOME = "/home/user";
const BRIDGE_DIR = `${HOME}/bridge`;
const EXTENSION = `${HOME}/webllm-provider/index.ts`;
const NPM_PREFIX = `${HOME}/.npm-global`;
const MARKER = `${NPM_PREFIX}/.pipod-build`;
const BUILD_ID = PART_URLS.join(" ");
const CHUNK = 4 * 1024 * 1024;
const PORTAL_FILE = `${HOME}/.pipod-portal`;

const loadingEl = document.querySelector("#loading");
const loadModelEl = document.querySelector("#load-model");
const loadPodEl = document.querySelector("#load-pod");
const setStatus = (text) => { loadModelEl.textContent = text; };
loadingEl.hidden = false;

// Load the model's engine
const ENGINES = {
  sipp:() => import('./sipp-engine.js'),
  litert:() => import('./litert-engine.js'),
};
const enginePromise = ENGINES[config.engine ?? "sipp"]().then(({ createEngine }) => createEngine({
  model:config,
  context:CONTEXT,
  onStatus:(text) => setStatus(`${config.name}: ${text}`)
}));
enginePromise.catch((err) => setStatus(`Model failed to load: ${err.message}`));

// Initialize the Pod
const { BrowserPod } = await import('@leaningtech/browserpod');
// Keyless: no portals, npm works
const pod = await BrowserPod.boot({
  ...(keyed ? { apiKey:API_KEY } : { network:await BrowserPod.createFetchNetwork({ fetch:BrowserPod.opinionatedFetch }) }),
  storageKey:"little-coder-v2"
});

// Pi's footer shows the latest
pod.onPortal(({url, port}) => {
  console.log(`[portal] ${new Date().toISOString()} port ${port} ${url}`);
  writeFile(PORTAL_FILE, `Port ${port}: ${url}`).catch(console.error);
});

async function writeFile(path, text) {
  const file = await pod.createFile(path, "utf-8");
  await file.write(text);
  await file.close();
}

const launcher = [
  "#!/bin/bash",
  `export WEBLLM_BRIDGE_DIR=${BRIDGE_DIR}`,
  `export WEBLLM_MODEL=${MODEL_ID}`,
  `export WEBLLM_CONTEXT=${CONTEXT}`,
  `export WEBLLM_MAX_TOKENS=${MAX_TOKENS}`,
  `export WEBLLM_REASONING=${config.thinking ? 1 : 0}`,
  `export PIPOD_PORTAL_FILE=${PORTAL_FILE}`,
  `export PIPOD_PORTALS=${keyed ? 1 : 0}`,
  "export LITTLE_CODER_PERMISSION_MODE=accept-all",
  `exec ${NPM_PREFIX}/bin/little-coder --no-update-check --extension ${EXTENSION} --model webllm/${MODEL_ID} "$@"`,
  ""
].join("\n");

async function readFile(path) {
  let file;
  try {
    file = await pod.openFile(path, "utf-8");
  } catch {
    return "";
  }
  try {
    return await file.read(await file.getSize());
  } finally {
    await file.close();
  }
}

// Copy in prebuilt little-coder
async function installLittleCoder() {
  if (await readFile(MARKER) === BUILD_ID) return;
  loadPodEl.textContent = "Copying PiPod into the pod";
  const parts = await Promise.all(PART_URLS.map(async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    return res.blob();
  }));
  // Gunzip in the page, not the pod
  const gunzipped = new Blob(parts).stream().pipeThrough(new DecompressionStream("gzip"));
  const data = await new Response(gunzipped).arrayBuffer();
  const tar = `${HOME}/little-coder.tar`;
  const file = await pod.createFile(tar, "binary");
  for (let i = 0; i < data.byteLength; i += CHUNK) await file.write(data.slice(i, i + CHUNK));
  await file.close();
  loadPodEl.textContent = "Unpacking PiPod";
  const unpack = `mkdir -p ${NPM_PREFIX} && tar xf ${tar} -C ${NPM_PREFIX} && rm ${tar} && printf '%s' '${BUILD_ID}' > ${MARKER}`;
  await pod.run("bash", ["-c", unpack], {terminal:terminal});
  if (await readFile(MARKER) !== BUILD_ID) throw new Error("unpacking did not finish");
}

// Create a Terminal
const terminal = await pod.createDefaultTerminal(document.querySelector("#console"));

// Clear old requests and portal
await pod.run("bash", ["-c", `rm -rf ${BRIDGE_DIR} ${PORTAL_FILE}`], {terminal:terminal});

// Copy helpers into the pod
await pod.createDirectory(`${HOME}/webllm-provider`, {recursive:true});
await pod.createDirectory(BRIDGE_DIR, {recursive:true});
await writeFile(EXTENSION, providerSource);
await writeFile(`${HOME}/little-coder.sh`, launcher);

const installed = installLittleCoder()
  .then(() => { loadPodEl.textContent = "PiPod is ready"; return true; })
  .catch((err) => { console.error(err); loadPodEl.textContent = `Setup failed: ${err.message}`; return false; });

const [engine, ready] = await Promise.all([enginePromise.catch(() => null), installed]);

if (engine && ready) {
  // Connect the pod to the model
  runBridge({
    engine,
    modelId:MODEL_ID,
    pod,
    dir:BRIDGE_DIR
  });

  // Launch, then fall back to bash
  loadingEl.hidden = true;
  await pod.run("bash", [`${HOME}/little-coder.sh`], {terminal:terminal});
  await pod.run("bash", [], {terminal:terminal});
}
