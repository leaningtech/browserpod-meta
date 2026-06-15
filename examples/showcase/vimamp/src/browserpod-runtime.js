import { BrowserPod } from "@leaningtech/browserpod";
import { BOOT_STABILIZATION_MS } from "./constants";

const UTF8_MODE = "utf-8";
const BINARY_MODE = "binary";
const OVERWRITE_HELPER_DIR = "/vimamp/.bp";
const OVERWRITE_HELPER_PATH = `${OVERWRITE_HELPER_DIR}/overwrite.js`;
const LIST_HELPER_PATH = `${OVERWRITE_HELPER_DIR}/listdir.js`;
const LIST_OUTPUT_PATH = `${OVERWRITE_HELPER_DIR}/listdir-output.json`;
const FS_OPS_HELPER_PATH = `${OVERWRITE_HELPER_DIR}/fs-ops.js`;
const FS_OPS_OUTPUT_PATH = `${OVERWRITE_HELPER_DIR}/fs-ops-output.json`;

const OVERWRITE_TEXT_SCRIPT = [
  'const fs = require("fs");',
  'const path = require("path");',
  "const targetPath = process.argv[2];",
  'const base64 = process.argv[3] || "";',
  "fs.mkdirSync(path.dirname(targetPath), { recursive: true });",
  'fs.writeFileSync(targetPath, Buffer.from(base64, "base64"));',
].join("\n");

const LIST_DIRECTORY_SCRIPT = [
  'const fs = require("fs");',
  'const path = require("path");',
  'const targetPath = process.argv[2] || "/vimamp";',
  'const outputPath = process.argv[3] || "/vimamp/.bp/listdir-output.json";',
  "const payload = { ok: true, targetPath, entries: [] };",
  "try {",
  "  const entries = fs.readdirSync(targetPath, { withFileTypes: true });",
  "  payload.entries = entries",
  "    .map((entry) => ({",
  "      name: entry.name,",
  '      type: entry.isDirectory() ? "dir" : entry.isFile() ? "file" : "other",',
  "    }))",
  "    .sort((a, b) => {",
  "      if (a.type !== b.type) {",
  "        if (a.type === 'dir') return -1;",
  "        if (b.type === 'dir') return 1;",
  "      }",
  "      return a.name.localeCompare(b.name);",
  "    });",
  "} catch (error) {",
  "  payload.ok = false;",
  "  payload.error = error && error.message ? error.message : String(error);",
  "}",
  "fs.mkdirSync(path.dirname(outputPath), { recursive: true });",
  "fs.writeFileSync(outputPath, JSON.stringify(payload));",
].join("\n");

const FILESYSTEM_OPERATIONS_SCRIPT = [
  'const fs = require("fs");',
  'const path = require("path");',
  'const operation = process.argv[2] || "";',
  'const targetPath = process.argv[3] || "";',
  'const extraPath = process.argv[4] || "";',
  'const outputPath = process.argv[5] || "/vimamp/.bp/fs-ops-output.json";',
  "const payload = { ok: true, operation, targetPath, extraPath, result: null };",
  "try {",
  "  if (!targetPath) {",
  '    throw new Error("Missing target path.");',
  "  }",
  "  if (operation === 'rename') {",
  "    if (!extraPath) {",
  '      throw new Error("Missing destination path for rename.");',
  "    }",
  "    fs.mkdirSync(path.dirname(extraPath), { recursive: true });",
  "    fs.renameSync(targetPath, extraPath);",
  "    payload.result = { from: targetPath, to: extraPath };",
  "  } else if (operation === 'delete') {",
  "    fs.rmSync(targetPath, { recursive: true, force: false });",
  "    payload.result = { path: targetPath };",
  "  } else {",
  '    throw new Error(`Unsupported filesystem operation: ${operation}`);',
  "  }",
  "} catch (error) {",
  "  payload.ok = false;",
  "  payload.error = error && error.message ? error.message : String(error);",
  "}",
  "fs.mkdirSync(path.dirname(outputPath), { recursive: true });",
  "fs.writeFileSync(outputPath, JSON.stringify(payload));",
].join("\n");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  return toBase64ArrayBuffer(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  );
}

function toBase64ArrayBuffer(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize)
    );
  }
  return btoa(binary);
}

function splitCommandLine(command) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaping = false;

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];

    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (quote === "'") {
      if (char === "'") {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (quote === '"') {
      if (char === '"') {
        quote = null;
        continue;
      }
      if (char === "\\") {
        escaping = true;
        continue;
      }
      current += char;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (quote) {
    throw new Error("Command has an unclosed quote.");
  }
  if (escaping) {
    throw new Error("Command ends with an escape character.");
  }
  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

export function parsePodCommand(command) {
  const trimmed = (command || "").trim();
  if (!trimmed) {
    return null;
  }

  const parts = splitCommandLine(trimmed);
  if (parts.length === 0) {
    return null;
  }

  const [executable, ...args] = parts;
  return { executable, args };
}

async function readTextFileIfExists(pod, fullPath) {
  let file = null;
  try {
    file = await pod.openFile(fullPath, UTF8_MODE);
  } catch {
    return null;
  }

  try {
    const size = await file.getSize();
    if (size === 0) {
      return "";
    }
    return await file.read(size);
  } finally {
    await file.close();
  }
}

async function readTextFile(pod, fullPath) {
  const text = await readTextFileIfExists(pod, fullPath);
  if (text === null) {
    throw new Error(`File does not exist: ${fullPath}`);
  }
  return text;
}

async function createTextFile(pod, fullPath, text) {
  const file = await pod.createFile(fullPath, UTF8_MODE);
  try {
    await file.write(text);
  } finally {
    await file.close();
  }
}

function toArrayBuffer(data) {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  throw new Error("Expected ArrayBuffer or typed array data.");
}

async function hasBinaryFile(pod, fullPath) {
  let file = null;
  try {
    file = await pod.openFile(fullPath, BINARY_MODE);
  } catch {
    return false;
  }

  try {
    return true;
  } finally {
    await file.close();
  }
}

async function createBinaryFile(pod, fullPath, data) {
  const buffer = toArrayBuffer(data);
  const file = await pod.createFile(fullPath, BINARY_MODE);
  try {
    await file.write(buffer);
  } finally {
    await file.close();
  }
}

async function ensureHelperScript(pod, helperPath, scriptText) {
  const existingScript = await readTextFileIfExists(pod, helperPath);
  if (existingScript === scriptText) {
    return;
  }
  if (existingScript === null) {
    await createTextFile(pod, helperPath, scriptText);
    return;
  }
  const scriptFile = await pod.openFile(helperPath, UTF8_MODE);
  try {
    await scriptFile.write(scriptText);
  } finally {
    await scriptFile.close();
  }
}

async function overwriteFileFromBase64(pod, terminal, fullPath, base64Data) {
  await pod.createDirectory(OVERWRITE_HELPER_DIR, { recursive: true });
  await ensureHelperScript(pod, OVERWRITE_HELPER_PATH, OVERWRITE_TEXT_SCRIPT);

  await pod.run(
    "node",
    [OVERWRITE_HELPER_PATH, fullPath, String(base64Data || "")],
    { terminal, cwd: "/", echo: false }
  );
}

async function overwriteTextFile(pod, terminal, fullPath, text) {
  await overwriteFileFromBase64(pod, terminal, fullPath, toBase64Utf8(text));
}

async function overwriteBinaryFile(pod, terminal, fullPath, data) {
  const buffer = toArrayBuffer(data);
  await overwriteFileFromBase64(
    pod,
    terminal,
    fullPath,
    toBase64ArrayBuffer(buffer)
  );
}

export async function bootPod({ apiKey, terminalElement, onStep = () => {} }) {
  onStep("boot", "Booting BrowserPod runtime");
  const pod = await BrowserPod.boot({ apiKey });

  onStep("wait", `Waiting ${BOOT_STABILIZATION_MS}ms for WASM initialization`);
  await delay(BOOT_STABILIZATION_MS);

  onStep("terminal", "Creating BrowserPod terminal");
  const terminal = await pod.createDefaultTerminal(terminalElement);

  onStep("filesystem", "Creating /vimamp directory");
  await pod.createDirectory("/vimamp", { recursive: true });

  return { pod, terminal };
}

export async function ensureTextFile({ pod, fullPath, defaultText }) {
  const existingText = await readTextFileIfExists(pod, fullPath);
  if (existingText !== null) {
    return existingText;
  }

  await createTextFile(pod, fullPath, defaultText);
  return defaultText;
}

export async function readPodTextFile({ pod, fullPath }) {
  const targetPath = normalizePodPath(fullPath, "/vimamp");
  return readTextFile(pod, targetPath);
}

export async function writeTextFile({ pod, terminal, fullPath, text }) {
  const existingText = await readTextFileIfExists(pod, fullPath);
  if (existingText === null) {
    await createTextFile(pod, fullPath, text);
    return;
  }

  // Existing files are rewritten via Node for an exact overwrite.
  await overwriteTextFile(pod, terminal, fullPath, text);
}

export async function writeBinaryFile({ pod, terminal, fullPath, data }) {
  const exists = await hasBinaryFile(pod, fullPath);
  if (!exists) {
    await createBinaryFile(pod, fullPath, data);
    return;
  }

  // Existing files are rewritten via Node for an exact overwrite.
  await overwriteBinaryFile(pod, terminal, fullPath, data);
}

export async function runPodCommand({
  pod,
  terminal,
  command,
  cwd = "/vimamp",
  echo = true,
}) {
  const parsed = parsePodCommand(command);
  if (!parsed) {
    return;
  }
  const { executable, args } = parsed;

  await pod.run(executable, args, {
    terminal,
    cwd,
    echo,
  });
}

export function normalizePodPath(rawPath, fallback = "/vimamp") {
  const text = String(rawPath ?? "").trim();
  if (!text) {
    return fallback;
  }
  if (text.startsWith("/")) {
    return text;
  }
  return `/vimamp/${text}`;
}

export async function listPodDirectory({
  pod,
  terminal,
  directoryPath = "/vimamp",
}) {
  const fullPath = normalizePodPath(directoryPath, "/vimamp");
  await pod.createDirectory(OVERWRITE_HELPER_DIR, { recursive: true });
  await ensureHelperScript(pod, LIST_HELPER_PATH, LIST_DIRECTORY_SCRIPT);

  await pod.run("node", [LIST_HELPER_PATH, fullPath, LIST_OUTPUT_PATH], {
    terminal,
    cwd: "/",
    echo: false,
  });

  const outputText = await readTextFile(pod, LIST_OUTPUT_PATH);
  let payload = null;
  try {
    payload = JSON.parse(outputText);
  } catch {
    throw new Error("Failed to parse BrowserPod directory listing output.");
  }

  if (!payload?.ok) {
    const errorText = payload?.error || "Unknown BrowserPod listing error.";
    throw new Error(errorText);
  }

  return {
    targetPath: payload.targetPath || fullPath,
    entries: Array.isArray(payload.entries) ? payload.entries : [],
  };
}

async function runFilesystemOperation({
  pod,
  terminal,
  operation,
  targetPath,
  extraPath = "",
}) {
  if (!operation) {
    throw new Error("Missing filesystem operation name.");
  }
  const fullTargetPath = normalizePodPath(targetPath, "/vimamp");
  const fullExtraPath = extraPath ? normalizePodPath(extraPath, "/vimamp") : "";

  await pod.createDirectory(OVERWRITE_HELPER_DIR, { recursive: true });
  await ensureHelperScript(pod, FS_OPS_HELPER_PATH, FILESYSTEM_OPERATIONS_SCRIPT);

  await pod.run(
    "node",
    [FS_OPS_HELPER_PATH, operation, fullTargetPath, fullExtraPath, FS_OPS_OUTPUT_PATH],
    {
      terminal,
      cwd: "/",
      echo: false,
    }
  );

  const outputText = await readTextFile(pod, FS_OPS_OUTPUT_PATH);
  let payload = null;
  try {
    payload = JSON.parse(outputText);
  } catch {
    throw new Error("Failed to parse BrowserPod filesystem operation output.");
  }

  if (!payload?.ok) {
    const errorText = payload?.error || "Unknown BrowserPod filesystem operation error.";
    throw new Error(errorText);
  }

  return {
    operation,
    targetPath: fullTargetPath,
    extraPath: fullExtraPath,
    result: payload.result ?? null,
  };
}

export async function renamePodPath({
  pod,
  terminal,
  fromPath,
  toPath,
}) {
  const result = await runFilesystemOperation({
    pod,
    terminal,
    operation: "rename",
    targetPath: fromPath,
    extraPath: toPath,
  });

  return {
    fromPath: result.targetPath,
    toPath: result.extraPath,
    result: result.result,
  };
}

export async function deletePodPath({
  pod,
  terminal,
  fullPath,
}) {
  const result = await runFilesystemOperation({
    pod,
    terminal,
    operation: "delete",
    targetPath: fullPath,
  });

  return {
    fullPath: result.targetPath,
    result: result.result,
  };
}
