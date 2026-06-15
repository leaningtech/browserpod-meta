export const THEME_CONFIG_PATH = "/vimamp/.bp/config/theme.json";
export const LEGACY_THEME_CONFIG_PATH = "/vimamp/.bp/vim-theme.json";
export const THEME_SESSION_STORAGE_KEY = "vim_theme_profile_session_v1";
const VIM_SAFE_MONO_FONT = "Monospace";

export const THEME_FONT_OPTIONS = [
  {
    id: "ibm-plex-mono",
    label: "IBM Plex Mono",
    cssFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    vimFont: VIM_SAFE_MONO_FONT,
  },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    cssFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    vimFont: VIM_SAFE_MONO_FONT,
  },
  {
    id: "fira-code",
    label: "Fira Code",
    cssFamily: '"Fira Code", ui-monospace, SFMono-Regular, Menlo, monospace',
    vimFont: VIM_SAFE_MONO_FONT,
  },
  {
    id: "source-code-pro",
    label: "Source Code Pro",
    cssFamily: '"Source Code Pro", ui-monospace, SFMono-Regular, Menlo, monospace',
    vimFont: VIM_SAFE_MONO_FONT,
  },
  {
    id: "cascadia-mono",
    label: "Cascadia Mono",
    cssFamily: '"Cascadia Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    vimFont: VIM_SAFE_MONO_FONT,
  },
];

export const DEFAULT_THEME_PROFILE = {
  background: "#0c0c0c",
  foreground: "#e5e5e5",
  accent: "#6ea8ff",
  cursor: "#9fc3ff",
  visualBackground: "#293648",
  cursorLineBackground: "#161b22",
  lineNumber: "#6f7681",
  lineNumberCurrent: "#d2dae4",
  statusLineBackground: "#1d2735",
  statusLineForeground: "#e5ecf4",
  statusLineNCBackground: "#11161d",
  statusLineNCForeground: "#8a94a2",
  splitLine: "#334155",
  keywordColor: "#c586c0",
  stringColor: "#ce9178",
  numberColor: "#b5cea8",
  functionColor: "#dcdcaa",
  typeColor: "#4ec9b0",
  commentColor: "#6a9955",
  fontFamily: "ibm-plex-mono",
  fontSize: 14,
  lineHeight: 1.5,
  tabStop: 2,
  shiftWidth: 2,
  number: true,
  relativeNumber: false,
  cursorLine: true,
  wrap: false,
  list: false,
  expandTab: false,
  showMode: false,
  showCommand: true,
  ignoreCase: true,
  smartCase: true,
  highlightSearch: true,
};

export const THEME_TEMPLATES = [
  {
    id: "vimamp-modern",
    label: "VimAmp Modern",
    description: "Current default dark profile with modern contrast and syntax colors.",
    profile: {
      ...DEFAULT_THEME_PROFILE,
    },
  },
  {
    id: "dos-amber-crt",
    label: "DOS Amber CRT",
    description: "Monochrome amber-on-black inspired by classic DOS terminals.",
    profile: {
      ...DEFAULT_THEME_PROFILE,
      background: "#090500",
      foreground: "#ffbf40",
      accent: "#ffd166",
      cursor: "#ffcc66",
      visualBackground: "#3b2500",
      cursorLineBackground: "#1a1200",
      lineNumber: "#8a6426",
      lineNumberCurrent: "#ffd58a",
      statusLineBackground: "#2c1b00",
      statusLineForeground: "#ffe0a3",
      statusLineNCBackground: "#130d04",
      statusLineNCForeground: "#9d7d4b",
      splitLine: "#5c3f10",
      keywordColor: "#ffcf73",
      stringColor: "#ffb347",
      numberColor: "#ffd07a",
      functionColor: "#ffe2a3",
      typeColor: "#ffc66d",
      commentColor: "#9f7a3a",
      fontFamily: "ibm-plex-mono",
      showMode: true,
      cursorLine: true,
      relativeNumber: false,
    },
  },
  {
    id: "bludos",
    label: "Bludos",
    description: "Blue-screen coding palette inspired by old DOS editor screens.",
    profile: {
      ...DEFAULT_THEME_PROFILE,
      background: "#0000aa",
      foreground: "#f0f0ff",
      accent: "#55ffff",
      cursor: "#ffffff",
      visualBackground: "#2a2ad8",
      cursorLineBackground: "#00008a",
      lineNumber: "#a7b6ff",
      lineNumberCurrent: "#ffffff",
      statusLineBackground: "#000066",
      statusLineForeground: "#f2f6ff",
      statusLineNCBackground: "#00004a",
      statusLineNCForeground: "#9fb0ff",
      splitLine: "#3f55d1",
      keywordColor: "#ffff55",
      stringColor: "#55ff55",
      numberColor: "#ff9dff",
      functionColor: "#9bd6ff",
      typeColor: "#ffd27f",
      commentColor: "#9fb2ff",
      fontFamily: "ibm-plex-mono",
      fontSize: 15,
      lineHeight: 1.45,
      showMode: true,
      cursorLine: true,
      list: false,
    },
  },
  {
    id: "unix-green-phosphor",
    label: "UNIX Green Phosphor",
    description: "Green terminal phosphor look inspired by VT-era monitors.",
    profile: {
      ...DEFAULT_THEME_PROFILE,
      background: "#00110a",
      foreground: "#7cff9b",
      accent: "#66ff99",
      cursor: "#c1ffd6",
      visualBackground: "#003722",
      cursorLineBackground: "#012517",
      lineNumber: "#2ea35a",
      lineNumberCurrent: "#8dffb3",
      statusLineBackground: "#04391f",
      statusLineForeground: "#baffcf",
      statusLineNCBackground: "#022412",
      statusLineNCForeground: "#4fb172",
      splitLine: "#116036",
      keywordColor: "#8cff9e",
      stringColor: "#57f285",
      numberColor: "#b4ff80",
      functionColor: "#8affda",
      typeColor: "#7de0ff",
      commentColor: "#2f8a56",
      fontFamily: "source-code-pro",
      showMode: true,
    },
  },
  {
    id: "xterm-gray",
    label: "XTerm Gray",
    description: "Classic black/gray xterm styling from old Linux workstation setups.",
    profile: {
      ...DEFAULT_THEME_PROFILE,
      background: "#000000",
      foreground: "#c0c0c0",
      accent: "#5f87ff",
      cursor: "#e5e5e5",
      visualBackground: "#2e2e2e",
      cursorLineBackground: "#141414",
      lineNumber: "#6d6d6d",
      lineNumberCurrent: "#d8d8d8",
      statusLineBackground: "#1f1f1f",
      statusLineForeground: "#f0f0f0",
      statusLineNCBackground: "#101010",
      statusLineNCForeground: "#8f8f8f",
      splitLine: "#444444",
      keywordColor: "#87afff",
      stringColor: "#afdf87",
      numberColor: "#dfaf87",
      functionColor: "#d7afff",
      typeColor: "#87d7ff",
      commentColor: "#5f875f",
      fontFamily: "ibm-plex-mono",
      showMode: true,
      list: true,
    },
  },
  {
    id: "gvim-cream",
    label: "gVim Cream",
    description: "Light cream editor style from classic GUI Vim setups.",
    profile: {
      ...DEFAULT_THEME_PROFILE,
      background: "#f5f1dc",
      foreground: "#202020",
      accent: "#567ecf",
      cursor: "#1f3f7f",
      visualBackground: "#d8e3ff",
      cursorLineBackground: "#ece7ce",
      lineNumber: "#7f7f6a",
      lineNumberCurrent: "#2a2a1e",
      statusLineBackground: "#d8d2b6",
      statusLineForeground: "#1f1f15",
      statusLineNCBackground: "#c4bea5",
      statusLineNCForeground: "#5d5a46",
      splitLine: "#9d9783",
      keywordColor: "#2957a4",
      stringColor: "#8f5a1d",
      numberColor: "#5a6b2f",
      functionColor: "#6a3e9b",
      typeColor: "#287f7d",
      commentColor: "#6f7f5a",
      fontFamily: "jetbrains-mono",
      cursorLine: false,
    },
  },
  {
    id: "vim-desert",
    label: "Vim Desert",
    description: "Warm dark palette inspired by the classic desert.vim era.",
    profile: {
      ...DEFAULT_THEME_PROFILE,
      background: "#333333",
      foreground: "#f0e68c",
      accent: "#f0b050",
      cursor: "#ffdd88",
      visualBackground: "#54442a",
      cursorLineBackground: "#3f3f3f",
      lineNumber: "#8f8f8f",
      lineNumberCurrent: "#f5f5dc",
      statusLineBackground: "#4b4b4b",
      statusLineForeground: "#f5deb3",
      statusLineNCBackground: "#2f2f2f",
      statusLineNCForeground: "#a6a68a",
      splitLine: "#6a5f45",
      keywordColor: "#ffcc66",
      stringColor: "#ffa07a",
      numberColor: "#eedd82",
      functionColor: "#98fb98",
      typeColor: "#87ceeb",
      commentColor: "#7a9b6f",
      fontFamily: "source-code-pro",
      showMode: true,
    },
  },
  {
    id: "solarized-dark",
    label: "Solarized Dark",
    description: "Solarized-inspired low-contrast palette.",
    profile: {
      ...DEFAULT_THEME_PROFILE,
      background: "#002b36",
      foreground: "#93a1a1",
      accent: "#b58900",
      cursor: "#eee8d5",
      visualBackground: "#073642",
      cursorLineBackground: "#073642",
      lineNumber: "#586e75",
      lineNumberCurrent: "#839496",
      statusLineBackground: "#073642",
      statusLineForeground: "#93a1a1",
      statusLineNCBackground: "#00212b",
      statusLineNCForeground: "#657b83",
      splitLine: "#2c4a54",
      keywordColor: "#859900",
      stringColor: "#2aa198",
      numberColor: "#d33682",
      functionColor: "#268bd2",
      typeColor: "#6c71c4",
      commentColor: "#586e75",
      fontFamily: "fira-code",
      showMode: true,
    },
  },
];

const COLOR_KEYS = [
  "background",
  "foreground",
  "accent",
  "cursor",
  "visualBackground",
  "cursorLineBackground",
  "lineNumber",
  "lineNumberCurrent",
  "statusLineBackground",
  "statusLineForeground",
  "statusLineNCBackground",
  "statusLineNCForeground",
  "splitLine",
  "keywordColor",
  "stringColor",
  "numberColor",
  "functionColor",
  "typeColor",
  "commentColor",
];

const BOOLEAN_KEYS = [
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
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeColor(value, fallback) {
  const text = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) {
    return text.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(text)) {
    const [r, g, b] = text.slice(1);
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

export function getFontOption(fontId) {
  const key = String(fontId || "").trim();
  return (
    THEME_FONT_OPTIONS.find((option) => option.id === key) ||
    THEME_FONT_OPTIONS[0]
  );
}

export function normalizeThemeProfile(rawProfile = {}) {
  const safe = rawProfile && typeof rawProfile === "object" ? rawProfile : {};
  const fallback = DEFAULT_THEME_PROFILE;

  const profile = {};
  COLOR_KEYS.forEach((key) => {
    profile[key] = normalizeColor(safe[key], fallback[key]);
  });
  BOOLEAN_KEYS.forEach((key) => {
    profile[key] = Boolean(safe[key] ?? fallback[key]);
  });

  profile.fontFamily = getFontOption(safe.fontFamily || fallback.fontFamily).id;
  profile.fontSize = clamp(
    Number.isFinite(Number(safe.fontSize))
      ? Math.round(Number(safe.fontSize))
      : fallback.fontSize,
    11,
    28
  );
  profile.lineHeight = clamp(
    Number.isFinite(Number(safe.lineHeight))
      ? Math.round(Number(safe.lineHeight) * 100) / 100
      : fallback.lineHeight,
    1,
    2.2
  );
  profile.tabStop = clamp(
    Number.isFinite(Number(safe.tabStop))
      ? Math.round(Number(safe.tabStop))
      : fallback.tabStop,
    1,
    12
  );
  profile.shiftWidth = clamp(
    Number.isFinite(Number(safe.shiftWidth))
      ? Math.round(Number(safe.shiftWidth))
      : fallback.shiftWidth,
    1,
    12
  );

  return profile;
}

export function parseThemeProfile(text) {
  try {
    const parsed = JSON.parse(String(text || "{}"));
    return normalizeThemeProfile(parsed);
  } catch (_error) {
    return normalizeThemeProfile(DEFAULT_THEME_PROFILE);
  }
}

export function serializeThemeProfile(profile) {
  return JSON.stringify(normalizeThemeProfile(profile), null, 2);
}

function vimBoolOption(name, enabled) {
  return `${enabled ? "" : "no"}${name}`;
}

function escapeVimOptionValue(text) {
  return String(text || "").replace(/ /g, "\\ ");
}

export function buildThemeVimRc(profileInput) {
  const profile = normalizeThemeProfile(profileInput);
  const font = getFontOption(profile.fontFamily);
  const vimFontName = String(font?.vimFont || VIM_SAFE_MONO_FONT).trim() || VIM_SAFE_MONO_FONT;
  const vimFont = `${escapeVimOptionValue(vimFontName)}:h${profile.fontSize}`;
  const searchFg = profile.background;

  const lines = [
    '" Session theme profile from Theme Editor',
    "set termguicolors",
    "set background=dark",
    `set ${vimBoolOption("number", profile.number)}`,
    `set ${vimBoolOption("relativenumber", profile.relativeNumber)}`,
    `set ${vimBoolOption("cursorline", profile.cursorLine)}`,
    `set ${vimBoolOption("wrap", profile.wrap)}`,
    `set ${vimBoolOption("list", profile.list)}`,
    `set ${vimBoolOption("expandtab", profile.expandTab)}`,
    `set ${vimBoolOption("showmode", profile.showMode)}`,
    `set ${vimBoolOption("showcmd", profile.showCommand)}`,
    `set ${vimBoolOption("ignorecase", profile.ignoreCase)}`,
    `set ${vimBoolOption("smartcase", profile.smartCase)}`,
    `set ${vimBoolOption("hlsearch", profile.highlightSearch)}`,
    `set tabstop=${profile.tabStop}`,
    `set shiftwidth=${profile.shiftWidth}`,
    `set softtabstop=${profile.shiftWidth}`,
    `set guifont=${vimFont}`,
    "set linespace=0",
    "hi clear",
    "syntax reset",
    "let g:colors_name='vimamp_session_theme'",
    `hi Normal guifg=${profile.foreground} guibg=${profile.background}`,
    `hi Cursor guifg=${profile.background} guibg=${profile.cursor}`,
    `hi Visual guifg=NONE guibg=${profile.visualBackground}`,
    `hi CursorLine guifg=NONE guibg=${profile.cursorLineBackground}`,
    `hi LineNr guifg=${profile.lineNumber} guibg=${profile.background}`,
    `hi CursorLineNr guifg=${profile.lineNumberCurrent} guibg=${profile.cursorLineBackground}`,
    `hi StatusLine guifg=${profile.statusLineForeground} guibg=${profile.statusLineBackground}`,
    `hi StatusLineNC guifg=${profile.statusLineNCForeground} guibg=${profile.statusLineNCBackground}`,
    `hi VertSplit guifg=${profile.splitLine} guibg=${profile.background}`,
    `hi Search guifg=${searchFg} guibg=${profile.accent}`,
    `hi Statement guifg=${profile.keywordColor}`,
    `hi String guifg=${profile.stringColor}`,
    `hi Number guifg=${profile.numberColor}`,
    `hi Function guifg=${profile.functionColor}`,
    `hi Type guifg=${profile.typeColor}`,
    `hi Comment guifg=${profile.commentColor} gui=italic`,
    "",
  ];

  return lines.join("\n");
}
