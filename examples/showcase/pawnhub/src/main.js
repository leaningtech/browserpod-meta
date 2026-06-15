import { BrowserPod } from '@leaningtech/browserpod'
import { copyFile } from './utils'

const launcher = document.getElementById("launcher");
const launchStatus = document.getElementById("launchStatus");
const launchGameButton = document.getElementById("launchGameButton");
const launchTimerMinutes = document.getElementById("launchTimerMinutes");
const launchAiRole = document.getElementById("launchAiRole");
const launchAiDepth = document.getElementById("launchAiDepth");
const launchAiThinkingTime = document.getElementById("launchAiThinkingTime");
const singleOptions = document.getElementById("singleOptions");
const multiOptions = document.getElementById("multiOptions");
const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));
const multiplayerButton = document.getElementById("multiModeButton");
const portalIframe = document.getElementById("portal");
const urlDiv = document.getElementById("url");
const hostStatus = document.getElementById("hostStatus");
const consoleEl = document.querySelector("#console");
const appStateKey = "__pawnHubBrowserPodApp";
const runtimeLockName = "pawnhub-browserpod-runtime";
const browserPodApiKey = typeof import.meta.env.VITE_BP_APIKEY === "string" ? import.meta.env.VITE_BP_APIKEY.trim() : "";
const multiplayerAvailable = browserPodApiKey.length > 0;
let selectedMode = "single";

function populateSelectRange(select, start, end, selectedValue) {
  if (!select) return;
  select.textContent = "";
  for (let value = start; value <= end; value += 1) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = String(value);
    option.selected = value === selectedValue;
    select.appendChild(option);
  }
}

function setSelectedMode(mode) {
  selectedMode = mode === "multiplayer" && multiplayerAvailable ? "multiplayer" : "single";
  modeButtons.forEach((button) => {
    button.classList.toggle("selected", button.dataset.mode === selectedMode);
  });
  singleOptions?.classList.toggle("hidden", selectedMode !== "single");
  multiOptions?.classList.toggle("hidden", selectedMode !== "multiplayer");
  if (launchGameButton) {
    launchGameButton.textContent = selectedMode === "single" ? "Launch Single Player" : "Launch Online Match";
  }
}

function setLaunchBusy(isBusy, message) {
  if (launchStatus && message) {
    launchStatus.textContent = message;
  }
  if (launchGameButton) {
    launchGameButton.disabled = isBusy;
  }
  modeButtons.forEach((button) => {
    button.disabled = isBusy;
  });
  [launchTimerMinutes, launchAiRole, launchAiDepth, launchAiThinkingTime].forEach((input) => {
    if (input) input.disabled = isBusy;
  });
}

function getLaunchConfig() {
  const timerMinutes = Math.max(1, Math.min(120, Number.parseInt(launchTimerMinutes?.value || "10", 10) || 10));
  const aiDepth = Math.max(1, Math.min(18, Number.parseInt(launchAiDepth?.value || "12", 10) || 12));
  const aiThinkingTime = Math.max(1, Math.min(100, Number.parseInt(launchAiThinkingTime?.value || "50", 10) || 50));
  return {
    mode: selectedMode,
    timerMinutes,
    aiRole: launchAiRole?.value === "white" ? "white" : "black",
    aiDepth,
    aiThinkingTime,
  };
}

function getAppState() {
  if (!window[appStateKey]) {
    window[appStateKey] = {
      promise: null,
      lockPromise: null,
      releaseLock: null,
    };
  }
  return window[appStateKey];
}

function releaseRuntimeLock(appState) {
  if (typeof appState.releaseLock !== "function") return;
  const release = appState.releaseLock;
  appState.releaseLock = null;
  appState.lockPromise = null;
  release();
}

async function acquireRuntimeLock(appState) {
  if (appState.lockPromise) {
    return appState.lockPromise;
  }
  if (!navigator.locks?.request) {
    appState.lockPromise = Promise.resolve();
    return appState.lockPromise;
  }

  let releaseHeldLock;
  const heldUntilRelease = new Promise((resolve) => {
    releaseHeldLock = resolve;
  });

  appState.lockPromise = new Promise((resolve, reject) => {
    navigator.locks
      .request(runtimeLockName, { mode: "exclusive", ifAvailable: true }, async (lock) => {
        if (!lock) {
          reject(
            new Error(
              "BrowserPod is already running in another PawnHub tab or window. Close the other tab and refresh."
            )
          );
          return;
        }
        appState.releaseLock = () => releaseHeldLock();
        resolve();
        await heldUntilRelease;
      })
      .catch(reject);
  }).catch((error) => {
    appState.lockPromise = null;
    throw error;
  });

  return appState.lockPromise;
}

function setHostStatus(state, label) {
  if (!hostStatus) return;
  hostStatus.textContent = label;
  hostStatus.classList.remove("checking", "online", "offline");
  hostStatus.classList.add(state);
  hostStatus.classList.toggle("hidden", state === "online");
}

function showStartupError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const friendlyMessage =
    message.includes("createSyncAccessHandle") || message.includes("NoModificationAllowedError")
      ? "BrowserPod storage is already in use. Close any other PawnHub tab or window, then refresh."
      : message;

  console.error("PawnHub startup failed:", error);
  setLaunchBusy(false, friendlyMessage);
  setHostStatus("offline", "Host: Offline");
  if (urlDiv) {
    urlDiv.textContent = friendlyMessage;
  }
  if (consoleEl) {
    consoleEl.textContent = `[Startup failed]\n${friendlyMessage}\n`;
  }
}

function launchLocalSinglePlayer(config) {
  const params = new URLSearchParams({
    timer: String(config.timerMinutes),
    aiRole: config.aiRole,
    depth: String(config.aiDepth),
    think: String(config.aiThinkingTime),
  });
  portalIframe.src = `/single-player.html?${params.toString()}`;
  portalIframe.classList.remove("portal-hidden");
  launcher?.classList.add("hidden");
  setHostStatus("online", "Single Player");
}

async function checkHostAlive() {
  if (!hostStatus) return;
  if (!navigator.onLine) {
    setHostStatus("offline", "Host: Offline");
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const resp = await fetch("/", { method: "HEAD", cache: "no-store", signal: controller.signal });
    if (resp) {
      setHostStatus("online", "Host: Online");
      return;
    }
    setHostStatus("offline", "Host: Offline");
  } catch {
    setHostStatus("offline", "Host: Offline");
  } finally {
    clearTimeout(timeout);
  }
}

async function bootstrap(config) {
  const appState = getAppState();
  await acquireRuntimeLock(appState);

  try {
    // VITE_BP_APIKEY is an environmental variable containing your Api Key.
    // Its value is defined in the file `.env` in the project's main directory.
    const pod = await BrowserPod.boot({ apiKey: browserPodApiKey });

    const terminal = await pod.createDefaultTerminal(consoleEl);

    pod.onPortal(({ url, port }) => {
      urlDiv.innerHTML = `Portal available at <a href="${url}">${url}</a> for local server listening on port ${port}`;
      portalIframe.src = url;
      portalIframe.classList.remove("portal-hidden");
      launcher?.classList.add("hidden");
    });

    await pod.createDirectory("/project", { recursive: true });
    await copyFile(pod, "project/main.js");
    await copyFile(pod, "project/index.html");
    await copyFile(pod, "project/client.js");
    await copyFile(pod, "project/styles.css");
    await copyFile(pod, "project/package.json");
    await pod.createDirectory("/project/assets", { recursive: true });
    await copyFile(pod, "project/assets/chessground.min.js");
    await copyFile(pod, "project/assets/chessground.base.css");
    await copyFile(pod, "project/assets/chessground.brown.css");
    await copyFile(pod, "project/assets/chessground.cburnett.css");
    await copyFile(pod, "project/assets/logo.png");

    await pod.createDirectory("/project/.npm", { recursive: true });
    await pod.run(
      "npm",
      ["install", "--no-audit", "--no-fund", "--omit=optional", "--cache", "/project/.npm"],
      {
        echo: true,
        terminal,
        cwd: "/project",
        env: ["npm_config_cache=/project/.npm"],
      }
    );

    setHostStatus("checking", "Host: Checking...");
    setInterval(checkHostAlive, 3000);
    checkHostAlive();

    const launchEnv = [
      `CHESS_MODE=${config.mode}`,
      `CHESS_TIMER_MINUTES=${config.timerMinutes}`,
      `CHESS_AI_ENABLED=${config.mode === "single" ? "1" : "0"}`,
      `CHESS_AI_ROLE=${config.aiRole}`,
      `CHESS_AI_DEPTH=${config.aiDepth}`,
      `CHESS_AI_THINK_MS=${config.aiThinkingTime}`,
    ];

    await pod.run("node", ["main.js"], {
      echo: true,
      terminal,
      cwd: "/project",
      env: launchEnv,
    });
  } catch (error) {
    releaseRuntimeLock(appState);
    throw error;
  }
}

async function startApp(config) {
  if (config.mode === "single") {
    launchLocalSinglePlayer(config);
    return;
  }
  const appState = getAppState();
  if (!appState.promise) {
    appState.promise = bootstrap(config).catch((error) => {
      appState.promise = null;
      throw error;
    });
  }
  return appState.promise;
}

const appState = getAppState();
populateSelectRange(launchAiDepth, 1, 18, 12);
if (!multiplayerAvailable) {
  multiplayerButton?.setAttribute("disabled", "disabled");
  multiplayerButton?.setAttribute("title", "Add VITE_BP_APIKEY to enable online multiplayer in this deployment.");
  const launcherNote = multiOptions?.querySelector(".launcher-note");
  if (launcherNote) {
    launcherNote.textContent = "Online multiplayer is unavailable until VITE_BP_APIKEY is configured for this deployment.";
  }
}
setSelectedMode("single");
modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setSelectedMode(button.dataset.mode || "single");
  });
});
window.addEventListener("pagehide", () => releaseRuntimeLock(appState), { once: true });
window.addEventListener("beforeunload", () => releaseRuntimeLock(appState), { once: true });
window.addEventListener("message", (event) => {
  if (event?.data?.type === "return-to-menu") {
    window.location.reload();
  }
});

launchGameButton?.addEventListener("click", async () => {
  const launchConfig = getLaunchConfig();
  setLaunchBusy(
    true,
    launchConfig.mode === "single"
      ? "Starting your local game..."
      : "Starting BrowserPod and preparing your online match..."
  );
  try {
    await startApp(launchConfig);
  } catch (error) {
    showStartupError(error);
  }
});
