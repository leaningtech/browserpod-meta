import {
  deletePodPath,
  ensureTextFile,
  listPodDirectory,
  normalizePodPath,
  readPodTextFile,
  renamePodPath,
  writeBinaryFile,
  writeTextFile,
} from "../browserpod-runtime";
import { createZipBlob } from "./zip-utils";

export function joinPodPath(directoryPath, name) {
  if (!directoryPath || directoryPath === "/") {
    return `/${name}`;
  }
  return directoryPath.endsWith("/")
    ? `${directoryPath}${name}`
    : `${directoryPath}/${name}`;
}

function formatDirectoryListingText(directoryPath, entries) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const lines = [
    "# BrowserPod Directory Listing",
    `# Path: ${directoryPath}`,
    "",
    "Type  Full Path",
    "----  ---------",
  ];

  if (safeEntries.length === 0) {
    lines.push("(empty)");
  } else {
    safeEntries.forEach((entry) => {
      const type = entry?.type === "dir" ? "[d]" : entry?.type === "file" ? "[f]" : "[?]";
      const name = String(entry?.name || "");
      lines.push(`${type}  ${joinPodPath(directoryPath, name)}`);
    });
  }

  lines.push("");
  lines.push("Use :BPEdit /absolute/path to open files from BrowserPod.");
  lines.push("Use :BPSave to sync the current buffer back to BrowserPod.");

  return lines.join("\n");
}

function getParentPath(fullPath) {
  const normalized = String(fullPath || "").trim().replace(/\/+$/, "");
  if (!normalized || normalized === "/") {
    return "/";
  }
  const separatorIndex = normalized.lastIndexOf("/");
  if (separatorIndex <= 0) {
    return "/";
  }
  return normalized.slice(0, separatorIndex) || "/";
}

function normalizeImportRelativePath(pathValue) {
  const text = String(pathValue || "")
    .replace(/\\/g, "/")
    .trim()
    .replace(/^[a-zA-Z]:\//, "")
    .replace(/^\/+/, "")
    .replace(/^\.\//, "");
  if (!text) {
    return "";
  }

  const parts = text.split("/").filter(Boolean);
  if (parts.length === 0) {
    return "";
  }

  const safeParts = [];
  for (const part of parts) {
    if (part === "." || part === "..") {
      return "";
    }
    safeParts.push(part);
  }
  return safeParts.join("/");
}

function toArchivePath(rootPath, fullPath, { directory = false } = {}) {
  const root = String(rootPath || "")
    .replace(/\/+$/, "")
    .trim();
  const full = String(fullPath || "")
    .replace(/\/+$/, "")
    .trim();
  if (!root || !full.startsWith(root)) {
    return "";
  }

  const relative = full.slice(root.length).replace(/^\/+/, "");
  if (!relative) {
    return "";
  }
  if (!directory) {
    return relative;
  }
  return relative.endsWith("/") ? relative : `${relative}/`;
}

function formatArchiveFileName(rootPath) {
  const rootLabel = String(rootPath || "vimamp")
    .replace(/^\/+/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .replace("Z", "");
  return `${rootLabel || "vimamp"}-${stamp}.zip`;
}

function isAbortError(error) {
  return Boolean(error && typeof error === "object" && error.name === "AbortError");
}

async function writeBlobToFileHandle(fileHandle, blob) {
  if (!fileHandle || typeof fileHandle.createWritable !== "function") {
    return false;
  }
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }
  return true;
}

async function triggerBlobDownload(fileBlob, fileName) {
  const objectUrl = URL.createObjectURL(fileBlob);
  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = String(fileName || "vimamp.zip");
    link.style.display = "none";
    document.body.append(link);
    link.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
      })
    );
    link.remove();
  } finally {
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 30_000);
  }
}

function toBinaryBytes(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  return new Uint8Array(0);
}

export function createFilesystemService({
  state,
  appState,
  modeLearn,
  trainingFilePath,
  trainingFileText,
  demoFilePath,
  defaultText,
  setStatus,
  reportFailure,
}) {
  function assertRuntimeReady(message) {
    if (!state.podReady || !state.pod || !state.terminal) {
      throw new Error(message || "BrowserPod is not ready.");
    }
  }

  function toRequiredPath(pathArg, fallback = "/vimamp") {
    const fullPath = normalizePodPath(pathArg, fallback);
    if (!fullPath) {
      throw new Error("Path is required.");
    }
    return fullPath;
  }

  function assertMutablePath(fullPath) {
    if (fullPath === "/" || fullPath === "/vimamp") {
      throw new Error("This path is protected and cannot be modified.");
    }
  }

  function getModeFileSpec(mode) {
    if (mode === modeLearn) {
      return {
        filePath: trainingFilePath,
        defaultText: trainingFileText,
      };
    }

    return {
      filePath: demoFilePath,
      defaultText,
    };
  }

  async function loadModeFile(mode) {
    const spec = getModeFileSpec(mode);

    if (mode === modeLearn) {
      return {
        filePath: spec.filePath,
        text: spec.defaultText,
      };
    }

    if (!state.podReady || !state.pod) {
      return {
        filePath: spec.filePath,
        text: spec.defaultText,
      };
    }

    try {
      const text = await ensureTextFile({
        pod: state.pod,
        fullPath: spec.filePath,
        defaultText: spec.defaultText,
      });
      return { filePath: spec.filePath, text };
    } catch (error) {
      reportFailure("Failed to load BrowserPod file.", error);
      return { filePath: spec.filePath, text: spec.defaultText };
    }
  }

  async function getInitialFile() {
    const file = await loadModeFile(state.mode);
    appState.setActiveFilePath(file.filePath);
    return file;
  }

  async function syncFromVim(fullPath, contents) {
    if (!state.podReady || !state.pod || !state.terminal) {
      throw new Error("BrowserPod is not ready. :BPSave is unavailable.");
    }

    const targetPath =
      typeof fullPath === "string" && fullPath.length > 0
        ? fullPath
        : state.activeFilePath;
    const text = typeof contents === "string" ? contents : String(contents ?? "");

    await writeFileText(targetPath, text, { trackActivePath: true });
    setStatus(`Synced ${targetPath}`);
  }

  async function writeFileText(pathArg, text, { trackActivePath = false } = {}) {
    assertRuntimeReady("Write file is unavailable.");
    const fullPath = toRequiredPath(pathArg, "/vimamp");
    await writeTextFile({
      pod: state.pod,
      terminal: state.terminal,
      fullPath,
      text: String(text ?? ""),
    });
    if (trackActivePath) {
      appState.setActiveFilePath(fullPath);
    }
    return fullPath;
  }

  async function openPodFileInEditor(pathArg) {
    if (!state.podReady || !state.pod || !state.vimEditor) {
      const error = new Error("BrowserPod file pipeline is unavailable.");
      reportFailure("Open file failed.", error);
      setStatus("BrowserPod is not ready.");
      return false;
    }

    const fullPath = normalizePodPath(pathArg, state.activeFilePath || demoFilePath);
    try {
      const text = await ensureTextFile({
        pod: state.pod,
        fullPath,
        defaultText: "",
      });
      await state.vimEditor.openFile(fullPath, text);
      state.vimEditor.resizeToContainer?.();
      await state.vimEditor.refreshDisplay?.();
      appState.setActiveFilePath(fullPath);
      setStatus(`Opened ${fullPath} from BrowserPod.`);
      return true;
    } catch (error) {
      reportFailure("Open file failed.", error);
      setStatus("Open file failed.");
      return false;
    }
  }

  async function listDirectory(pathArg = "/vimamp") {
    assertRuntimeReady("BrowserPod directory listing is unavailable.");
    const directoryPath = normalizePodPath(pathArg, "/vimamp");
    return listPodDirectory({
      pod: state.pod,
      terminal: state.terminal,
      directoryPath,
    });
  }

  async function createDirectory(pathArg) {
    assertRuntimeReady("Create directory is unavailable.");
    const fullPath = toRequiredPath(pathArg, "/vimamp");
    await state.pod.createDirectory(fullPath, { recursive: true });
    return fullPath;
  }

  async function createFile(pathArg, initialText = "") {
    assertRuntimeReady("Create file is unavailable.");
    const fullPath = toRequiredPath(pathArg, "/vimamp/untitled.txt");
    await ensureTextFile({
      pod: state.pod,
      fullPath,
      defaultText: String(initialText ?? ""),
    });
    return fullPath;
  }

  async function importBrowserFiles(browserFiles, { destinationRoot = "/vimamp" } = {}) {
    assertRuntimeReady("Import is unavailable.");
    const files = Array.from(browserFiles || []);
    if (files.length === 0) {
      return {
        importedPaths: [],
        skipped: 0,
        failed: [],
      };
    }

    const rootPath = toRequiredPath(destinationRoot, "/vimamp");
    await state.pod.createDirectory(rootPath, { recursive: true });

    const importedPaths = [];
    const failed = [];
    let skipped = 0;

    for (const browserFile of files) {
      const relativeCandidate = String(
        browserFile?.webkitRelativePath || browserFile?.name || ""
      ).trim();
      const relativePath = normalizeImportRelativePath(relativeCandidate);
      if (!relativePath) {
        skipped += 1;
        continue;
      }

      const fullPath = normalizePodPath(joinPodPath(rootPath, relativePath), rootPath);
      if (!fullPath.startsWith("/vimamp")) {
        skipped += 1;
        continue;
      }

      try {
        const parentPath = getParentPath(fullPath);
        await state.pod.createDirectory(parentPath, { recursive: true });
        if (typeof browserFile?.arrayBuffer !== "function") {
          throw new Error("Selected file cannot be read in this browser.");
        }

        const data = await browserFile.arrayBuffer();
        await writeBinaryFile({
          pod: state.pod,
          terminal: state.terminal,
          fullPath,
          data,
        });
        importedPaths.push(fullPath);
      } catch (error) {
        failed.push({
          path: fullPath,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      importedPaths,
      skipped,
      failed,
    };
  }

  async function renamePath(fromPathArg, toPathArg) {
    assertRuntimeReady("Rename is unavailable.");
    const fromPath = toRequiredPath(fromPathArg, "/vimamp");
    const toPath = toRequiredPath(toPathArg, "/vimamp");
    assertMutablePath(fromPath);
    assertMutablePath(toPath);

    await renamePodPath({
      pod: state.pod,
      terminal: state.terminal,
      fromPath,
      toPath,
    });

    if (state.activeFilePath === fromPath) {
      appState.setActiveFilePath(toPath);
    }

    return { fromPath, toPath };
  }

  async function deletePath(pathArg) {
    assertRuntimeReady("Delete is unavailable.");
    const fullPath = toRequiredPath(pathArg, "/vimamp");
    assertMutablePath(fullPath);

    await deletePodPath({
      pod: state.pod,
      terminal: state.terminal,
      fullPath,
    });

    if (state.activeFilePath === fullPath) {
      appState.setActiveFilePath(demoFilePath);
    }

    return fullPath;
  }

  async function listPodDirectoryInEditor(pathArg) {
    if (!state.podReady || !state.pod || !state.terminal || !state.vimEditor) {
      const error = new Error("BrowserPod directory pipeline is unavailable.");
      reportFailure("Directory list failed.", error);
      setStatus("BrowserPod is not ready.");
      return false;
    }

    const directoryPath = normalizePodPath(pathArg, "/vimamp");
    try {
      const listing = await listPodDirectory({
        pod: state.pod,
        terminal: state.terminal,
        directoryPath,
      });
      const listingText = formatDirectoryListingText(listing.targetPath, listing.entries);
      const listingBufferPath = "/vimamp/.bp/browserpod-listing.txt";
      await state.vimEditor.openFile(listingBufferPath, listingText);
      setStatus(`Listed ${listing.targetPath}.`);
      return true;
    } catch (error) {
      reportFailure("Directory list failed.", error);
      setStatus("Directory list failed.");
      return false;
    }
  }

  async function readFileText(pathArg) {
    assertRuntimeReady("Read file is unavailable.");
    const fullPath = toRequiredPath(pathArg, "/vimamp");
    return readPodTextFile({
      pod: state.pod,
      fullPath,
    });
  }

  async function readFileBytes(pathArg) {
    assertRuntimeReady("Read file is unavailable.");
    const fullPath = toRequiredPath(pathArg, "/vimamp");
    const file = await state.pod.openFile(fullPath, "binary");
    try {
      const size = await file.getSize();
      if (!size) {
        return new Uint8Array(0);
      }
      const data = await file.read(size);
      return toBinaryBytes(data);
    } finally {
      await file.close();
    }
  }

  async function collectArchiveEntries(rootPathArg = "/vimamp") {
    const rootPath = toRequiredPath(rootPathArg, "/vimamp").replace(/\/+$/, "") || "/vimamp";
    const archiveEntries = [];

    async function visitDirectory(directoryPath) {
      const listing = await listPodDirectory({
        pod: state.pod,
        terminal: state.terminal,
        directoryPath,
      });
      const targetPath = String(listing?.targetPath || directoryPath);
      const entries = Array.isArray(listing?.entries) ? listing.entries : [];

      for (const entry of entries) {
        const name = String(entry?.name || "");
        if (!name) {
          continue;
        }
        const entryType = String(entry?.type || "");
        const fullPath = joinPodPath(targetPath, name);
        if (entryType === "dir") {
          const directoryArchivePath = toArchivePath(rootPath, fullPath, { directory: true });
          if (directoryArchivePath) {
            archiveEntries.push({
              path: directoryArchivePath,
              directory: true,
            });
          }
          await visitDirectory(fullPath);
          continue;
        }
        if (entryType !== "file") {
          continue;
        }

        const fileArchivePath = toArchivePath(rootPath, fullPath);
        if (!fileArchivePath) {
          continue;
        }
        const fileData = await readFileBytes(fullPath);
        archiveEntries.push({
          path: fileArchivePath,
          data: fileData,
        });
      }
    }

    await visitDirectory(rootPath);
    return archiveEntries;
  }

  async function downloadProjectArchive({
    rootPath = "/vimamp",
    fileName = "",
    outputFileHandle = null,
  } = {}) {
    assertRuntimeReady("Project download is unavailable.");

    const normalizedRootPath = toRequiredPath(rootPath, "/vimamp");
    const archiveEntries = await collectArchiveEntries(normalizedRootPath);
    const archiveBlob = createZipBlob(archiveEntries);
    const downloadName = String(fileName || outputFileHandle?.name || "").trim();
    const resolvedDownloadName = downloadName || formatArchiveFileName(normalizedRootPath);

    try {
      const writtenToHandle = await writeBlobToFileHandle(outputFileHandle, archiveBlob);
      if (!writtenToHandle) {
        await triggerBlobDownload(archiveBlob, resolvedDownloadName);
      }
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      await triggerBlobDownload(archiveBlob, resolvedDownloadName);
    }

    let fileCount = 0;
    let directoryCount = 0;
    archiveEntries.forEach((entry) => {
      if (entry?.directory) {
        directoryCount += 1;
      } else {
        fileCount += 1;
      }
    });

    return {
      fileName: resolvedDownloadName,
      fileCount,
      directoryCount,
      sizeBytes: archiveBlob.size,
    };
  }

  return {
    getInitialFile,
    listDirectory,
    createDirectory,
    createFile,
    importBrowserFiles,
    renamePath,
    deletePath,
    syncFromVim,
    openPodFileInEditor,
    listPodDirectoryInEditor,
    readFileText,
    writeFileText,
    readFileBytes,
    collectArchiveEntries,
    downloadProjectArchive,
    formatArchiveFileName,
  };
}
