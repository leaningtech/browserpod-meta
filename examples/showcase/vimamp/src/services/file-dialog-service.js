import {
  createDirectoryEntryRow,
  createEmptyListRow,
  findListItem,
  normalizeEntryType,
  readListItemPathType,
} from "./list-ui-utils";

export function createFileDialogService({
  ui,
  filesystemRootPath = "/vimamp",
  isFilesystemRuntimeReady,
  listDirectory,
  openPodFileInEditor,
  ensureTab,
  normalizeFilesystemPath,
  joinPodPath,
  getParentDirectoryPath,
  focusEditorInput,
}) {
  const fileDialogState = {
    currentDir: filesystemRootPath,
    entries: [],
    selectedPath: "",
    selectedType: "",
    loading: false,
  };

  function setFileDialogStatus(message) {
    if (!ui.fileDialogStatus) {
      return;
    }
    ui.fileDialogStatus.textContent = message;
  }

  function renderFileDialogList() {
    if (!ui.fileDialogList) {
      return;
    }

    ui.fileDialogList.textContent = "";
    const hasParentEntry = fileDialogState.currentDir !== filesystemRootPath;
    if (hasParentEntry) {
      const parentPath = getParentDirectoryPath(fileDialogState.currentDir);
      ui.fileDialogList.appendChild(
        createDirectoryEntryRow({
          rowClass: "file-dialog-item",
          nameClass: "file-dialog-item-name",
          path: parentPath,
          entryType: "dir",
          name: "..",
          selected: parentPath === fileDialogState.selectedPath,
        })
      );
    }

    const entries = Array.isArray(fileDialogState.entries) ? fileDialogState.entries : [];
    let renderedEntryCount = 0;
    entries.forEach((entry) => {
      const name = String(entry?.name || "");
      if (!name) {
        return;
      }
      renderedEntryCount += 1;
      const entryType = normalizeEntryType(entry?.type);
      const fullPath = normalizeFilesystemPath(joinPodPath(fileDialogState.currentDir, name));

      ui.fileDialogList.appendChild(
        createDirectoryEntryRow({
          rowClass: "file-dialog-item",
          nameClass: "file-dialog-item-name",
          path: fullPath,
          entryType,
          name,
          selected: fullPath === fileDialogState.selectedPath,
        })
      );
    });

    if (renderedEntryCount === 0) {
      ui.fileDialogList.appendChild(createEmptyListRow("file-dialog-empty", "(empty)"));
    }
  }

  async function refreshFileDialog() {
    if (!ui.fileDialog || ui.fileDialog.hidden) {
      return;
    }
    if (!isFilesystemRuntimeReady()) {
      setFileDialogStatus("BrowserPod not available.");
      fileDialogState.entries = [];
      renderFileDialogList();
      return;
    }

    fileDialogState.loading = true;
    setFileDialogStatus(`Loading ${fileDialogState.currentDir}...`);
    try {
      const listing = await listDirectory(fileDialogState.currentDir);
      fileDialogState.currentDir = normalizeFilesystemPath(
        listing.targetPath || fileDialogState.currentDir
      );
      fileDialogState.entries = Array.isArray(listing.entries) ? listing.entries : [];
      fileDialogState.selectedPath = "";
      fileDialogState.selectedType = "";
      renderFileDialogList();
      if (ui.fileDialogCurrentDir) {
        ui.fileDialogCurrentDir.textContent = fileDialogState.currentDir;
      }
      setFileDialogStatus(`${fileDialogState.entries.length} item(s)`);
    } catch {
      setFileDialogStatus("Open dialog failed.");
      fileDialogState.entries = [];
      renderFileDialogList();
    } finally {
      fileDialogState.loading = false;
    }
  }

  function openFileDialog() {
    if (!ui.fileDialog) {
      return;
    }
    fileDialogState.currentDir = filesystemRootPath;
    fileDialogState.selectedPath = "";
    fileDialogState.selectedType = "";
    ui.fileDialog.hidden = false;
    if (ui.fileDialogCurrentDir) {
      ui.fileDialogCurrentDir.textContent = fileDialogState.currentDir;
    }
    void refreshFileDialog();
  }

  function closeFileDialog() {
    if (!ui.fileDialog) {
      return;
    }
    ui.fileDialog.hidden = true;
    focusEditorInput?.();
  }

  async function openFromFileDialog(path, type) {
    if (type === "dir") {
      fileDialogState.currentDir = path;
      fileDialogState.selectedPath = "";
      fileDialogState.selectedType = "";
      await refreshFileDialog();
      return;
    }
    if (type !== "file") {
      return;
    }
    const opened = await openPodFileInEditor(path);
    if (!opened) {
      setFileDialogStatus("Open failed.");
      return;
    }
    ensureTab(path);
    closeFileDialog();
  }

  function installFileDialogHandlers() {
    if (!ui.fileDialogList) {
      return;
    }

    ui.fileDialogList.addEventListener("click", (event) => {
      const target = findListItem(event, ".file-dialog-item");
      if (!target) {
        return;
      }
      const { path, type } = readListItemPathType(target);
      fileDialogState.selectedPath = path;
      fileDialogState.selectedType = type;
      renderFileDialogList();
    });

    ui.fileDialogList.addEventListener("dblclick", (event) => {
      const target = findListItem(event, ".file-dialog-item");
      if (!target) {
        return;
      }
      const { path, type } = readListItemPathType(target);
      void openFromFileDialog(path, type);
    });

    ui.fileDialogOpenBtn?.addEventListener("click", () => {
      void openFromFileDialog(fileDialogState.selectedPath, fileDialogState.selectedType);
    });

    ui.fileDialogCancelBtn?.addEventListener("click", () => {
      closeFileDialog();
    });

    ui.fileDialogUpBtn?.addEventListener("click", () => {
      fileDialogState.currentDir = getParentDirectoryPath(fileDialogState.currentDir);
      void refreshFileDialog();
    });

    ui.fileDialogRefreshBtn?.addEventListener("click", () => {
      void refreshFileDialog();
    });
  }

  return {
    openFileDialog,
    closeFileDialog,
    installFileDialogHandlers,
  };
}
