function isTerminalToggleShortcut(event) {
  const key = String(event.key || "");
  const code = String(event.code || "");
  const backquoteKey = key === "`" || key === "~" || code === "Backquote";
  if (!backquoteKey || event.altKey) {
    return false;
  }

  // Primary web shortcut across platforms.
  if (event.ctrlKey && !event.metaKey) {
    return true;
  }

  const platform = String(navigator?.platform || "");
  const isMac = /Mac|iPhone|iPad|iPod/.test(platform);

  if (isMac) {
    // Optional fallback to VS Code default on macOS.
    return event.metaKey && !event.ctrlKey;
  }

  return false;
}

function hasPrimaryShortcutModifier(event) {
  if (event.metaKey && event.ctrlKey) {
    return false;
  }
  return event.metaKey || event.ctrlKey;
}

function isFiletreeToggleShortcut(event) {
  return (
    hasPrimaryShortcutModifier(event) &&
    event.shiftKey &&
    !event.altKey &&
    String(event.key || "").toLowerCase() === "e"
  );
}

function isAiPanelToggleShortcut(event) {
  return (
    hasPrimaryShortcutModifier(event) &&
    event.shiftKey &&
    !event.altKey &&
    String(event.key || "").toLowerCase() === "y"
  );
}

function isEditableShortcutTarget(target, vimInput) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (vimInput && target === vimInput) {
    return false;
  }
  const tagName = String(target.tagName || "").toUpperCase();
  if (target.isContentEditable) {
    return true;
  }
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

export function installGlobalEventHandlers({
  state,
  ui,
  editorResizeState,
  vimLifecycleState,
  isMenuOpen,
  closeMenus,
  getFileDialogService,
  requestEditorResize,
  toggleFiletree,
  toggleAiPanel,
  toggleConsole,
  closeConsole,
  getLessonService,
  getShellTerminalService,
  uninstallVimBridge,
}) {
  window.addEventListener("beforeunload", () => {
    vimLifecycleState.allowAutoRecover = false;
    if (editorResizeState.frameId) {
      cancelAnimationFrame(editorResizeState.frameId);
      editorResizeState.frameId = 0;
    }
    if (editorResizeState.settleFrameId) {
      cancelAnimationFrame(editorResizeState.settleFrameId);
      editorResizeState.settleFrameId = 0;
    }
    if (editorResizeState.observer) {
      editorResizeState.observer.disconnect();
      editorResizeState.observer = null;
    }
    if (editorResizeState.retryTimerId) {
      clearTimeout(editorResizeState.retryTimerId);
      editorResizeState.retryTimerId = 0;
    }
    getLessonService()?.clearLessonAutoAdvanceTimer();
    getShellTerminalService()?.dispose({ podTerminal: state.terminal });
    if (state.vimEditor) {
      state.vimEditor.stop();
    }
    uninstallVimBridge();
  });

  window.addEventListener(
    "resize",
    () => {
      requestEditorResize();
    },
    { passive: true }
  );

  window.addEventListener("error", (event) => {
    console.error("window.error raw", event.error ?? event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error("unhandledrejection raw", event.reason);
    event.preventDefault();
  });

  window.addEventListener(
    "keydown",
    (event) => {
      if (!state.started) {
        return;
      }

      const editableTarget = isEditableShortcutTarget(event.target, ui.input);

      if (!editableTarget && isFiletreeToggleShortcut(event)) {
        if (event.repeat) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        toggleFiletree();
        return;
      }

      if (!editableTarget && isAiPanelToggleShortcut(event)) {
        if (event.repeat) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        toggleAiPanel();
        return;
      }

      if (isTerminalToggleShortcut(event)) {
        if (event.repeat) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        toggleConsole();
        return;
      }

      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        toggleConsole();
        return;
      }

      if (state.consoleOpen && event.key === "Escape") {
        event.preventDefault();
        closeConsole();
        return;
      }

      if (event.key === "Escape") {
        if (isMenuOpen()) {
          closeMenus();
          return;
        }
        if (ui.fileDialog && !ui.fileDialog.hidden) {
          getFileDialogService()?.closeFileDialog();
        }
      }
    },
    { capture: true }
  );

  ui.closeConsoleBtn.addEventListener("click", () => {
    closeConsole();
  });
}
