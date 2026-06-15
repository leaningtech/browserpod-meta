import { ensureTextFile, readPodTextFile, writeTextFile } from "./browserpod-runtime";
import {
  DEFAULT_THEME_PROFILE,
  LEGACY_THEME_CONFIG_PATH,
  THEME_CONFIG_PATH,
  normalizeThemeProfile,
} from "./theme-config";
import { normalizeMappingsList } from "./keymap-storage";

export const VIM_CONFIG_DIRECTORY = "/vimamp/.bp/config";
export const VIM_CONFIG_README_PATH = `${VIM_CONFIG_DIRECTORY}/README.txt`;
export const VIM_COMBINED_CONFIG_PATH = `${VIM_CONFIG_DIRECTORY}/vimamp-config.json`;
export const VIM_KEYBINDINGS_CONFIG_PATH = `${VIM_CONFIG_DIRECTORY}/keybindings.json`;

const CONFIG_SCHEMA_VERSION = 1;

const CONFIG_README_TEXT = [
  "VimAmp config directory",
  "",
  "You can use either a single combined config or separate files:",
  `- Combined: ${VIM_COMBINED_CONFIG_PATH}`,
  `- Theme only: ${THEME_CONFIG_PATH}`,
  `- Keybindings only: ${VIM_KEYBINDINGS_CONFIG_PATH}`,
  "",
  "Load order:",
  "1. Combined config",
  "2. Separate theme and keybindings (these override combined values)",
  "3. Legacy theme fallback (/vimamp/.bp/vim-theme.json)",
  "",
  "Share only the files you want. VimAmp supports combined and separate files.",
].join("\n");

function parseJson(text) {
  const source = String(text || "").trim();
  if (!source) {
    return null;
  }

  try {
    return JSON.parse(source);
  } catch (_error) {
    return null;
  }
}

function toIsoTimestamp() {
  return new Date().toISOString();
}

async function readTextIfExists(pod, fullPath) {
  try {
    return await readPodTextFile({
      pod,
      fullPath,
    });
  } catch (_error) {
    return null;
  }
}

async function writeConfigText({ pod, terminal, fullPath, text }) {
  await writeTextFile({
    pod,
    terminal,
    fullPath,
    text,
  });
}

function extractThemeProfile(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (value.theme && typeof value.theme === "object") {
    return normalizeThemeProfile(value.theme);
  }

  return normalizeThemeProfile(value);
}

function extractMappings(value) {
  if (Array.isArray(value)) {
    return normalizeMappingsList(value);
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value.mappings)) {
    return normalizeMappingsList(value.mappings);
  }

  if (Array.isArray(value.keybindings)) {
    return normalizeMappingsList(value.keybindings);
  }

  if (value.keybindings && typeof value.keybindings === "object") {
    if (Array.isArray(value.keybindings.mappings)) {
      return normalizeMappingsList(value.keybindings.mappings);
    }
  }

  return null;
}

function buildThemeConfigText(themeProfile) {
  return `${JSON.stringify(
    {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      updatedAt: toIsoTimestamp(),
      theme: normalizeThemeProfile(themeProfile),
    },
    null,
    2
  )}\n`;
}

function buildKeybindingsConfigText(mappings) {
  return `${JSON.stringify(
    {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      updatedAt: toIsoTimestamp(),
      mappings: normalizeMappingsList(mappings),
    },
    null,
    2
  )}\n`;
}

function buildCombinedConfigText({ themeProfile, mappings }) {
  return `${JSON.stringify(
    {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      updatedAt: toIsoTimestamp(),
      theme: normalizeThemeProfile(themeProfile),
      keybindings: {
        mappings: normalizeMappingsList(mappings),
      },
    },
    null,
    2
  )}\n`;
}

async function ensureConfigScaffold(pod) {
  await pod.createDirectory(VIM_CONFIG_DIRECTORY, { recursive: true });
  await ensureTextFile({
    pod,
    fullPath: VIM_CONFIG_README_PATH,
    defaultText: CONFIG_README_TEXT,
  });
}

export async function loadVimConfigBundleFromPod({
  pod,
  fallbackTheme = DEFAULT_THEME_PROFILE,
  fallbackMappings = [],
} = {}) {
  if (!pod) {
    throw new Error("BrowserPod instance is required.");
  }

  await ensureConfigScaffold(pod);
  const normalizedFallbackTheme = normalizeThemeProfile(fallbackTheme);
  const normalizedFallbackMappings = normalizeMappingsList(fallbackMappings);

  await Promise.all([
    ensureTextFile({
      pod,
      fullPath: THEME_CONFIG_PATH,
      defaultText: buildThemeConfigText(normalizedFallbackTheme),
    }),
    ensureTextFile({
      pod,
      fullPath: LEGACY_THEME_CONFIG_PATH,
      defaultText: `${JSON.stringify(normalizedFallbackTheme, null, 2)}\n`,
    }),
    ensureTextFile({
      pod,
      fullPath: VIM_KEYBINDINGS_CONFIG_PATH,
      defaultText: buildKeybindingsConfigText(normalizedFallbackMappings),
    }),
    ensureTextFile({
      pod,
      fullPath: VIM_COMBINED_CONFIG_PATH,
      defaultText: buildCombinedConfigText({
        themeProfile: normalizedFallbackTheme,
        mappings: normalizedFallbackMappings,
      }),
    }),
  ]);

  const [
    combinedText,
    themeText,
    keybindingsText,
    legacyThemeText,
  ] = await Promise.all([
    readTextIfExists(pod, VIM_COMBINED_CONFIG_PATH),
    readTextIfExists(pod, THEME_CONFIG_PATH),
    readTextIfExists(pod, VIM_KEYBINDINGS_CONFIG_PATH),
    readTextIfExists(pod, LEGACY_THEME_CONFIG_PATH),
  ]);

  const combinedConfig = parseJson(combinedText);
  const separateThemeConfig = parseJson(themeText);
  const separateKeybindingsConfig = parseJson(keybindingsText);
  const legacyThemeConfig = parseJson(legacyThemeText);

  let themeProfile = normalizeThemeProfile(fallbackTheme);
  let mappings = normalizeMappingsList(fallbackMappings);

  const combinedTheme = extractThemeProfile(combinedConfig);
  if (combinedTheme) {
    themeProfile = combinedTheme;
  }

  const combinedMappings = extractMappings(combinedConfig);
  if (combinedMappings) {
    mappings = combinedMappings;
  }

  const separateTheme = extractThemeProfile(separateThemeConfig);
  if (separateTheme) {
    themeProfile = separateTheme;
  } else {
    const legacyTheme = extractThemeProfile(legacyThemeConfig);
    if (legacyTheme) {
      themeProfile = legacyTheme;
    }
  }

  const separateMappings = extractMappings(separateKeybindingsConfig);
  if (separateMappings) {
    mappings = separateMappings;
  }

  return {
    themeProfile,
    mappings,
    paths: {
      directory: VIM_CONFIG_DIRECTORY,
      readme: VIM_CONFIG_README_PATH,
      combined: VIM_COMBINED_CONFIG_PATH,
      theme: THEME_CONFIG_PATH,
      keybindings: VIM_KEYBINDINGS_CONFIG_PATH,
      legacyTheme: LEGACY_THEME_CONFIG_PATH,
    },
  };
}

export async function saveThemeConfigBundleToPod({
  pod,
  terminal,
  profile,
  fallbackMappings = [],
}) {
  if (!pod) {
    throw new Error("BrowserPod instance is required.");
  }
  if (!terminal) {
    throw new Error("BrowserPod terminal is required.");
  }

  const loaded = await loadVimConfigBundleFromPod({
    pod,
    fallbackTheme: profile,
    fallbackMappings,
  });

  const themeProfile = normalizeThemeProfile(profile);
  const mappings = normalizeMappingsList(
    loaded.mappings.length > 0 ? loaded.mappings : fallbackMappings
  );

  await Promise.all([
    writeConfigText({
      pod,
      terminal,
      fullPath: THEME_CONFIG_PATH,
      text: buildThemeConfigText(themeProfile),
    }),
    writeConfigText({
      pod,
      terminal,
      fullPath: LEGACY_THEME_CONFIG_PATH,
      text: `${JSON.stringify(themeProfile, null, 2)}\n`,
    }),
    writeConfigText({
      pod,
      terminal,
      fullPath: VIM_COMBINED_CONFIG_PATH,
      text: buildCombinedConfigText({
        themeProfile,
        mappings,
      }),
    }),
  ]);

  return {
    themeProfile,
    mappings,
  };
}

export async function saveKeybindingsConfigBundleToPod({
  pod,
  terminal,
  mappings,
  fallbackTheme = DEFAULT_THEME_PROFILE,
}) {
  if (!pod) {
    throw new Error("BrowserPod instance is required.");
  }
  if (!terminal) {
    throw new Error("BrowserPod terminal is required.");
  }

  const loaded = await loadVimConfigBundleFromPod({
    pod,
    fallbackTheme,
    fallbackMappings: mappings,
  });
  const themeProfile = normalizeThemeProfile(loaded.themeProfile || fallbackTheme);
  const normalizedMappings = normalizeMappingsList(mappings);

  await Promise.all([
    writeConfigText({
      pod,
      terminal,
      fullPath: VIM_KEYBINDINGS_CONFIG_PATH,
      text: buildKeybindingsConfigText(normalizedMappings),
    }),
    writeConfigText({
      pod,
      terminal,
      fullPath: VIM_COMBINED_CONFIG_PATH,
      text: buildCombinedConfigText({
        themeProfile,
        mappings: normalizedMappings,
      }),
    }),
  ]);

  return {
    themeProfile,
    mappings: normalizedMappings,
  };
}
