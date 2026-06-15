import { bootPod } from "./browserpod-runtime";
import {
  DEFAULT_THEME_PROFILE,
  THEME_TEMPLATES,
  THEME_CONFIG_PATH,
  THEME_FONT_OPTIONS,
  buildThemeVimRc,
  getFontOption,
  normalizeThemeProfile,
} from "./theme-config";
import {
  loadThemeProfileFromPod,
  loadThemeProfileFromSessionStorage,
  saveThemeProfileToPod,
  saveThemeProfileToSessionStorage,
} from "./theme-storage";

const SAMPLE_LINES = [
  [
    { cls: "tok-keyword", text: "function" },
    { text: " " },
    { cls: "tok-function", text: "greet" },
    { text: "(name) {" },
  ],
  [
    { text: "  " },
    { cls: "tok-keyword", text: "const" },
    { text: " " },
    { cls: "tok-type", text: "message" },
    { text: " = " },
    { cls: "tok-string", text: '"Hello, "' },
    { text: " + name" },
  ],
  [
    { text: "  " },
    { cls: "tok-comment", text: "// Quick note: tweak colors to match your workflow" },
  ],
  [
    { text: "  " },
    { cls: "tok-keyword", text: "return" },
    { text: " message + " },
    { cls: "tok-number", text: "1" },
  ],
  [{ text: "}" }],
  [
    { cls: "tok-keyword", text: "const" },
    { text: " themeName = " },
    { cls: "tok-string", text: '"VimAmp"' },
  ],
  [{ text: "console.log(greet(themeName));" }],
];

const BOOLEAN_KEYS = new Set([
  "number",
  "relativeNumber",
  "cursorLine",
  "wrap",
  "list",
  "expandTab",
  "showMode",
  "showCommand",
  "ignoreCase",
  "smartCase",
  "highlightSearch",
]);

const NUMBER_KEYS = new Set([
  "fontSize",
  "lineHeight",
  "tabStop",
  "shiftWidth",
]);

const ui = {
  status: document.querySelector("#themeStatus"),
  saveBtn: document.querySelector("#saveThemeBtn"),
  reloadBtn: document.querySelector("#reloadThemeBtn"),
  resetBtn: document.querySelector("#resetThemeBtn"),
  templateSelect: document.querySelector("#themeTemplateSelect"),
  templateInfo: document.querySelector("#themeTemplateInfo"),
  templateApplyBtn: document.querySelector("#applyThemeTemplateBtn"),
  fontFamilySelect: document.querySelector("#fontFamilySelect"),
  previewRoot: document.querySelector("#vimPreview"),
  previewCodeArea: document.querySelector("#previewCodeArea"),
  previewNumbers: document.querySelector("#previewNumbers"),
  previewCode: document.querySelector("#previewCode"),
  previewStatusline: document.querySelector("#previewStatusline"),
  vimrcPreview: document.querySelector("#vimrcPreview"),
  podTerminalHost: document.querySelector("#podTerminalHost"),
};

const controls = Array.from(document.querySelectorAll("[data-theme-key]"));
const controlsByKey = new Map(
  controls.map((element) => [element.getAttribute("data-theme-key"), element])
);

const state = {
  pod: null,
  terminal: null,
  podReady: false,
  busy: false,
  profile: normalizeThemeProfile(DEFAULT_THEME_PROFILE),
};

function setStatus(message, tone = "ok") {
  if (!ui.status) {
    return;
  }
  ui.status.textContent = message;
  ui.status.dataset.tone = tone;
}

function setBusy(isBusy) {
  state.busy = Boolean(isBusy);
  [
    ui.saveBtn,
    ui.reloadBtn,
    ui.resetBtn,
    ui.templateApplyBtn,
  ].forEach((button) => {
    if (button) {
      button.disabled = state.busy;
    }
  });
  if (ui.templateSelect) {
    ui.templateSelect.disabled = state.busy;
  }
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatWhitespace(text, profile) {
  let value = String(text || "");
  if (!profile.list) {
    return value;
  }

  const tabVisible = `»${"·".repeat(Math.max(1, profile.tabStop - 1))}`;
  value = value.replace(/\t/g, tabVisible);
  value = value.replace(/ /g, "·");
  return value;
}

function buildNumbersColumn(profile, totalLines, currentLineIndex) {
  if (!profile.number) {
    return "";
  }

  const currentLineNumber = currentLineIndex + 1;
  const rows = [];
  for (let line = 1; line <= totalLines; line += 1) {
    const value = profile.relativeNumber
      ? line === currentLineNumber
        ? line
        : Math.abs(line - currentLineNumber)
      : line;
    const currentClass = line === currentLineNumber ? " preview-number-current" : "";
    rows.push(`<div class=\"preview-number${currentClass}\">${value}</div>`);
  }
  return rows.join("");
}

function renderSampleCode(profile) {
  const currentLineIndex = 3;
  const visualLineIndex = 5;

  const lines = SAMPLE_LINES.map((tokens, index) => {
    const parts = tokens.map((token) => {
      let tokenText = formatWhitespace(token.text, profile);
      let cls = token.cls || "";

      if (profile.highlightSearch && tokenText.includes("VimAmp")) {
        tokenText = tokenText.replace("VimAmp", '<span class="tok-search">VimAmp</span>');
        cls = cls ? `${cls} has-search` : "has-search";
      }

      const safeText = tokenText.includes("tok-search")
        ? tokenText
            .split("<span class=\"tok-search\">VimAmp</span>")
            .map((chunk) => escapeHtml(chunk))
            .join('<span class="tok-search">VimAmp</span>')
        : escapeHtml(tokenText);

      if (!cls) {
        return safeText;
      }

      return `<span class=\"${escapeHtml(cls)}\">${safeText}</span>`;
    });

    const lineClasses = ["preview-line"];
    if (profile.cursorLine && index === currentLineIndex) {
      lineClasses.push("is-current");
    }
    if (index === visualLineIndex) {
      lineClasses.push("is-visual");
    }

    return `<span class=\"${lineClasses.join(" ")}\">${parts.join("")}</span>`;
  });

  ui.previewCode.innerHTML = lines.join("\n");
  ui.previewNumbers.innerHTML = buildNumbersColumn(
    profile,
    SAMPLE_LINES.length,
    currentLineIndex
  );

  ui.previewNumbers.hidden = !profile.number;
  ui.previewCodeArea.style.gridTemplateColumns = profile.number ? "auto 1fr" : "1fr";
  ui.previewCode.classList.toggle("is-wrap", profile.wrap);

  const statusParts = [];
  if (profile.showMode) {
    statusParts.push("NORMAL");
  }
  statusParts.push("/vimamp/note.txt");
  if (profile.showCommand) {
    statusParts.push(`ts:${profile.tabStop}`);
    statusParts.push(`sw:${profile.shiftWidth}`);
  }
  ui.previewStatusline.textContent = statusParts.join("  ");
}

function applyPreview(profileInput) {
  const profile = normalizeThemeProfile(profileInput);
  const font = getFontOption(profile.fontFamily);

  ui.previewRoot.style.setProperty("--vim-bg", profile.background);
  ui.previewRoot.style.setProperty("--vim-fg", profile.foreground);
  ui.previewRoot.style.setProperty("--vim-accent", profile.accent);
  ui.previewRoot.style.setProperty("--vim-cursor", profile.cursor);
  ui.previewRoot.style.setProperty("--vim-visual", profile.visualBackground);
  ui.previewRoot.style.setProperty("--vim-cursorline", profile.cursorLineBackground);
  ui.previewRoot.style.setProperty("--vim-linenr", profile.lineNumber);
  ui.previewRoot.style.setProperty("--vim-linenr-current", profile.lineNumberCurrent);
  ui.previewRoot.style.setProperty("--vim-status-bg", profile.statusLineBackground);
  ui.previewRoot.style.setProperty("--vim-status-fg", profile.statusLineForeground);
  ui.previewRoot.style.setProperty("--vim-status-nc-bg", profile.statusLineNCBackground);
  ui.previewRoot.style.setProperty("--vim-status-nc-fg", profile.statusLineNCForeground);
  ui.previewRoot.style.setProperty("--vim-split", profile.splitLine);
  ui.previewRoot.style.setProperty("--vim-keyword", profile.keywordColor);
  ui.previewRoot.style.setProperty("--vim-string", profile.stringColor);
  ui.previewRoot.style.setProperty("--vim-number", profile.numberColor);
  ui.previewRoot.style.setProperty("--vim-function", profile.functionColor);
  ui.previewRoot.style.setProperty("--vim-type", profile.typeColor);
  ui.previewRoot.style.setProperty("--vim-comment", profile.commentColor);
  ui.previewRoot.style.setProperty("--preview-font-size", `${profile.fontSize}px`);
  ui.previewRoot.style.setProperty("--preview-line-height", String(profile.lineHeight));
  ui.previewRoot.style.setProperty("--preview-font-family", font.cssFamily);

  renderSampleCode(profile);
  ui.vimrcPreview.textContent = buildThemeVimRc(profile);
}

function writeControls(profileInput) {
  const profile = normalizeThemeProfile(profileInput);
  controlsByKey.forEach((element, key) => {
    if (!(key in profile)) {
      return;
    }

    if (element.type === "checkbox") {
      element.checked = Boolean(profile[key]);
      return;
    }

    element.value = String(profile[key]);
  });
}

function readControls() {
  const raw = {};
  controlsByKey.forEach((element, key) => {
    if (BOOLEAN_KEYS.has(key)) {
      raw[key] = Boolean(element.checked);
      return;
    }

    if (NUMBER_KEYS.has(key)) {
      raw[key] = Number(element.value);
      return;
    }

    raw[key] = element.value;
  });

  return normalizeThemeProfile(raw);
}

function syncPreviewFromControls() {
  state.profile = readControls();
  applyPreview(state.profile);
}

function populateFontOptions() {
  if (!ui.fontFamilySelect) {
    return;
  }

  ui.fontFamilySelect.textContent = "";
  THEME_FONT_OPTIONS.forEach((option) => {
    const element = document.createElement("option");
    element.value = option.id;
    element.textContent = option.label;
    ui.fontFamilySelect.appendChild(element);
  });
}

function getTemplateById(templateId) {
  const key = String(templateId || "").trim();
  if (!key) {
    return null;
  }
  return THEME_TEMPLATES.find((template) => template.id === key) || null;
}

function updateTemplateInfo(templateId) {
  if (!ui.templateInfo) {
    return;
  }
  const template = getTemplateById(templateId);
  if (!template) {
    ui.templateInfo.textContent = "";
    return;
  }
  ui.templateInfo.textContent = template.description;
}

function populateTemplateOptions() {
  if (!ui.templateSelect) {
    return;
  }

  ui.templateSelect.textContent = "";
  THEME_TEMPLATES.forEach((template) => {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.label;
    ui.templateSelect.appendChild(option);
  });

  if (THEME_TEMPLATES.length > 0) {
    ui.templateSelect.value = THEME_TEMPLATES[0].id;
    updateTemplateInfo(THEME_TEMPLATES[0].id);
  }
}

function applySelectedTemplate() {
  const selectedId = ui.templateSelect?.value || "";
  const template = getTemplateById(selectedId);
  if (!template) {
    setStatus("Choose a theme template first.", "warn");
    return;
  }

  const nextProfile = normalizeThemeProfile(template.profile);
  state.profile = nextProfile;
  writeControls(nextProfile);
  applyPreview(nextProfile);
  setStatus(`Template loaded: ${template.label}. Save to persist.`);
}

async function bootThemePodIfAvailable() {
  const apiKey = String(import.meta.env?.VITE_BP_APIKEY || "").trim();
  if (!apiKey) {
    setStatus("No BrowserPod API key. Theme will save only for this browser session.", "warn");
    return;
  }

  if (!window.crossOriginIsolated) {
    setStatus("No COOP/COEP isolation. Theme will save only for this browser session.", "warn");
    return;
  }

  try {
    setStatus("Booting BrowserPod to load theme config...");
    const { pod, terminal } = await bootPod({
      apiKey,
      terminalElement: ui.podTerminalHost,
    });
    state.pod = pod;
    state.terminal = terminal;
    state.podReady = true;
  } catch (error) {
    console.error("Theme Editor BrowserPod boot failed", error);
    setStatus("BrowserPod boot failed. Session-only save mode is active.", "warn");
  }
}

async function reloadProfile() {
  setBusy(true);
  try {
    if (state.podReady && state.pod) {
      const podProfile = await loadThemeProfileFromPod({
        pod: state.pod,
      });
      state.profile = podProfile;
      saveThemeProfileToSessionStorage(podProfile);
      writeControls(state.profile);
      applyPreview(state.profile);
      setStatus(`Loaded theme from ${THEME_CONFIG_PATH}.`);
      return;
    }

    const sessionProfile = loadThemeProfileFromSessionStorage();
    state.profile = sessionProfile;
    writeControls(state.profile);
    applyPreview(state.profile);
    setStatus("Loaded theme from browser session storage.", "warn");
  } catch (error) {
    console.error("Theme profile load failed", error);
    const fallback = normalizeThemeProfile(DEFAULT_THEME_PROFILE);
    state.profile = fallback;
    writeControls(fallback);
    applyPreview(fallback);
    setStatus("Failed to load theme profile. Defaults restored.", "error");
  } finally {
    setBusy(false);
  }
}

async function saveProfile() {
  setBusy(true);
  try {
    const profile = readControls();
    state.profile = profile;
    applyPreview(profile);
    saveThemeProfileToSessionStorage(profile);

    if (state.podReady && state.pod && state.terminal) {
      await saveThemeProfileToPod({
        pod: state.pod,
        terminal: state.terminal,
        profile,
      });
      setStatus(`Theme saved to ${THEME_CONFIG_PATH} and browser session.`);
      return;
    }

    setStatus("Theme saved to browser session only (BrowserPod unavailable).", "warn");
  } catch (error) {
    console.error("Theme save failed", error);
    setStatus("Theme save failed.", "error");
  } finally {
    setBusy(false);
  }
}

function resetDefaults() {
  const defaults = normalizeThemeProfile(DEFAULT_THEME_PROFILE);
  state.profile = defaults;
  writeControls(defaults);
  applyPreview(defaults);
  setStatus("Loaded default theme values. Save to persist.");
}

function installHandlers() {
  controls.forEach((element) => {
    const eventName = element.type === "checkbox" ? "change" : "input";
    element.addEventListener(eventName, () => {
      syncPreviewFromControls();
    });
  });

  ui.reloadBtn?.addEventListener("click", () => {
    void reloadProfile();
  });

  ui.saveBtn?.addEventListener("click", () => {
    void saveProfile();
  });

  ui.resetBtn?.addEventListener("click", () => {
    resetDefaults();
  });

  ui.templateSelect?.addEventListener("change", () => {
    updateTemplateInfo(ui.templateSelect?.value || "");
  });

  ui.templateApplyBtn?.addEventListener("click", () => {
    applySelectedTemplate();
  });
}

async function init() {
  populateFontOptions();
  populateTemplateOptions();
  installHandlers();

  const seed = loadThemeProfileFromSessionStorage();
  state.profile = seed;
  writeControls(seed);
  applyPreview(seed);

  await bootThemePodIfAvailable();
  await reloadProfile();
}

void init();
