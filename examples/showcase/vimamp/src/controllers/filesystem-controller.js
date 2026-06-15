import {
  createDirectoryEntryRow,
  createEmptyListRow,
  findListItem,
  normalizeEntryType,
  readListItemPathType,
} from "../services/list-ui-utils";
import { joinPodPath } from "../services/filesystem-service";

export function createFilesystemController({
  ui,
  state,
  filesystemRootPath,
  getFilesystemService,
  ensureTab,
  requestEditorResize,
  setFiletreeVisible,
  reportFailure,
  focusEditorInput,
}) {
  const filesystemUiState = {
    currentDir: filesystemRootPath,
    entries: [],
    selectedPath: "",
    selectedType: "",
    loading: false,
  };
  const filesystemRefreshState = {
    inFlight: null,
    queuedPreserveSelection: null,
  };

  function setFilesystemStatus(message) {
    if (!ui.filesystemStatus) {
      return;
    }
    ui.filesystemStatus.textContent = message;
  }

  function setFilesystemCurrentDir(path) {
    if (!ui.filesystemCurrentDir) {
      return;
    }
    ui.filesystemCurrentDir.textContent = path;
  }

  function isFilesystemRuntimeReady() {
    return Boolean(state.podReady && state.pod && state.terminal);
  }

  function mergePreserveSelection(previous, next) {
    if (previous === null) {
      return next;
    }
    return previous && next;
  }

  // Queue refresh requests so rapid callers share one directory read cycle.
  function requestFilesystemRefresh({ preserveSelection = true } = {}) {
    if (!ui.filesystemPanel) {
      return Promise.resolve();
    }

    const requestedPreserve = Boolean(preserveSelection);
    filesystemRefreshState.queuedPreserveSelection = mergePreserveSelection(
      filesystemRefreshState.queuedPreserveSelection,
      requestedPreserve
    );

    if (filesystemRefreshState.inFlight) {
      return filesystemRefreshState.inFlight;
    }

    // Collapse concurrent refresh requests into one in-flight worker and replay
    // only the latest requested selection behavior when the loop settles.
    filesystemRefreshState.inFlight = (async () => {
      try {
        while (filesystemRefreshState.queuedPreserveSelection !== null) {
          const nextPreserve = filesystemRefreshState.queuedPreserveSelection;
          filesystemRefreshState.queuedPreserveSelection = null;
          await refreshFilesystemPanel({ preserveSelection: nextPreserve });
        }
      } finally {
        filesystemRefreshState.inFlight = null;
      }
    })();

    return filesystemRefreshState.inFlight;
  }

  function clearFilesystemSelection() {
    filesystemUiState.selectedPath = "";
    filesystemUiState.selectedType = "";
  }

  function getParentDirectoryPath(directoryPath) {
    const trimmed = String(directoryPath || filesystemRootPath)
      .trim()
      .replace(/\/+$/, "");
    if (!trimmed || trimmed === "/" || trimmed === filesystemRootPath) {
      return filesystemRootPath;
    }
    const separatorIndex = trimmed.lastIndexOf("/");
    if (separatorIndex <= 0) {
      return filesystemRootPath;
    }
    const parent = trimmed.slice(0, separatorIndex) || "/";
    if (!parent.startsWith(filesystemRootPath)) {
      return filesystemRootPath;
    }
    return parent;
  }

  function getDirectoryPath(filePath) {
    const normalized = String(filePath || "").trim().replace(/\/+$/, "");
    if (!normalized) {
      return filesystemRootPath;
    }
    const separatorIndex = normalized.lastIndexOf("/");
    if (separatorIndex <= 0) {
      return filesystemRootPath;
    }
    return normalized.slice(0, separatorIndex) || "/";
  }

  function validateUserPath(text) {
    const tokens = String(text || "")
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    if (tokens.includes("..")) {
      throw new Error("Parent path segments (..) are not allowed.");
    }
  }

  function normalizeFilesystemPath(path) {
    const text = String(path || "").trim();
    if (!text) {
      return "";
    }
    if (text === "/") {
      return "/";
    }
    return text.replace(/\/+/g, "/").replace(/\/+$/, "");
  }

  function assertPathWithinRoot(fullPath) {
    if (!fullPath || !fullPath.startsWith(filesystemRootPath)) {
      throw new Error(`Path must stay inside ${filesystemRootPath}.`);
    }
  }

  function resolvePathInput(rawInput, baseDirectory = filesystemUiState.currentDir) {
    const text = String(rawInput ?? "").trim();
    if (!text) {
      return "";
    }
    validateUserPath(text);
    if (text.startsWith("/")) {
      return normalizeFilesystemPath(text);
    }
    return normalizeFilesystemPath(joinPodPath(baseDirectory, text));
  }

  function getEntryByPath(path) {
    const normalizedPath = normalizeFilesystemPath(path);
    return filesystemUiState.entries.find((entry) => {
      const name = String(entry?.name || "");
      return (
        normalizeFilesystemPath(joinPodPath(filesystemUiState.currentDir, name)) ===
        normalizedPath
      );
    });
  }

  function updateFilesystemActions() {
    if (!ui.filesystemPanel) {
      return;
    }

    const runtimeReady = isFilesystemRuntimeReady();
    const hasSelection = Boolean(filesystemUiState.selectedPath);
    const selectedPath = filesystemUiState.selectedPath;
    const mutableSelection =
      hasSelection && selectedPath !== "/" && selectedPath !== filesystemRootPath;
    const disabled = !runtimeReady || filesystemUiState.loading;

    ui.filesystemOpenBtn.disabled = disabled || !hasSelection;
    ui.filesystemRefreshBtn.disabled = disabled;
    if (ui.filesystemDownloadBtn) {
      ui.filesystemDownloadBtn.disabled = disabled;
    }
    ui.filesystemNewFileBtn.disabled = disabled;
    ui.filesystemNewDirBtn.disabled = disabled;
    ui.filesystemRenameBtn.disabled = disabled || !mutableSelection;
    ui.filesystemDeleteBtn.disabled = disabled || !mutableSelection;
  }

  function renderFilesystemList() {
    if (!ui.filesystemList) {
      return;
    }

    ui.filesystemList.textContent = "";

    if (!isFilesystemRuntimeReady()) {
      ui.filesystemList.appendChild(
        createEmptyListRow("filesystem-empty", "BrowserPod not available.")
      );
      updateFilesystemActions();
      return;
    }

    const hasParentEntry = filesystemUiState.currentDir !== filesystemRootPath;
    if (hasParentEntry) {
      const parentPath = getParentDirectoryPath(filesystemUiState.currentDir);
      ui.filesystemList.appendChild(
        createDirectoryEntryRow({
          rowClass: "filesystem-item",
          nameClass: "filesystem-item-name",
          path: parentPath,
          entryType: "dir",
          name: "..",
          selected: parentPath === filesystemUiState.selectedPath,
          interactive: true,
        })
      );
    }

    const entries = Array.isArray(filesystemUiState.entries) ? filesystemUiState.entries : [];
    let renderedEntryCount = 0;
    entries.forEach((entry) => {
      const name = String(entry?.name || "");
      if (!name) {
        return;
      }
      renderedEntryCount += 1;

      const entryType = normalizeEntryType(entry?.type);
      const path = normalizeFilesystemPath(joinPodPath(filesystemUiState.currentDir, name));

      ui.filesystemList.appendChild(
        createDirectoryEntryRow({
          rowClass: "filesystem-item",
          nameClass: "filesystem-item-name",
          path,
          entryType,
          name,
          selected: path === filesystemUiState.selectedPath,
          interactive: true,
        })
      );
    });

    if (renderedEntryCount === 0) {
      ui.filesystemList.appendChild(createEmptyListRow("filesystem-empty", "(empty)"));
    }

    updateFilesystemActions();
  }

  function updateFilesystemSelectionUi() {
    if (!ui.filesystemList) {
      return false;
    }

    let itemCount = 0;
    const selectedPath = filesystemUiState.selectedPath;
    ui.filesystemList.querySelectorAll(".filesystem-item").forEach((item) => {
      itemCount += 1;
      const itemPath = item.getAttribute("data-path") || "";
      item.classList.toggle("is-selected", Boolean(selectedPath) && itemPath === selectedPath);
    });

    return itemCount > 0;
  }

  function selectFilesystemPath(path, type = "other") {
    filesystemUiState.selectedPath = normalizeFilesystemPath(path);
    filesystemUiState.selectedType = String(type || "other");
    if (!updateFilesystemSelectionUi()) {
      renderFilesystemList();
      return;
    }
    updateFilesystemActions();
  }

  async function refreshFilesystemPanel({ preserveSelection = true } = {}) {
    if (!ui.filesystemPanel) {
      return;
    }

    setFilesystemCurrentDir(filesystemUiState.currentDir);

    if (!isFilesystemRuntimeReady()) {
      filesystemUiState.loading = false;
      filesystemUiState.entries = [];
      clearFilesystemSelection();
      setFilesystemStatus("Waiting for BrowserPod...");
      renderFilesystemList();
      return;
    }

    filesystemUiState.loading = true;
    setFilesystemStatus(`Loading ${filesystemUiState.currentDir}...`);
    updateFilesystemActions();

    try {
      const filesystemService = getFilesystemService();
      const listing = await filesystemService.listDirectory(filesystemUiState.currentDir);
      filesystemUiState.currentDir = normalizeFilesystemPath(
        listing.targetPath || filesystemUiState.currentDir
      );
      setFilesystemCurrentDir(filesystemUiState.currentDir);
      filesystemUiState.entries = Array.isArray(listing.entries) ? listing.entries : [];

      if (preserveSelection && filesystemUiState.selectedPath) {
        const selectionStillExists = Boolean(getEntryByPath(filesystemUiState.selectedPath));
        if (!selectionStillExists) {
          clearFilesystemSelection();
        }
      } else {
        clearFilesystemSelection();
      }

      renderFilesystemList();
      const entryCount = filesystemUiState.entries.length;
      setFilesystemStatus(`${entryCount} item${entryCount === 1 ? "" : "s"}`);
    } catch (error) {
      reportFailure("Filesystem refresh failed.", error);
      setFilesystemStatus("Directory load failed.");
      filesystemUiState.entries = [];
      clearFilesystemSelection();
      renderFilesystemList();
    } finally {
      filesystemUiState.loading = false;
      updateFilesystemActions();
    }
  }

  async function openFilesystemPath(path, type = filesystemUiState.selectedType) {
    if (!path) {
      setFilesystemStatus("Select a file or folder.");
      return;
    }

    if (type === "dir") {
      filesystemUiState.currentDir = normalizeFilesystemPath(path);
      clearFilesystemSelection();
      await requestFilesystemRefresh({ preserveSelection: false });
      return;
    }

    if (type !== "file") {
      setFilesystemStatus("Only files and folders are supported.");
      return;
    }

    const filesystemService = getFilesystemService();
    const opened = await filesystemService.openPodFileInEditor(path);
    if (!opened) {
      setFilesystemStatus("Open failed.");
      return;
    }
    requestEditorResize();
    ensureTab(path);
    selectFilesystemPath(path, "file");
    setFilesystemStatus(`Opened ${path}`);
    focusEditorInput();
  }

  async function openSelectedFilesystemEntry() {
    await openFilesystemPath(filesystemUiState.selectedPath, filesystemUiState.selectedType);
  }

  async function createFilesystemPath(type) {
    const isDirectory = type === "dir";
    const promptLabel = isDirectory
      ? "New folder path (relative to current directory):"
      : "New file path (relative to current directory):";
    const defaultValue = isDirectory ? "new-folder" : "untitled.txt";
    const enteredPath = window.prompt(promptLabel, defaultValue);
    if (enteredPath === null) {
      return;
    }

    let targetPath = "";
    try {
      targetPath = resolvePathInput(enteredPath);
      if (!targetPath) {
        throw new Error("Path is required.");
      }
      assertPathWithinRoot(targetPath);

      const filesystemService = getFilesystemService();
      if (isDirectory) {
        await filesystemService.createDirectory(targetPath);
        setFilesystemStatus(`Created folder ${targetPath}`);
        const parentPath = getDirectoryPath(targetPath);
        filesystemUiState.currentDir = parentPath || filesystemRootPath;
        await requestFilesystemRefresh({ preserveSelection: false });
        selectFilesystemPath(targetPath, "dir");
        return;
      }

      await filesystemService.createFile(targetPath, "");
      setFilesystemStatus(`Created file ${targetPath}`);
      const parentPath = getDirectoryPath(targetPath);
      filesystemUiState.currentDir = parentPath || filesystemRootPath;
      await requestFilesystemRefresh({ preserveSelection: false });
      selectFilesystemPath(targetPath, "file");
      const opened = await filesystemService.openPodFileInEditor(targetPath);
      if (!opened) {
        setFilesystemStatus("File created but open failed.");
        return;
      }
      focusEditorInput();
    } catch (error) {
      reportFailure("Create path failed.", error);
      setFilesystemStatus("Create failed.");
    }
  }

  async function renameSelectedFilesystemPath() {
    if (!filesystemUiState.selectedPath) {
      setFilesystemStatus("Select an item to rename.");
      return;
    }

    const currentPath = filesystemUiState.selectedPath;
    const currentEntry = getEntryByPath(currentPath);
    const currentName = currentEntry?.name || currentPath.split("/").pop() || "";
    const baseDirectory = getDirectoryPath(currentPath) || filesystemUiState.currentDir;
    const enteredPath = window.prompt("Rename to (name or absolute path):", currentName);
    if (enteredPath === null) {
      return;
    }

    try {
      const targetPath = resolvePathInput(enteredPath, baseDirectory);
      if (!targetPath) {
        throw new Error("Path is required.");
      }
      assertPathWithinRoot(targetPath);
      if (targetPath === currentPath) {
        setFilesystemStatus("No rename changes detected.");
        return;
      }

      const filesystemService = getFilesystemService();
      await filesystemService.renamePath(currentPath, targetPath);
      setFilesystemStatus(`Renamed to ${targetPath}`);

      filesystemUiState.currentDir = getDirectoryPath(targetPath) || filesystemRootPath;
      await requestFilesystemRefresh({ preserveSelection: false });
      selectFilesystemPath(targetPath, currentEntry?.type || "other");
    } catch (error) {
      reportFailure("Rename failed.", error);
      setFilesystemStatus("Rename failed.");
    }
  }

  async function deleteSelectedFilesystemPath() {
    if (!filesystemUiState.selectedPath) {
      setFilesystemStatus("Select an item to delete.");
      return;
    }

    const fullPath = filesystemUiState.selectedPath;
    const confirmation = window.confirm(`Delete ${fullPath}?`);
    if (!confirmation) {
      return;
    }

    try {
      const filesystemService = getFilesystemService();
      await filesystemService.deletePath(fullPath);
      setFilesystemStatus(`Deleted ${fullPath}`);
      clearFilesystemSelection();
      await requestFilesystemRefresh({ preserveSelection: false });
    } catch (error) {
      reportFailure("Delete failed.", error);
      setFilesystemStatus("Delete failed.");
    }
  }

  async function requestArchiveFileHandle(suggestedName) {
    if (typeof window.showSaveFilePicker !== "function" || !window.isSecureContext) {
      return null;
    }

    return window.showSaveFilePicker({
      suggestedName: String(suggestedName || "vimamp.zip"),
      types: [
        {
          description: "ZIP archive",
          accept: {
            "application/zip": [".zip"],
          },
        },
      ],
      excludeAcceptAllOption: false,
    });
  }

  async function downloadFilesystemProject() {
    if (!isFilesystemRuntimeReady()) {
      setFilesystemStatus("BrowserPod is not ready.");
      return;
    }

    try {
      const filesystemService = getFilesystemService();
      const suggestedName = filesystemService.formatArchiveFileName(filesystemRootPath);
      let outputFileHandle = null;
      try {
        outputFileHandle = await requestArchiveFileHandle(suggestedName);
      } catch (error) {
        if (error && typeof error === "object" && error.name === "AbortError") {
          setFilesystemStatus("Project download canceled.");
          return;
        }
        console.warn("Save picker unavailable, falling back to direct download.", error);
      }

      setFilesystemStatus("Preparing project download...");
      const summary = await filesystemService.downloadProjectArchive({
        rootPath: filesystemRootPath,
        fileName: outputFileHandle?.name || suggestedName,
        outputFileHandle,
      });
      const fileLabel = `${summary.fileCount} file${summary.fileCount === 1 ? "" : "s"}`;
      setFilesystemStatus(`Downloaded ${summary.fileName} (${fileLabel}).`);
    } catch (error) {
      if (error && typeof error === "object" && error.name === "AbortError") {
        setFilesystemStatus("Project download canceled.");
        return;
      }
      reportFailure("Project download failed.", error);
      setFilesystemStatus("Project download failed.");
    }
  }

  function installFilesystemHandlers() {
    if (!ui.filesystemPanel || !ui.filesystemList) {
      return;
    }

    const readTargetEntry = (event) => {
      const target = findListItem(event, ".filesystem-item");
      if (!target) {
        return null;
      }
      return readListItemPathType(target);
    };

    ui.filesystemList.addEventListener("click", (event) => {
      const entry = readTargetEntry(event);
      if (!entry) {
        return;
      }

      const { path, type } = entry;
      selectFilesystemPath(path, type);
    });

    ui.filesystemList.addEventListener("dblclick", (event) => {
      const entry = readTargetEntry(event);
      if (!entry) {
        return;
      }

      const { path, type } = entry;
      selectFilesystemPath(path, type);
      void openFilesystemPath(path, type);
    });

    ui.filesystemList.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }

      const entry = readTargetEntry(event);
      if (!entry) {
        return;
      }

      event.preventDefault();
      const { path, type } = entry;
      selectFilesystemPath(path, type);
      void openFilesystemPath(path, type);
    });

    ui.filesystemOpenBtn.addEventListener("click", () => {
      void openSelectedFilesystemEntry();
    });

    ui.filesystemRefreshBtn.addEventListener("click", () => {
      void requestFilesystemRefresh();
    });

    ui.filesystemDownloadBtn?.addEventListener("click", () => {
      void downloadFilesystemProject();
    });

    ui.filesystemNewFileBtn.addEventListener("click", () => {
      void createFilesystemPath("file");
    });

    ui.filesystemNewDirBtn.addEventListener("click", () => {
      void createFilesystemPath("dir");
    });

    ui.filesystemRenameBtn.addEventListener("click", () => {
      void renameSelectedFilesystemPath();
    });

    ui.filesystemDeleteBtn.addEventListener("click", () => {
      void deleteSelectedFilesystemPath();
    });

    ui.filesystemCollapseBtn?.addEventListener("click", () => {
      setFiletreeVisible(false);
    });

    renderFilesystemList();
    updateFilesystemActions();
  }

  function setCurrentDir(path) {
    filesystemUiState.currentDir = normalizeFilesystemPath(path) || filesystemRootPath;
    setFilesystemCurrentDir(filesystemUiState.currentDir);
  }

  function getCurrentDir() {
    return filesystemUiState.currentDir;
  }

  return {
    isFilesystemRuntimeReady,
    requestFilesystemRefresh,
    clearFilesystemSelection,
    getParentDirectoryPath,
    getDirectoryPath,
    normalizeFilesystemPath,
    resolvePathInput,
    selectFilesystemPath,
    openFilesystemPath,
    installFilesystemHandlers,
    setCurrentDir,
    getCurrentDir,
  };
}
