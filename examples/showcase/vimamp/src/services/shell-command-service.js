import { parsePodCommand } from "../browserpod-runtime";

const HELP_LINES = [
  "commands:",
  "  help",
  "  clear",
  "  pwd",
  "  cd <path>",
  "  ls [-a] [-l] [-R] [path ...]",
  "  cat <path>",
  "  open <path>",
  "  save",
  "  mkdir <path>",
  "  touch <path>",
  "  mv <from> <to>",
  "  rm <path>",
  "  npm ...",
  "  node <file.js>",
];

const UTF8_MODE = "utf-8";

function parseLsArgs(args) {
  const options = {
    includeHidden: false,
    longFormat: false,
    recursive: false,
    onePerLine: false,
    paths: [],
  };
  let parseOptions = true;

  (Array.isArray(args) ? args : []).forEach((argValue) => {
    const arg = String(argValue || "").trim();
    if (!arg) {
      return;
    }

    if (parseOptions && arg === "--") {
      parseOptions = false;
      return;
    }

    if (parseOptions && arg.startsWith("--")) {
      if (arg === "--all") {
        options.includeHidden = true;
        return;
      }
      if (arg === "--long") {
        options.longFormat = true;
        return;
      }
      if (arg === "--recursive") {
        options.recursive = true;
        return;
      }
      if (arg === "--one-per-line") {
        options.onePerLine = true;
        return;
      }
      throw new Error(`ls: unsupported option ${arg}`);
    }

    if (parseOptions && arg.startsWith("-") && arg !== "-") {
      for (const flag of arg.slice(1)) {
        if (flag === "a") {
          options.includeHidden = true;
          continue;
        }
        if (flag === "l") {
          options.longFormat = true;
          continue;
        }
        if (flag === "R") {
          options.recursive = true;
          continue;
        }
        if (flag === "1") {
          options.onePerLine = true;
          continue;
        }
        throw new Error(`ls: unsupported option -${flag}`);
      }
      return;
    }

    options.paths.push(arg);
  });

  return options;
}

function sortDirectoryEntries(entries = []) {
  return [...entries].sort((a, b) => {
    const aType = String(a?.type || "");
    const bType = String(b?.type || "");
    if (aType !== bType) {
      if (aType === "dir") {
        return -1;
      }
      if (bType === "dir") {
        return 1;
      }
    }
    const aName = String(a?.name || "");
    const bName = String(b?.name || "");
    return aName.localeCompare(bName);
  });
}

function filterDirectoryEntries(entries = [], includeHidden = false) {
  return sortDirectoryEntries(entries).filter((entry) => {
    const name = String(entry?.name || "");
    if (!name) {
      return false;
    }
    if (includeHidden) {
      return true;
    }
    return !name.startsWith(".");
  });
}

async function getFileSizeFromPod(state, fullPath) {
  async function tryMode(mode) {
    let file = null;
    try {
      file = await state.pod.openFile(fullPath, mode);
      return await file.getSize();
    } finally {
      if (file) {
        await file.close();
      }
    }
  }

  try {
    return await tryMode("binary");
  } catch {
    try {
      return await tryMode(UTF8_MODE);
    } catch {
      return null;
    }
  }
}

async function buildLongFormatRows({
  state,
  basePath,
  entries,
  joinPodPath,
  normalizeFilesystemPath,
}) {
  const meta = await Promise.all(
    entries.map(async (entry) => {
      const name = String(entry?.name || "");
      const type = String(entry?.type || "other");
      let size = null;

      if (type === "file") {
        const fullPath = normalizeFilesystemPath(joinPodPath(basePath, name));
        size = await getFileSizeFromPod(state, fullPath);
      }

      return { name, type, size };
    })
  );

  const sizeWidth = Math.max(
    1,
    ...meta.map((item) => {
      if (!Number.isFinite(item.size)) {
        return 1;
      }
      return String(item.size).length;
    })
  );

  return meta.map((item) => {
    const typeChar = item.type === "dir" ? "d" : item.type === "file" ? "-" : "?";
    const mode = item.type === "dir" ? "rwxr-xr-x" : "rw-r--r--";
    const sizeText = Number.isFinite(item.size) ? String(item.size) : "-";
    return `${typeChar}${mode} ${sizeText.padStart(sizeWidth)} ${item.name}`;
  });
}

async function buildLsSections({
  state,
  rootPath,
  recursive,
  includeHidden,
  filesystemService,
  joinPodPath,
  normalizeFilesystemPath,
}) {
  const sections = [];

  async function visit(path) {
    const listing = await filesystemService.listDirectory(path);
    const sectionPath = normalizeFilesystemPath(listing?.targetPath || path);
    const entries = filterDirectoryEntries(listing?.entries || [], includeHidden);
    sections.push({ path: sectionPath, entries });

    if (!recursive) {
      return;
    }

    for (const entry of entries) {
      if (entry?.type !== "dir") {
        continue;
      }
      const childPath = normalizeFilesystemPath(
        joinPodPath(sectionPath, String(entry?.name || ""))
      );
      await visit(childPath);
    }
  }

  await visit(rootPath);
  return sections;
}

async function buildLsOutputLines({
  state,
  targetPaths,
  options,
  filesystemService,
  joinPodPath,
  normalizeFilesystemPath,
}) {
  const lines = [];
  const showHeaders = options.recursive || targetPaths.length > 1;

  for (const targetPath of targetPaths) {
    const sections = await buildLsSections({
      state,
      rootPath: targetPath,
      recursive: options.recursive,
      includeHidden: options.includeHidden,
      filesystemService,
      joinPodPath,
      normalizeFilesystemPath,
    });

    for (let index = 0; index < sections.length; index += 1) {
      const section = sections[index];
      if (lines.length > 0) {
        lines.push("");
      }

      if (showHeaders) {
        lines.push(`${section.path}:`);
      }

      let rows = [];
      if (options.longFormat) {
        rows = await buildLongFormatRows({
          state,
          basePath: section.path,
          entries: section.entries,
          joinPodPath,
          normalizeFilesystemPath,
        });
      } else {
        rows = section.entries.map((entry) => String(entry?.name || ""));
      }

      if (rows.length === 0) {
        lines.push("(empty)");
      } else {
        lines.push(...rows);
      }
    }
  }

  return lines.length > 0 ? lines : ["(empty)"];
}

async function writeTerminal(state, text) {
  if (!state?.terminal || typeof state.terminal.write !== "function") {
    return;
  }
  await state.terminal.write(String(text ?? ""));
}

async function writeTerminalLine(state, text) {
  await writeTerminal(state, `${String(text ?? "")}\r\n`);
}

async function readTextFileFromPod(state, fullPath) {
  const file = await state.pod.openFile(fullPath, UTF8_MODE);
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

function requireCommandArg(executable, args, index, usageTail) {
  const value = String(args?.[index] || "").trim();
  if (value) {
    return value;
  }
  throw new Error(`usage: ${executable} ${usageTail}`);
}

function normalizeProjectPath({
  pathValue,
  basePath,
  filesystemRootPath,
  normalizeFilesystemPath,
  joinPodPath,
}) {
  const normalizedRoot = normalizeFilesystemPath(filesystemRootPath || "/vimamp");
  const rootParts = normalizedRoot.split("/").filter(Boolean);
  if (rootParts.length === 0) {
    throw new Error("Filesystem root is invalid.");
  }

  const raw = String(pathValue || "").trim();
  if (!raw || raw === ".") {
    return normalizeFilesystemPath(basePath || normalizedRoot);
  }

  const candidate = raw.startsWith("/")
    ? raw
    : joinPodPath(basePath || normalizedRoot, raw);
  const parts = candidate.split("/").filter(Boolean);
  if (parts.length === 0) {
    return normalizedRoot;
  }

  const hasValidRootPrefix =
    parts.length >= rootParts.length &&
    rootParts.every((part, index) => parts[index] === part);
  if (!hasValidRootPrefix) {
    throw new Error(`Path must stay inside ${normalizedRoot}.`);
  }

  const stack = [...rootParts];
  parts.slice(rootParts.length).forEach((part) => {
    if (!part || part === ".") {
      return;
    }
    if (part === "..") {
      if (stack.length > rootParts.length) {
        stack.pop();
      }
      return;
    }
    stack.push(part);
  });

  return `/${stack.join("/")}`;
}

function resolvePassThroughTimeoutMs(executable, args) {
  const cmd = String(executable || "").trim();
  const firstArg = String(args?.[0] || "").trim();
  const secondArg = String(args?.[1] || "").trim();

  if (cmd === "npm") {
    if (
      firstArg === "install" ||
      firstArg === "i" ||
      firstArg === "ci" ||
      firstArg === "update" ||
      firstArg === "up"
    ) {
      return 180000;
    }

    if (
      firstArg === "run" &&
      (secondArg === "dev" ||
        secondArg === "start" ||
        secondArg === "serve" ||
        secondArg === "watch")
    ) {
      return 0;
    }

    if (firstArg === "test") {
      return 120000;
    }

    return 60000;
  }

  if (cmd === "node") {
    return 120000;
  }

  return 10000;
}

export function createShellCommandService({
  state,
  shellState,
  filesystemRootPath = "/vimamp",
  filesystemService,
  runnerService,
  ensureTab,
  saveCurrentBuffer,
  requestFilesystemRefresh,
  normalizeFilesystemPath,
  joinPodPath,
  formatErrorSummary,
  setStatus,
  writeShellErrorLine,
}) {
  function isPodTerminalReady() {
    return Boolean(state.podReady && state.pod && state.terminal);
  }

  async function emitTerminalError(_commandText, message) {
    const summary = String(message || "Unknown error");
    if (!isPodTerminalReady()) {
      writeShellErrorLine?.(summary);
      setStatus(summary);
      return;
    }

    try {
      await writeTerminalLine(state, `error: ${summary}`);
    } catch (error) {
      console.error("emitTerminalError failed", error);
      setStatus(summary);
    }
  }

  async function runShellCommand(commandText) {
    const text = String(commandText || "").trim();
    if (!text) {
      return;
    }

    let parsed = null;
    try {
      parsed = parsePodCommand(text);
    } catch (error) {
      await emitTerminalError(text, formatErrorSummary(error));
      return;
    }

    if (!parsed) {
      return;
    }

    const executable = String(parsed.executable || "").trim();
    const args = Array.isArray(parsed.args) ? parsed.args : [];
    const passThroughCommand = executable === "npm" || executable === "node";

    try {
      if (!isPodTerminalReady()) {
        throw new Error("BrowserPod is not ready.");
      }

      if (executable === "help") {
        await writeTerminal(state, `${HELP_LINES.join("\r\n")}\r\n`);
        return;
      }

      if (executable === "clear") {
        await writeTerminal(state, "\x1bc");
        return;
      }

      if (executable === "pwd") {
        await writeTerminalLine(state, shellState.cwd);
        return;
      }

      if (executable === "cd") {
        const targetPath = normalizeProjectPath({
          pathValue: args[0] || filesystemRootPath,
          basePath: shellState.cwd,
          filesystemRootPath,
          normalizeFilesystemPath,
          joinPodPath,
        });
        await filesystemService.listDirectory(targetPath);
        shellState.cwd = normalizeFilesystemPath(targetPath);
        await writeTerminalLine(state, shellState.cwd);
        await requestFilesystemRefresh({ preserveSelection: true });
        return;
      }

      if (executable === "ls") {
        const options = parseLsArgs(args);
        const targetInputs = options.paths.length > 0 ? options.paths : [shellState.cwd];
        const targetPaths = targetInputs.map((pathInput) =>
          normalizeProjectPath({
            pathValue: pathInput,
            basePath: shellState.cwd,
            filesystemRootPath,
            normalizeFilesystemPath,
            joinPodPath,
          })
        );
        const outputLines = await buildLsOutputLines({
          state,
          targetPaths,
          options,
          filesystemService,
          joinPodPath,
          normalizeFilesystemPath,
        });
        await writeTerminal(state, `${outputLines.join("\r\n")}\r\n`);
        return;
      }

      if (executable === "cat") {
        const targetArg = requireCommandArg(executable, args, 0, "<path>");
        const targetPath = normalizeProjectPath({
          pathValue: targetArg,
          basePath: shellState.cwd,
          filesystemRootPath,
          normalizeFilesystemPath,
          joinPodPath,
        });
        const value = await readTextFileFromPod(state, targetPath);
        if (!value) {
          await writeTerminalLine(state, "(empty file)");
          return;
        }
        await writeTerminal(state, value);
        if (!value.endsWith("\n")) {
          await writeTerminal(state, "\r\n");
        }
        return;
      }

      if (executable === "open") {
        const targetArg = requireCommandArg(executable, args, 0, "<path>");
        const targetPath = normalizeProjectPath({
          pathValue: targetArg,
          basePath: shellState.cwd,
          filesystemRootPath,
          normalizeFilesystemPath,
          joinPodPath,
        });
        const opened = await filesystemService.openPodFileInEditor(targetPath);
        if (!opened) {
          throw new Error("open failed");
        }
        ensureTab(targetPath);
        await writeTerminalLine(state, `opened ${targetPath}`);
        await requestFilesystemRefresh({ preserveSelection: true });
        return;
      }

      if (executable === "save") {
        await saveCurrentBuffer();
        await writeTerminalLine(state, `saved ${state.activeFilePath || "current file"}`);
        return;
      }

      if (executable === "mkdir") {
        const targetArg = requireCommandArg(executable, args, 0, "<path>");
        const targetPath = normalizeProjectPath({
          pathValue: targetArg,
          basePath: shellState.cwd,
          filesystemRootPath,
          normalizeFilesystemPath,
          joinPodPath,
        });
        await filesystemService.createDirectory(targetPath);
        await writeTerminalLine(state, `created ${targetPath}`);
        await requestFilesystemRefresh({ preserveSelection: true });
        return;
      }

      if (executable === "touch") {
        const targetArg = requireCommandArg(executable, args, 0, "<path>");
        const targetPath = normalizeProjectPath({
          pathValue: targetArg,
          basePath: shellState.cwd,
          filesystemRootPath,
          normalizeFilesystemPath,
          joinPodPath,
        });
        await filesystemService.createFile(targetPath);
        await writeTerminalLine(state, `created ${targetPath}`);
        await requestFilesystemRefresh({ preserveSelection: true });
        return;
      }

      if (executable === "mv") {
        const fromArg = requireCommandArg(executable, args, 0, "<from> <to>");
        const toArg = requireCommandArg(executable, args, 1, "<from> <to>");
        const fromPath = normalizeProjectPath({
          pathValue: fromArg,
          basePath: shellState.cwd,
          filesystemRootPath,
          normalizeFilesystemPath,
          joinPodPath,
        });
        const toPath = normalizeProjectPath({
          pathValue: toArg,
          basePath: shellState.cwd,
          filesystemRootPath,
          normalizeFilesystemPath,
          joinPodPath,
        });
        if (fromPath === filesystemRootPath || toPath === filesystemRootPath) {
          throw new Error("Path must stay inside /vimamp and cannot be /vimamp root.");
        }
        await filesystemService.renamePath(fromPath, toPath);
        ensureTab(toPath);
        await writeTerminalLine(state, `renamed ${fromPath} -> ${toPath}`);
        await requestFilesystemRefresh({ preserveSelection: true });
        return;
      }

      if (executable === "rm") {
        const targetArg = requireCommandArg(executable, args, 0, "<path>");
        const targetPath = normalizeProjectPath({
          pathValue: targetArg,
          basePath: shellState.cwd,
          filesystemRootPath,
          normalizeFilesystemPath,
          joinPodPath,
        });
        if (targetPath === filesystemRootPath) {
          throw new Error("Path must stay inside /vimamp and cannot be /vimamp root.");
        }
        await filesystemService.deletePath(targetPath);
        await writeTerminalLine(state, `deleted ${targetPath}`);
        await requestFilesystemRefresh({ preserveSelection: true });
        return;
      }

      if (passThroughCommand) {
        const timeoutMs = resolvePassThroughTimeoutMs(executable, args);
        await runnerService.runCommand(text, {
          cwd: shellState.cwd,
          echo: false,
          timeoutMs,
        });
        return;
      }

      throw new Error(`unsupported command: ${executable}`);
    } catch (error) {
      await emitTerminalError(text, formatErrorSummary(error));
    }
  }

  return {
    isPodTerminalReady,
    runShellCommand,
  };
}
