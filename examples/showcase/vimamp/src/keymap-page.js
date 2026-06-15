import { bootPod } from "./browserpod-runtime";
import {
  buildUserMappingVimRc,
  clearMappings,
  getModeLabel,
  loadMappings,
  removeMapping,
  upsertMapping,
} from "./keymap-storage";
import { DEFAULT_THEME_PROFILE } from "./theme-config";
import {
  VIM_KEYBINDINGS_CONFIG_PATH,
  loadVimConfigBundleFromPod,
  saveKeybindingsConfigBundleToPod,
} from "./vim-config-storage";

const DETECTION_SETTINGS_KEY = "vim_key_detection_settings_v1";
const DEFAULT_SEQUENCE_COOLDOWN_MS = 1000;
const DEFAULT_HOLD_REPEAT_DELAY_MS = 350;
const MIN_SEQUENCE_COOLDOWN_MS = 200;
const MAX_SEQUENCE_COOLDOWN_MS = 5000;
const MIN_HOLD_REPEAT_DELAY_MS = 100;
const MAX_HOLD_REPEAT_DELAY_MS = 3000;

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizeDetectionSettings(raw) {
  const safeRaw = raw && typeof raw === "object" ? raw : {};
  return {
    sequenceCooldownMs: clampNumber(
      safeRaw.sequenceCooldownMs,
      MIN_SEQUENCE_COOLDOWN_MS,
      MAX_SEQUENCE_COOLDOWN_MS,
      DEFAULT_SEQUENCE_COOLDOWN_MS
    ),
    holdRepeatDelayMs: clampNumber(
      safeRaw.holdRepeatDelayMs,
      MIN_HOLD_REPEAT_DELAY_MS,
      MAX_HOLD_REPEAT_DELAY_MS,
      DEFAULT_HOLD_REPEAT_DELAY_MS
    ),
  };
}

function loadDetectionSettings() {
  if (typeof window === "undefined" || !window.localStorage) {
    return normalizeDetectionSettings();
  }
  try {
    const stored = window.localStorage.getItem(DETECTION_SETTINGS_KEY);
    if (!stored) {
      return normalizeDetectionSettings();
    }
    const parsed = JSON.parse(stored);
    return normalizeDetectionSettings(parsed);
  } catch (_error) {
    return normalizeDetectionSettings();
  }
}

function saveDetectionSettings(settings) {
  const normalized = normalizeDetectionSettings(settings);
  if (typeof window === "undefined" || !window.localStorage) {
    return normalized;
  }
  try {
    window.localStorage.setItem(DETECTION_SETTINGS_KEY, JSON.stringify(normalized));
  } catch (_error) {
    // Ignore storage write failures.
  }
  return normalized;
}

const COMMAND_REFERENCE = [
  {
    keys: "h",
    command: "Move Left",
    effect: "Move the cursor one character left.",
    mode: "Normal",
  },
  {
    keys: "j",
    command: "Move Down",
    effect: "Move the cursor one line down.",
    mode: "Normal",
  },
  {
    keys: "k",
    command: "Move Up",
    effect: "Move the cursor one line up.",
    mode: "Normal",
  },
  {
    keys: "l",
    command: "Move Right",
    effect: "Move the cursor one character right.",
    mode: "Normal",
  },
  {
    keys: "w",
    command: "Word Forward",
    effect: "Jump to the start of the next word.",
    mode: "Normal",
  },
  {
    keys: "b",
    command: "Word Backward",
    effect: "Jump to the start of the previous word.",
    mode: "Normal",
  },
  {
    keys: "0",
    command: "Line Start",
    effect: "Move to the first character in the line.",
    mode: "Normal",
  },
  {
    keys: "$",
    command: "Line End",
    effect: "Move to the end of the current line.",
    mode: "Normal",
  },
  {
    keys: "gg",
    command: "First Line",
    effect: "Jump to the top of the file.",
    mode: "Normal",
  },
  {
    keys: "G",
    command: "Last Line",
    effect: "Jump to the bottom of the file.",
    mode: "Normal",
  },
  {
    keys: "i",
    command: "Insert Before Cursor",
    effect: "Enter Insert mode before the cursor.",
    mode: "Normal",
  },
  {
    keys: "a",
    command: "Append After Cursor",
    effect: "Enter Insert mode after the cursor.",
    mode: "Normal",
  },
  {
    keys: "o",
    command: "Open Line Below",
    effect: "Create a new line below and enter Insert mode.",
    mode: "Normal",
  },
  {
    keys: "<Esc>",
    command: "Return To Normal",
    effect: "Leave Insert/Visual mode and return to Normal mode.",
    mode: "Insert/Visual",
  },
  {
    keys: "x",
    command: "Delete Character",
    effect: "Delete the character under the cursor.",
    mode: "Normal",
  },
  {
    keys: "dw",
    command: "Delete Word",
    effect: "Delete from cursor to the end of a word.",
    mode: "Normal",
  },
  {
    keys: "dd",
    command: "Delete Line",
    effect: "Delete the current line.",
    mode: "Normal",
  },
  {
    keys: "u",
    command: "Undo",
    effect: "Undo the last change.",
    mode: "Normal",
  },
  {
    keys: "<C-r>",
    command: "Redo",
    effect: "Redo the last undone change.",
    mode: "Normal",
  },
  {
    keys: "yy",
    command: "Copy Line",
    effect: "Copy the current line.",
    mode: "Normal",
  },
  {
    keys: "p",
    command: "Paste After",
    effect: "Paste after cursor or below the current line.",
    mode: "Normal",
  },
  {
    keys: "P",
    command: "Paste Before",
    effect: "Paste before cursor or above the current line.",
    mode: "Normal",
  },
  {
    keys: "/term<CR>",
    command: "Search Forward",
    effect: "Search forward for text.",
    mode: "Normal",
  },
  {
    keys: "n",
    command: "Next Search Match",
    effect: "Move to the next search result.",
    mode: "Normal",
  },
  {
    keys: "N",
    command: "Previous Search Match",
    effect: "Move to the previous search result.",
    mode: "Normal",
  },
  {
    keys: ":%s/old/new/g<CR>",
    command: "Replace All",
    effect: "Replace all matches in the current file.",
    mode: "Command-line",
  },
  {
    keys: ":w<CR>",
    command: "Write File",
    effect: "Save current file.",
    mode: "Command-line",
  },
  {
    keys: ":q<CR>",
    command: "Quit",
    effect: "Quit current window.",
    mode: "Command-line",
  },
  {
    keys: ":wq<CR>",
    command: "Write And Quit",
    effect: "Save and quit current window.",
    mode: "Command-line",
  },
  {
    keys: ":e filename<CR>",
    command: "Open File",
    effect: "Open another file by path.",
    mode: "Command-line",
  },
  {
    keys: ":set number<CR>",
    command: "Show Line Numbers",
    effect: "Enable absolute line numbers.",
    mode: "Command-line",
  },
  {
    keys: ":set nonumber<CR>",
    command: "Hide Line Numbers",
    effect: "Disable line numbers.",
    mode: "Command-line",
  },
];

const KEYBOARD_ROWS = [
  [
    { label: "Esc", token: "<Esc>", width: 1.2 },
    { label: "F1", token: "<F1>" },
    { label: "F2", token: "<F2>" },
    { label: "F3", token: "<F3>" },
    { label: "F4", token: "<F4>" },
    { label: "F5", token: "<F5>" },
    { label: "F6", token: "<F6>" },
    { label: "F7", token: "<F7>" },
    { label: "F8", token: "<F8>" },
    { label: "F9", token: "<F9>" },
    { label: "F10", token: "<F10>" },
    { label: "F11", token: "<F11>" },
    { label: "F12", token: "<F12>" },
  ],
  [
    { label: "~", token: "`" },
    { label: "1", token: "1" },
    { label: "2", token: "2" },
    { label: "3", token: "3" },
    { label: "4", token: "4" },
    { label: "5", token: "5" },
    { label: "6", token: "6" },
    { label: "7", token: "7" },
    { label: "8", token: "8" },
    { label: "9", token: "9" },
    { label: "0", token: "0" },
    { label: "-", token: "-" },
    { label: "=", token: "=" },
    { label: "Backspace", token: "<BS>", width: 2 },
  ],
  [
    { label: "Tab", token: "<Tab>", width: 1.6 },
    { label: "Q", token: "q" },
    { label: "W", token: "w" },
    { label: "E", token: "e" },
    { label: "R", token: "r" },
    { label: "T", token: "t" },
    { label: "Y", token: "y" },
    { label: "U", token: "u" },
    { label: "I", token: "i" },
    { label: "O", token: "o" },
    { label: "P", token: "p" },
    { label: "[", token: "[" },
    { label: "]", token: "]" },
    { label: "\\", token: "\\", width: 1.4 },
  ],
  [
    { label: "Caps", width: 2, selectable: false },
    { label: "A", token: "a" },
    { label: "S", token: "s" },
    { label: "D", token: "d" },
    { label: "F", token: "f" },
    { label: "G", token: "g" },
    { label: "H", token: "h" },
    { label: "J", token: "j" },
    { label: "K", token: "k" },
    { label: "L", token: "l" },
    { label: ";", token: ";" },
    { label: "'", token: "'" },
    { label: "Enter", token: "<CR>", width: 2.2 },
  ],
  [
    { label: "Shift", width: 2.5, selectable: false },
    { label: "Z", token: "z" },
    { label: "X", token: "x" },
    { label: "C", token: "c" },
    { label: "V", token: "v" },
    { label: "B", token: "b" },
    { label: "N", token: "n" },
    { label: "M", token: "m" },
    { label: ",", token: "," },
    { label: ".", token: "." },
    { label: "/", token: "/" },
    { label: "Shift", width: 2.7, selectable: false },
  ],
  [
    { label: "Ctrl", width: 1.5, selectable: false },
    { label: "Alt", width: 1.4, selectable: false },
    { label: "Space", token: "<Space>", width: 6 },
    { label: "Alt", width: 1.4, selectable: false },
    { label: "Ctrl", width: 1.5, selectable: false },
    { label: "Left", token: "<Left>", width: 1.2 },
    { label: "Down", token: "<Down>", width: 1.2 },
    { label: "Up", token: "<Up>", width: 1.2 },
    { label: "Right", token: "<Right>", width: 1.2 },
  ],
];

const ui = {
  keyboardLayout: document.querySelector("#keyboardLayout"),
  selectedKeyToken: document.querySelector("#selectedKeyToken"),
  liveKeys: document.querySelector("#liveKeys"),
  liveCommand: document.querySelector("#liveCommand"),
  liveCooldown: document.querySelector("#liveCooldown"),
  sequenceCooldownInput: document.querySelector("#sequenceCooldownInput"),
  holdRepeatDelayInput: document.querySelector("#holdRepeatDelayInput"),
  macroForm: document.querySelector("#macroForm"),
  macroMode: document.querySelector("#macroMode"),
  macroBody: document.querySelector("#macroBody"),
  macroLabel: document.querySelector("#macroLabel"),
  macroStatus: document.querySelector("#macroStatus"),
  removeMappingBtn: document.querySelector("#removeMappingBtn"),
  clearMappingsBtn: document.querySelector("#clearMappingsBtn"),
  mappingTableBody: document.querySelector("#mappingTableBody"),
  commandSearch: document.querySelector("#commandSearch"),
  commandTableBody: document.querySelector("#commandTableBody"),
  vimrcPreview: document.querySelector("#vimrcPreview"),
};

const state = {
  selectedKey: "j",
  mappings: loadMappings(),
  detectionSettings: loadDetectionSettings(),
  liveTokens: [],
  liveResetTimer: null,
  liveCountdownTimer: null,
  liveResetDeadline: 0,
  keyHoldStartByCode: new Map(),
  pod: null,
  terminal: null,
  podReady: false,
};

const SELECTABLE_TOKENS = new Set(
  KEYBOARD_ROWS.flat()
    .filter((key) => key.selectable !== false && key.token)
    .map((key) => key.token)
);

function parseCommandTokens(sequence) {
  const text = String(sequence ?? "");
  if (!text) {
    return [];
  }

  const tokens = [];
  let index = 0;
  while (index < text.length) {
    if (text[index] === "<") {
      const close = text.indexOf(">", index + 1);
      if (close !== -1) {
        tokens.push(text.slice(index, close + 1));
        index = close + 1;
        continue;
      }
    }

    if (text[index] === " ") {
      tokens.push("<Space>");
      index += 1;
      continue;
    }

    tokens.push(text[index]);
    index += 1;
  }

  return tokens;
}

const DETECTABLE_COMMANDS = COMMAND_REFERENCE.map((item) => ({
  ...item,
  tokens: parseCommandTokens(item.keys),
})).filter((item) => item.tokens.length > 0);

const MAX_SEQUENCE_TOKENS = Math.max(
  ...DETECTABLE_COMMANDS.map((item) => item.tokens.length),
  12
);

function isFormField(element) {
  return !!element?.closest("input, select, textarea, button, a");
}

function getActiveMode() {
  return ui.macroMode.value || "normal";
}

function getModeRank(mode) {
  if (mode === "normal") {
    return 0;
  }
  if (mode === "visual") {
    return 1;
  }
  if (mode === "insert") {
    return 2;
  }
  return 99;
}

function findMapping(mode, key) {
  return state.mappings.find((item) => item.mode === mode && item.key === key) ?? null;
}

function hasMappingForToken(token) {
  return state.mappings.some((item) => item.key === token);
}

function setStatus(message, tone = "neutral") {
  ui.macroStatus.textContent = message;
  ui.macroStatus.classList.toggle("is-error", tone === "error");
  ui.macroStatus.classList.toggle("is-ok", tone === "ok");
}

function ensurePodTerminalHost() {
  const existing = document.querySelector("#keymapPodTerminalHost");
  if (existing instanceof HTMLElement) {
    return existing;
  }

  const element = document.createElement("div");
  element.id = "keymapPodTerminalHost";
  element.hidden = true;
  element.setAttribute("aria-hidden", "true");
  document.body.append(element);
  return element;
}

async function syncMappingsToPod({ announceSuccess = false } = {}) {
  if (!state.podReady || !state.pod || !state.terminal) {
    return false;
  }

  try {
    await saveKeybindingsConfigBundleToPod({
      pod: state.pod,
      terminal: state.terminal,
      mappings: state.mappings,
      fallbackTheme: DEFAULT_THEME_PROFILE,
    });
    if (announceSuccess) {
      setStatus(`Synced keybindings to ${VIM_KEYBINDINGS_CONFIG_PATH}.`, "ok");
    }
    return true;
  } catch (error) {
    console.error("Keybindings sync failed", error);
    setStatus("Saved locally, but config sync failed.", "error");
    return false;
  }
}

async function bootPodConfigSync() {
  const apiKey = String(import.meta.env?.VITE_BP_APIKEY || "").trim();
  if (!apiKey || !window.crossOriginIsolated) {
    return;
  }

  try {
    const { pod, terminal } = await bootPod({
      apiKey,
      terminalElement: ensurePodTerminalHost(),
    });
    state.pod = pod;
    state.terminal = terminal;
    state.podReady = true;

    const bundle = await loadVimConfigBundleFromPod({
      pod: state.pod,
      fallbackTheme: DEFAULT_THEME_PROFILE,
      fallbackMappings: state.mappings,
    });
    state.mappings = bundle.mappings;
    renderKeyboardLayout();
    renderMappingTable();
    renderVimRcPreview();
    populateEditorForSelection(true);
    setStatus(`Loaded keybindings from ${VIM_KEYBINDINGS_CONFIG_PATH}.`, "ok");
  } catch (error) {
    console.error("Keymap BrowserPod boot failed", error);
    setStatus("BrowserPod sync unavailable. Using local keybindings only.", "error");
  }
}

function formatTokenForDisplay(token) {
  if (!token) {
    return "-";
  }
  if (token === "<CR>") {
    return "Enter";
  }
  if (token === "<Esc>") {
    return "Esc";
  }
  if (token === "<Tab>") {
    return "Tab";
  }
  if (token === "<BS>") {
    return "Backspace";
  }
  if (token === "<Space>") {
    return "Space";
  }
  if (/^<C-.>$/.test(token)) {
    return `Ctrl + ${token.slice(3, 4).toUpperCase()}`;
  }
  if (token.startsWith("<") && token.endsWith(">")) {
    return token.slice(1, -1);
  }
  return token;
}

function formatTokensForDisplay(tokens) {
  if (!tokens || tokens.length === 0) {
    return "-";
  }
  return tokens.map((token) => formatTokenForDisplay(token)).join(" ");
}

function sequenceCooldownMs() {
  return state.detectionSettings.sequenceCooldownMs;
}

function holdRepeatDelayMs() {
  return state.detectionSettings.holdRepeatDelayMs;
}

function resetLiveDetectionTimer() {
  if (state.liveResetTimer) {
    clearTimeout(state.liveResetTimer);
    state.liveResetTimer = null;
  }
  const cooldownMs = sequenceCooldownMs();
  state.liveResetDeadline = Date.now() + cooldownMs;
  if (!state.liveCountdownTimer) {
    state.liveCountdownTimer = setInterval(() => {
      renderLiveCooldown();
      if (!state.liveResetDeadline) {
        clearInterval(state.liveCountdownTimer);
        state.liveCountdownTimer = null;
      }
    }, 100);
  }
  renderLiveCooldown();

  state.liveResetTimer = setTimeout(() => {
    state.liveResetTimer = null;
    state.liveResetDeadline = 0;
    state.liveTokens = [];
    renderLiveDetection(null);
    renderLiveCooldown();
  }, cooldownMs);
}

function renderLiveCooldown() {
  if (!ui.liveCooldown) {
    return;
  }

  if (!state.liveResetDeadline) {
    ui.liveCooldown.textContent = "Cooldown: ready";
    return;
  }

  const remainingMs = Math.max(0, state.liveResetDeadline - Date.now());
  if (remainingMs <= 0) {
    ui.liveCooldown.textContent = "Cooldown: ready";
    return;
  }

  ui.liveCooldown.textContent = `Sequence reset in ${(remainingMs / 1000).toFixed(1)}s`;
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function keyCodeFromEvent(event) {
  return String(event.code || "");
}

function rememberKeyHoldStart(event) {
  if (event.repeat) {
    return;
  }
  const keyCode = keyCodeFromEvent(event);
  if (!keyCode) {
    return;
  }
  state.keyHoldStartByCode.set(keyCode, nowMs());
}

function shouldAcceptRepeat(event) {
  if (!event.repeat) {
    return true;
  }

  const keyCode = keyCodeFromEvent(event);
  if (!keyCode) {
    return true;
  }

  const holdStartedAt = state.keyHoldStartByCode.get(keyCode);
  if (typeof holdStartedAt !== "number") {
    state.keyHoldStartByCode.set(keyCode, nowMs());
    return false;
  }

  return nowMs() - holdStartedAt >= holdRepeatDelayMs();
}

function releaseKeyHoldState(event) {
  const keyCode = keyCodeFromEvent(event);
  if (!keyCode) {
    return;
  }
  state.keyHoldStartByCode.delete(keyCode);
}

function clearAllKeyHoldState() {
  state.keyHoldStartByCode.clear();
}

function syncDetectionSettingsInputs() {
  if (ui.sequenceCooldownInput) {
    ui.sequenceCooldownInput.value = String(sequenceCooldownMs());
  }
  if (ui.holdRepeatDelayInput) {
    ui.holdRepeatDelayInput.value = String(holdRepeatDelayMs());
  }
}

function updateDetectionSettings(nextSettings) {
  state.detectionSettings = saveDetectionSettings({
    ...state.detectionSettings,
    ...nextSettings,
  });
  syncDetectionSettingsInputs();
  if (state.liveTokens.length > 0) {
    resetLiveDetectionTimer();
  } else {
    renderLiveCooldown();
  }
}

function normalizeSequenceCooldownInput(value) {
  return clampNumber(
    value,
    MIN_SEQUENCE_COOLDOWN_MS,
    MAX_SEQUENCE_COOLDOWN_MS,
    DEFAULT_SEQUENCE_COOLDOWN_MS
  );
}

function normalizeHoldRepeatDelayInput(value) {
  return clampNumber(
    value,
    MIN_HOLD_REPEAT_DELAY_MS,
    MAX_HOLD_REPEAT_DELAY_MS,
    DEFAULT_HOLD_REPEAT_DELAY_MS
  );
}

function endsWithTokens(source, tail) {
  if (tail.length > source.length) {
    return false;
  }
  for (let i = 0; i < tail.length; i += 1) {
    if (source[source.length - tail.length + i] !== tail[i]) {
      return false;
    }
  }
  return true;
}

function suffixPrefixLength(source, pattern) {
  const maxLength = Math.min(source.length, pattern.length);
  for (let length = maxLength; length >= 1; length -= 1) {
    let matches = true;
    for (let offset = 0; offset < length; offset += 1) {
      if (source[source.length - length + offset] !== pattern[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return length;
    }
  }
  return 0;
}

function classifyLiveSequence(tokens) {
  const fullMatches = DETECTABLE_COMMANDS.filter((item) => endsWithTokens(tokens, item.tokens));
  if (fullMatches.length > 0) {
    const best = [...fullMatches].sort((a, b) => b.tokens.length - a.tokens.length)[0];
    return {
      state: "match",
      text: `Command: ${best.command} (${best.keys}) - ${best.effect}`,
    };
  }

  let bestProgress = null;
  DETECTABLE_COMMANDS.forEach((item) => {
    const overlap = suffixPrefixLength(tokens, item.tokens);
    if (overlap > 0 && overlap < item.tokens.length) {
      if (!bestProgress || overlap > bestProgress.overlap) {
        bestProgress = { overlap, item };
      }
    }
  });

  if (bestProgress) {
    return {
      state: "progress",
      text: `Command: building ${bestProgress.item.command} (${bestProgress.overlap}/${bestProgress.item.tokens.length})`,
    };
  }

  return {
    state: "miss",
    text: "Command: no known command match yet",
  };
}

function renderLiveDetection(lastToken) {
  ui.liveKeys.textContent = `Keys: ${formatTokensForDisplay(state.liveTokens)}`;

  ui.liveCommand.classList.remove("is-match", "is-progress", "is-miss");

  if (!lastToken) {
    ui.liveCommand.textContent = "Command: -";
    return;
  }

  const result = classifyLiveSequence(state.liveTokens);
  ui.liveCommand.textContent = result.text;
  if (result.state === "match") {
    ui.liveCommand.classList.add("is-match");
    return;
  }
  if (result.state === "progress") {
    ui.liveCommand.classList.add("is-progress");
    return;
  }
  ui.liveCommand.classList.add("is-miss");
}

function setSelectedKeyLabel(token) {
  ui.selectedKeyToken.textContent = token || "none";
}

function populateEditorForSelection(clearWhenMissing = true) {
  if (!state.selectedKey) {
    if (clearWhenMissing) {
      ui.macroBody.value = "";
      ui.macroLabel.value = "";
    }
    return;
  }

  const existing = findMapping(getActiveMode(), state.selectedKey);
  if (!existing) {
    if (clearWhenMissing) {
      ui.macroBody.value = "";
      ui.macroLabel.value = "";
    }
    return;
  }

  ui.macroBody.value = existing.macro;
  ui.macroLabel.value = existing.label || "";
}

function selectKey(token, { allowUnknown = false, clearWhenMissing = true } = {}) {
  if (!allowUnknown && !SELECTABLE_TOKENS.has(token)) {
    return;
  }
  const previousKey = state.selectedKey;
  state.selectedKey = token;
  setSelectedKeyLabel(token);
  let updatedSelection = false;
  if (ui.keyboardLayout) {
    const keyButtons = ui.keyboardLayout.querySelectorAll(".key[data-key-token]");
    if (keyButtons.length > 0) {
      keyButtons.forEach((button) => {
        const keyToken = button.getAttribute("data-key-token") || "";
        if (keyToken === previousKey || keyToken === token) {
          button.classList.toggle("is-selected", keyToken === token);
        }
      });
      updatedSelection = true;
    }
  }
  if (!updatedSelection) {
    renderKeyboardLayout();
  }
  populateEditorForSelection(clearWhenMissing);
}

function createKeyButton(key) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "key";
  button.textContent = key.label;
  button.style.setProperty("--u", String(key.width ?? 1));

  if (key.selectable === false || !key.token) {
    button.disabled = true;
    return button;
  }

  button.dataset.keyToken = key.token;
  if (key.token === state.selectedKey) {
    button.classList.add("is-selected");
  }
  if (hasMappingForToken(key.token)) {
    button.classList.add("is-mapped");
  }

  button.addEventListener("click", () => {
    selectKey(key.token);
  });

  return button;
}

function renderKeyboardLayout() {
  ui.keyboardLayout.textContent = "";

  KEYBOARD_ROWS.forEach((row) => {
    const rowElement = document.createElement("div");
    rowElement.className = "key-row";
    row.forEach((key) => {
      rowElement.append(createKeyButton(key));
    });
    ui.keyboardLayout.append(rowElement);
  });
}

function createEmptyRow(colCount, message) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = colCount;
  cell.textContent = message;
  row.append(cell);
  return row;
}

function renderMappingTable() {
  ui.mappingTableBody.textContent = "";

  if (state.mappings.length === 0) {
    ui.mappingTableBody.append(createEmptyRow(5, "No mappings saved."));
    return;
  }

  const sorted = [...state.mappings].sort((a, b) => {
    const modeDiff = getModeRank(a.mode) - getModeRank(b.mode);
    if (modeDiff !== 0) {
      return modeDiff;
    }
    return a.key.localeCompare(b.key);
  });

  sorted.forEach((mapping) => {
    const row = document.createElement("tr");

    const modeCell = document.createElement("td");
    modeCell.textContent = getModeLabel(mapping.mode);
    row.append(modeCell);

    const keyCell = document.createElement("td");
    const keyCode = document.createElement("code");
    keyCode.textContent = mapping.key;
    keyCell.append(keyCode);
    row.append(keyCell);

    const macroCell = document.createElement("td");
    const macroCode = document.createElement("code");
    macroCode.textContent = mapping.macro;
    macroCell.append(macroCode);
    row.append(macroCell);

    const labelCell = document.createElement("td");
    labelCell.textContent = mapping.label || "-";
    row.append(labelCell);

    const actionCell = document.createElement("td");
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "mini-btn";
    editButton.dataset.action = "edit";
    editButton.dataset.mode = mapping.mode;
    editButton.dataset.key = mapping.key;
    editButton.textContent = "Edit";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "mini-btn";
    deleteButton.dataset.action = "delete";
    deleteButton.dataset.mode = mapping.mode;
    deleteButton.dataset.key = mapping.key;
    deleteButton.textContent = "Delete";

    actionCell.append(editButton, document.createTextNode(" "), deleteButton);
    row.append(actionCell);

    ui.mappingTableBody.append(row);
  });
}

function renderVimRcPreview() {
  const preview = buildUserMappingVimRc(state.mappings);
  if (!preview) {
    ui.vimrcPreview.textContent = '" No custom mappings yet.\n" Save a mapping to preview it here.';
    return;
  }
  ui.vimrcPreview.textContent = preview;
}

function renderCommandTable() {
  ui.commandTableBody.textContent = "";
  const query = ui.commandSearch.value.trim().toLowerCase();
  const filtered = COMMAND_REFERENCE.filter((item) => {
    if (!query) {
      return true;
    }
    const haystack = `${item.keys} ${item.command} ${item.effect} ${item.mode}`.toLowerCase();
    return haystack.includes(query);
  });

  if (filtered.length === 0) {
    ui.commandTableBody.append(createEmptyRow(5, "No commands match that search."));
    return;
  }

  filtered.forEach((item) => {
    const row = document.createElement("tr");

    const keysCell = document.createElement("td");
    const keysCode = document.createElement("code");
    keysCode.textContent = item.keys;
    keysCell.append(keysCode);
    row.append(keysCell);

    const commandCell = document.createElement("td");
    commandCell.textContent = item.command;
    row.append(commandCell);

    const effectCell = document.createElement("td");
    effectCell.textContent = item.effect;
    row.append(effectCell);

    const modeCell = document.createElement("td");
    modeCell.textContent = item.mode;
    row.append(modeCell);

    const useCell = document.createElement("td");
    const useButton = document.createElement("button");
    useButton.type = "button";
    useButton.className = "mini-btn";
    useButton.dataset.commandMacro = item.keys;
    useButton.dataset.commandName = item.command;
    useButton.textContent = "Use";
    useCell.append(useButton);
    row.append(useCell);

    ui.commandTableBody.append(row);
  });
}

function saveCurrentMapping() {
  if (!state.selectedKey) {
    setStatus("Select a key first.", "error");
    return;
  }

  const mode = getActiveMode();
  const macro = ui.macroBody.value.trim();
  const label = ui.macroLabel.value.trim();

  if (!macro) {
    setStatus("Enter a macro value before saving.", "error");
    return;
  }

  state.mappings = upsertMapping({
    mode,
    key: state.selectedKey,
    macro,
    label,
  });

  renderKeyboardLayout();
  renderMappingTable();
  renderVimRcPreview();
  setStatus(`Saved ${getModeLabel(mode)} mapping: ${state.selectedKey} -> ${macro}`, "ok");
  void syncMappingsToPod();
}

function removeCurrentMapping() {
  if (!state.selectedKey) {
    setStatus("Select a key first.", "error");
    return;
  }

  const mode = getActiveMode();
  state.mappings = removeMapping(mode, state.selectedKey);
  renderKeyboardLayout();
  renderMappingTable();
  renderVimRcPreview();
  populateEditorForSelection(true);
  setStatus(`Removed ${getModeLabel(mode)} mapping for ${state.selectedKey}.`, "ok");
  void syncMappingsToPod();
}

function tokenFromKeyboardEvent(event) {
  if (event.metaKey || event.altKey) {
    return null;
  }

  if (event.ctrlKey) {
    const key = String(event.key ?? "");
    if (key.length === 1) {
      return `<C-${key.toLowerCase()}>`;
    }
    return null;
  }

  if (event.key === "Escape") {
    return "<Esc>";
  }
  if (event.key === "Enter") {
    return "<CR>";
  }
  if (event.key === "Tab") {
    return "<Tab>";
  }
  if (event.key === "Backspace") {
    return "<BS>";
  }
  if (event.key === "ArrowLeft") {
    return "<Left>";
  }
  if (event.key === "ArrowRight") {
    return "<Right>";
  }
  if (event.key === "ArrowUp") {
    return "<Up>";
  }
  if (event.key === "ArrowDown") {
    return "<Down>";
  }
  if (event.key === " ") {
    return "<Space>";
  }
  if (event.key.length === 1) {
    return event.key;
  }

  return null;
}

function installHandlers() {
  ui.macroForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveCurrentMapping();
  });

  ui.removeMappingBtn.addEventListener("click", () => {
    removeCurrentMapping();
  });

  ui.clearMappingsBtn.addEventListener("click", () => {
    const confirmed = window.confirm("Clear all saved mappings?");
    if (!confirmed) {
      return;
    }
    state.mappings = clearMappings();
    renderKeyboardLayout();
    renderMappingTable();
    renderVimRcPreview();
    populateEditorForSelection(true);
    setStatus("Cleared all mappings.", "ok");
    void syncMappingsToPod();
  });

  ui.macroMode.addEventListener("change", () => {
    populateEditorForSelection(true);
  });

  ui.mappingTableBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }
    const mode = String(button.dataset.mode || "normal");
    const key = String(button.dataset.key || "");
    if (!key) {
      return;
    }

    if (button.dataset.action === "delete") {
      state.mappings = removeMapping(mode, key);
      renderKeyboardLayout();
      renderMappingTable();
      renderVimRcPreview();
      setStatus(`Deleted mapping ${key} in ${getModeLabel(mode)} mode.`, "ok");
      void syncMappingsToPod();
      if (state.selectedKey === key && getActiveMode() === mode) {
        populateEditorForSelection(true);
      }
      return;
    }

    ui.macroMode.value = mode;
    selectKey(key, { allowUnknown: true });
    ui.macroBody.focus();
    setStatus(`Editing ${getModeLabel(mode)} mapping for ${key}.`);
  });

  ui.commandSearch.addEventListener("input", () => {
    renderCommandTable();
  });

  ui.commandTableBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-command-macro]");
    if (!button) {
      return;
    }

    const macro = String(button.dataset.commandMacro || "").trim();
    const commandName = String(button.dataset.commandName || "").trim();
    if (!macro) {
      return;
    }
    ui.macroBody.value = macro;
    if (!ui.macroLabel.value.trim()) {
      ui.macroLabel.value = commandName;
    }
    ui.macroBody.focus();
    setStatus(`Loaded "${commandName}" into macro input.`, "ok");
  });

  ui.sequenceCooldownInput.addEventListener("change", () => {
    const nextValue = normalizeSequenceCooldownInput(ui.sequenceCooldownInput.value);
    updateDetectionSettings({ sequenceCooldownMs: nextValue });
    setStatus(`Sequence cooldown set to ${nextValue}ms.`, "ok");
  });

  ui.holdRepeatDelayInput.addEventListener("change", () => {
    const nextValue = normalizeHoldRepeatDelayInput(ui.holdRepeatDelayInput.value);
    updateDetectionSettings({ holdRepeatDelayMs: nextValue });
    setStatus(`Hold repeat delay set to ${nextValue}ms.`, "ok");
  });

  window.addEventListener(
    "keydown",
    (event) => {
      if (isFormField(event.target)) {
        return;
      }
      const token = tokenFromKeyboardEvent(event);
      if (!token) {
        return;
      }

      rememberKeyHoldStart(event);
      if (!shouldAcceptRepeat(event)) {
        return;
      }

      state.liveTokens.push(token);
      if (state.liveTokens.length > MAX_SEQUENCE_TOKENS) {
        state.liveTokens = state.liveTokens.slice(-MAX_SEQUENCE_TOKENS);
      }
      renderLiveDetection(token);
      resetLiveDetectionTimer();

      const normalizedSelectable =
        token.length === 1 ? token.toLowerCase() : token;
      if (SELECTABLE_TOKENS.has(normalizedSelectable)) {
        event.preventDefault();
        selectKey(normalizedSelectable);
      }
    },
    { capture: true }
  );

  window.addEventListener("keyup", (event) => {
    releaseKeyHoldState(event);
  });

  window.addEventListener("blur", () => {
    clearAllKeyHoldState();
  });
}

async function init() {
  if (!state.selectedKey || !SELECTABLE_TOKENS.has(state.selectedKey)) {
    const fallback = KEYBOARD_ROWS.flat().find(
      (key) => key.selectable !== false && key.token
    );
    state.selectedKey = fallback?.token || "";
  }

  renderKeyboardLayout();
  setSelectedKeyLabel(state.selectedKey);
  renderMappingTable();
  renderCommandTable();
  renderVimRcPreview();
  populateEditorForSelection(true);
  syncDetectionSettingsInputs();
  renderLiveDetection(null);
  renderLiveCooldown();
  installHandlers();
  await bootPodConfigSync();
}

void init();
