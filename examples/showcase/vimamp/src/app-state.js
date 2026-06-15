import { DEMO_FILE_PATH } from "./constants";

const DEFAULT_POD_STATUS = {
  status: "idle",
  message: "Pod has not started.",
  lastError: null,
  updatedAt: 0,
};

const DEFAULT_STATE = {
  started: false,
  mode: "editor",
  activeFilePath: DEMO_FILE_PATH,
  pod: null,
  terminal: null,
  podReady: false,
  vimEditor: null,
  consoleOpen: false,
  learnModeActive: false,
  lessonSession: null,
  lessonGrid: null,
  lessonAutoAdvanceTimer: null,
  vimInstanceToken: 0,
  podStatus: DEFAULT_POD_STATUS,
};

function mergeNested(defaults, overrides) {
  return {
    ...defaults,
    ...(overrides || {}),
  };
}

function nowMs() {
  return Date.now();
}

export function createAppState(initial = {}) {
  const state = {
    ...DEFAULT_STATE,
    ...initial,
    podStatus: mergeNested(DEFAULT_POD_STATUS, initial.podStatus),
  };

  const listeners = new Set();

  function emit(event, payload) {
    listeners.forEach((listener) => {
      try {
        listener({ event, payload, state });
      } catch (error) {
        console.error("State listener failed", error);
      }
    });
  }

  function setMode(mode) {
    state.mode = mode;
    emit("mode", { mode });
  }

  function setActiveFilePath(path) {
    state.activeFilePath = path;
    emit("activeFile", { path });
  }

  function setPodStatus(status, details = {}) {
    state.podStatus = {
      ...state.podStatus,
      ...details,
      status,
      updatedAt: nowMs(),
    };
    emit("podStatus", state.podStatus);
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    state,
    setMode,
    setActiveFilePath,
    setPodStatus,
    subscribe,
  };
}
