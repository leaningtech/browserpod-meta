function serializeUnknown(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  const target = Array.isArray(value) ? [] : {};
  for (const key of Object.getOwnPropertyNames(value)) {
    const entry = value[key];
    if (typeof entry === "function") {
      continue;
    }
    target[key] = serializeUnknown(entry, seen);
  }
  return target;
}

export function formatErrorSummary(error) {
  if (error instanceof Error) {
    return error.message || error.name || "Unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    const message = typeof error.message === "string" ? error.message : "";
    const name = typeof error.name === "string" ? error.name : "";
    const code = typeof error.code === "string" ? error.code : "";
    const details = [name, message, code].filter(Boolean).join(" | ");
    return details || "Non-Error exception";
  }

  return String(error);
}

export function formatErrorDetails(error) {
  if (error instanceof Error) {
    return error.stack || `${error.name}: ${error.message}`;
  }

  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(serializeUnknown(error), null, 2);
    } catch {
      return String(error);
    }
  }

  return String(error);
}
