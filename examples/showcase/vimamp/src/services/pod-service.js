import { bootPod } from "../browserpod-runtime";

function getApiKeyFromEnv(env = import.meta.env) {
  return (env?.VITE_BP_APIKEY || "").trim();
}

function errorToText(error) {
  if (!error) {
    return "Unknown error";
  }
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function createPodService({
  state,
  appState,
  terminalElement,
  setStatus,
  reportFailure,
  onPortal = () => {},
  getApiKey = () => getApiKeyFromEnv(import.meta.env),
  isCrossOriginIsolated = () => window.crossOriginIsolated,
}) {
  async function bootBrowserPodIfAvailable() {
    const apiKey = getApiKey();
    if (!apiKey) {
      appState.setPodStatus("standalone", {
        message: "No API key configured.",
        lastError: null,
      });
      setStatus("No API key found. Booting Vim in standalone mode.");
      return;
    }

    if (!isCrossOriginIsolated()) {
      appState.setPodStatus("standalone", {
        message: "Cross-origin isolation is unavailable.",
        lastError: null,
      });
      setStatus("No COOP/COEP isolation. Booting Vim in standalone mode.");
      return;
    }

    appState.setPodStatus("booting", {
      message: "Booting BrowserPod runtime.",
      lastError: null,
    });

    try {
      setStatus("Booting BrowserPod runtime...");
      const { pod, terminal } = await bootPod({
        apiKey,
        terminalElement,
      });

      state.pod = pod;
      state.terminal = terminal;
      state.podReady = true;

      if (typeof pod?.onPortal === "function") {
        try {
          pod.onPortal((portal) => {
            onPortal(portal);
          });
        } catch (error) {
          console.warn("BrowserPod portal subscription failed", error);
        }
      }

      appState.setPodStatus("ready", {
        message: "BrowserPod runtime is ready.",
        lastError: null,
      });
      setStatus("BrowserPod ready. Booting Vim...");
    } catch (error) {
      appState.setPodStatus("error", {
        message: "BrowserPod runtime failed to boot.",
        lastError: errorToText(error),
      });
      reportFailure("BrowserPod boot failed.", error);
      setStatus("Continuing in Vim standalone mode.");
    }
  }

  return {
    bootBrowserPodIfAvailable,
  };
}
