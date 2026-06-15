export function createFileActionsController({
  state,
  appState,
  ui,
  filesystemRootPath,
  getFilesystemService,
  isFilesystemRuntimeReady,
  ensureTab,
  getDirectoryPath,
  resolvePathInput,
  assertPathWithinRoot,
  openFilesystemPath,
  requestFilesystemRefresh,
  selectFilesystemPath,
  setFilesystemCurrentDir,
  setStatus,
  reportFailure,
}) {
  async function saveCurrentBuffer() {
    if (!state.vimEditor) {
      setStatus("Vim is not ready.");
      return;
    }
    try {
      await state.vimEditor.runSyncCommand();
      setStatus(`Saved ${state.activeFilePath || "current file"}.`);
    } catch (error) {
      reportFailure("Save failed.", error);
      setStatus("Save failed.");
    }
  }

  async function saveCurrentBufferAs() {
    if (!state.vimEditor) {
      setStatus("Vim is not ready.");
      return;
    }

    const activePath = String(state.activeFilePath || "").trim();
    const baseDirectory = getDirectoryPath(activePath || filesystemRootPath);
    const defaultName = String(activePath || "untitled.txt")
      .split("/")
      .filter(Boolean)
      .pop() || "untitled.txt";
    const enteredPath = window.prompt(
      "Save As path (relative to current directory or absolute):",
      defaultName
    );
    if (enteredPath === null) {
      return;
    }

    try {
      const fullPath = resolvePathInput(enteredPath, baseDirectory);
      assertPathWithinRoot(fullPath);
      const parentPath = getDirectoryPath(fullPath) || filesystemRootPath;
      await getFilesystemService().createDirectory(parentPath);
      await state.vimEditor.runSaveAsCommand(fullPath);
      ensureTab(fullPath);
      appState.setActiveFilePath(fullPath);
      await requestFilesystemRefresh({ preserveSelection: true });
      setStatus(`Saved as ${fullPath}.`);
    } catch (error) {
      reportFailure("Save As failed.", error);
      setStatus("Save As failed.");
    }
  }

  function exitToEntryPage() {
    window.location.reload();
  }

  async function createNewFileFromMenu() {
    if (!isFilesystemRuntimeReady()) {
      setStatus("BrowserPod is not ready.");
      return;
    }

    const enteredPath = window.prompt(
      `New file path (relative to ${filesystemRootPath} or absolute):`,
      "untitled.txt"
    );
    if (enteredPath === null) {
      return;
    }

    try {
      const fullPath = resolvePathInput(enteredPath, filesystemRootPath);
      assertPathWithinRoot(fullPath);
      await getFilesystemService().createFile(fullPath, "");
      await openFilesystemPath(fullPath, "file");
      await requestFilesystemRefresh({ preserveSelection: true });
      ensureTab(fullPath);
    } catch (error) {
      reportFailure("New file failed.", error);
      setStatus("New file failed.");
    }
  }

  function triggerImportPicker(inputElement) {
    if (!isFilesystemRuntimeReady()) {
      setStatus("BrowserPod is not ready.");
      return;
    }
    if (!inputElement) {
      setStatus("Import picker is unavailable.");
      return;
    }

    inputElement.value = "";
    inputElement.click();
  }

  async function importFromPicker(inputElement, label) {
    if (!isFilesystemRuntimeReady()) {
      setStatus("BrowserPod is not ready.");
      if (inputElement) {
        inputElement.value = "";
      }
      return;
    }

    const files = Array.from(inputElement?.files || []);
    if (files.length === 0) {
      return;
    }

    try {
      setStatus(`Importing ${files.length} ${label}...`);
      const result = await getFilesystemService().importBrowserFiles(files, {
        destinationRoot: filesystemRootPath,
      });

      if (result.importedPaths.length > 0) {
        const firstImportedPath = result.importedPaths[0];
        setFilesystemCurrentDir(getDirectoryPath(firstImportedPath) || filesystemRootPath);
        selectFilesystemPath(firstImportedPath, "file");
      }

      await requestFilesystemRefresh({ preserveSelection: true });

      const summaryParts = [`Imported ${result.importedPaths.length} file(s).`];
      if (result.skipped > 0) {
        summaryParts.push(`Skipped ${result.skipped}.`);
      }
      if (result.failed.length > 0) {
        summaryParts.push(`Failed ${result.failed.length}.`);
        console.error("Import failures", result.failed);
      }
      setStatus(summaryParts.join(" "));
    } catch (error) {
      reportFailure("Import failed.", error);
      setStatus("Import failed.");
    } finally {
      if (inputElement) {
        inputElement.value = "";
      }
    }
  }

  return {
    saveCurrentBuffer,
    saveCurrentBufferAs,
    exitToEntryPage,
    createNewFileFromMenu,
    triggerImportPicker,
    importFromPicker,
  };
}
