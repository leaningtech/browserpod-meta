import { loadMappings } from "./keymap-storage";
import {
  DEFAULT_THEME_PROFILE,
  THEME_SESSION_STORAGE_KEY,
  normalizeThemeProfile,
  parseThemeProfile,
  serializeThemeProfile,
} from "./theme-config";
import {
  loadVimConfigBundleFromPod,
  saveThemeConfigBundleToPod,
} from "./vim-config-storage";

function readSessionStorage() {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return null;
  }
  try {
    return window.sessionStorage.getItem(THEME_SESSION_STORAGE_KEY);
  } catch (_error) {
    return null;
  }
}

function writeSessionStorage(value) {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return;
  }
  try {
    window.sessionStorage.setItem(THEME_SESSION_STORAGE_KEY, value);
  } catch (_error) {
    // Ignore restricted storage contexts.
  }
}

export function loadThemeProfileFromSessionStorage() {
  const raw = readSessionStorage();
  if (!raw) {
    return normalizeThemeProfile(DEFAULT_THEME_PROFILE);
  }
  return parseThemeProfile(raw);
}

export function saveThemeProfileToSessionStorage(profile) {
  const serialized = serializeThemeProfile(profile);
  writeSessionStorage(serialized);
  return parseThemeProfile(serialized);
}

export async function loadThemeProfileFromPod({ pod }) {
  const bundle = await loadVimConfigBundleFromPod({
    pod,
    fallbackTheme: DEFAULT_THEME_PROFILE,
    fallbackMappings: loadMappings(),
  });
  return bundle.themeProfile;
}

export async function saveThemeProfileToPod({
  pod,
  terminal,
  profile,
}) {
  const bundle = await saveThemeConfigBundleToPod({
    pod,
    terminal,
    profile,
    fallbackMappings: loadMappings(),
  });
  return bundle.themeProfile;
}
