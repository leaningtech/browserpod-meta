const STORAGE_KEY = "vim_macro_mappings_v1";

const MODE_LABEL = {
  normal: "Normal",
  insert: "Insert",
  visual: "Visual",
};

const MODE_MAP_COMMAND = {
  normal: "nnoremap",
  insert: "inoremap",
  visual: "vnoremap",
};

function readStorage() {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch (_error) {
    return null;
  }
}

function writeStorage(value) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch (_error) {
    // Ignore storage failures in restricted browsing contexts.
  }
}

function normalizeMode(value) {
  if (value === "insert" || value === "visual") {
    return value;
  }
  return "normal";
}

function normalizeKeyToken(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "");
}

function normalizeMacroBody(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .trim();
}

function normalizeLabel(value) {
  return String(value ?? "").trim();
}

function normalizeMapping(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const mode = normalizeMode(raw.mode);
  const key = normalizeKeyToken(raw.key);
  const macro = normalizeMacroBody(raw.macro);
  const label = normalizeLabel(raw.label);
  const updatedAt = Number(raw.updatedAt) || Date.now();

  if (!key || !macro) {
    return null;
  }

  return { mode, key, macro, label, updatedAt };
}

function dedupeMappings(items) {
  const byId = new Map();
  items.forEach((item) => {
    const id = `${item.mode}:${item.key}`;
    byId.set(id, item);
  });
  return [...byId.values()];
}

export function normalizeMappingsList(mappings) {
  if (!Array.isArray(mappings)) {
    return [];
  }
  return dedupeMappings(mappings.map(normalizeMapping).filter(Boolean));
}

export function getModeLabel(mode) {
  return MODE_LABEL[mode] ?? MODE_LABEL.normal;
}

export function loadMappings() {
  const stored = readStorage();
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return normalizeMappingsList(parsed);
    }
    if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed.mappings)) {
        return normalizeMappingsList(parsed.mappings);
      }
      if (parsed.keybindings && Array.isArray(parsed.keybindings.mappings)) {
        return normalizeMappingsList(parsed.keybindings.mappings);
      }
    }
    return [];
  } catch (_error) {
    return [];
  }
}

function saveMappings(mappings) {
  const safeMappings = normalizeMappingsList(mappings);
  writeStorage(JSON.stringify(safeMappings));
  return safeMappings;
}

export function replaceMappings(mappings) {
  return saveMappings(mappings);
}

export function parseMappingsConfig(rawText) {
  if (typeof rawText !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) {
      return normalizeMappingsList(parsed);
    }
    if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed.mappings)) {
        return normalizeMappingsList(parsed.mappings);
      }
      if (parsed.keybindings && Array.isArray(parsed.keybindings.mappings)) {
        return normalizeMappingsList(parsed.keybindings.mappings);
      }
    }
  } catch (_error) {
    return [];
  }

  return [];
}

export function serializeMappingsConfig(mappings) {
  const safeMappings = normalizeMappingsList(mappings);
  return JSON.stringify(
    {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      mappings: safeMappings,
    },
    null,
    2
  );
}

export function upsertMapping(mapping) {
  const normalized = normalizeMapping(mapping);
  if (!normalized) {
    return loadMappings();
  }

  const current = loadMappings();
  const filtered = current.filter(
    (item) => item.mode !== normalized.mode || item.key !== normalized.key
  );
  filtered.push({ ...normalized, updatedAt: Date.now() });
  return saveMappings(filtered);
}

export function removeMapping(mode, key) {
  const normalizedMode = normalizeMode(mode);
  const normalizedKey = normalizeKeyToken(key);
  const current = loadMappings();
  const filtered = current.filter(
    (item) => item.mode !== normalizedMode || item.key !== normalizedKey
  );
  return saveMappings(filtered);
}

export function clearMappings() {
  return saveMappings([]);
}

function sortMappings(mappings) {
  const modeRank = { normal: 0, visual: 1, insert: 2 };
  return [...mappings].sort((a, b) => {
    const byMode = (modeRank[a.mode] ?? 99) - (modeRank[b.mode] ?? 99);
    if (byMode !== 0) {
      return byMode;
    }
    return a.key.localeCompare(b.key);
  });
}

export function buildUserMappingVimRc(mappings = loadMappings()) {
  const safeMappings = sortMappings((mappings ?? []).map(normalizeMapping).filter(Boolean));
  if (safeMappings.length === 0) {
    return "";
  }

  const lines = ['" User mappings from Keyboard + Macros page'];
  safeMappings.forEach((item) => {
    const mapCommand = MODE_MAP_COMMAND[item.mode] ?? MODE_MAP_COMMAND.normal;
    lines.push(`${mapCommand} ${item.key} ${item.macro}`);
  });
  return lines.join("\n");
}
