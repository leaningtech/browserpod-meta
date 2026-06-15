export function createLayoutController({
  ui,
  state,
  layoutUiState,
  syntaxUiState,
  editorResizeState,
  getShellTerminalService,
  setStatus,
  reportFailure,
  recoverVimSession,
}) {
  function setLessonPanelVisible(visible) {
    if (!ui.lessonPanel) {
      return;
    }
    ui.lessonPanel.hidden = !visible;
    ui.lessonPanel.style.display = visible ? "grid" : "none";
  }

  function runEditorResizeNow() {
    if (!state.vimEditor) {
      return;
    }
    try {
      if (
        typeof state.vimEditor.isRunning === "function" &&
        !state.vimEditor.isRunning()
      ) {
        void recoverVimSession("Runtime stopped during resize.");
        return;
      }

      const resized = state.vimEditor.resizeToContainer();
      void state.vimEditor.refreshDisplay?.();
      if (resized) {
        editorResizeState.retryCount = 0;
        if (editorResizeState.retryTimerId) {
          clearTimeout(editorResizeState.retryTimerId);
          editorResizeState.retryTimerId = 0;
        }
        return;
      }

      if (editorResizeState.retryTimerId || editorResizeState.retryCount >= 8) {
        return;
      }
      editorResizeState.retryCount += 1;
      editorResizeState.retryTimerId = window.setTimeout(() => {
        editorResizeState.retryTimerId = 0;
        requestEditorResize();
      }, 80);
    } catch (error) {
      console.warn("Editor resize failed", error);
      void recoverVimSession("Resize exception.");
    }
  }

  function requestEditorResize() {
    const shellTerminalService = getShellTerminalService();
    if (!state.vimEditor) {
      shellTerminalService?.requestResize();
      return;
    }

    if (editorResizeState.frameId) {
      cancelAnimationFrame(editorResizeState.frameId);
      editorResizeState.frameId = 0;
    }
    if (editorResizeState.settleFrameId) {
      cancelAnimationFrame(editorResizeState.settleFrameId);
      editorResizeState.settleFrameId = 0;
    }

    runEditorResizeNow();
    shellTerminalService?.requestResize();

    editorResizeState.frameId = requestAnimationFrame(() => {
      editorResizeState.frameId = 0;
      // Some panel toggles settle over two frames; run once more to avoid transient stretch.
      editorResizeState.settleFrameId = requestAnimationFrame(() => {
        editorResizeState.settleFrameId = 0;
        runEditorResizeNow();
        shellTerminalService?.requestResize();
      });
    });
  }

  function updateViewToggleLabels() {
    const treeText = layoutUiState.filetreeVisible ? "Hide Filetree" : "Show Filetree";
    const aiText = layoutUiState.aiPanelVisible ? "Hide AI Panel" : "Show AI Panel";
    const cheatSheetText = layoutUiState.cheatSheetVisible
      ? "Hide Cheat Sheet"
      : "Show Cheat Sheet";
    const terminalText = layoutUiState.terminalVisible ? "Hide Terminal" : "Show Terminal";
    const syntaxText = syntaxUiState.enabled
      ? "Disable Syntax Highlighting"
      : "Enable Syntax Highlighting";

    if (ui.menuViewToggleTreeBtn) {
      ui.menuViewToggleTreeBtn.textContent = treeText;
    }
    if (ui.menuViewToggleAiBtn) {
      ui.menuViewToggleAiBtn.textContent = aiText;
    }
    if (ui.menuViewToggleCheatSheetBtn) {
      ui.menuViewToggleCheatSheetBtn.textContent = cheatSheetText;
    }
    if (ui.menuViewToggleTerminalBtn) {
      ui.menuViewToggleTerminalBtn.textContent = terminalText;
    }
    if (ui.menuViewToggleSyntaxBtn) {
      ui.menuViewToggleSyntaxBtn.textContent = syntaxText;
    }
  }

  function openConsole() {
    if (!ui.consolePanel) {
      return;
    }
    const shellTerminalService = getShellTerminalService();
    state.consoleOpen = true;
    layoutUiState.terminalVisible = true;
    ui.consolePanel.hidden = false;
    ui.consolePanel.setAttribute("aria-hidden", "false");
    updateViewToggleLabels();
    requestEditorResize();
    if (
      !shellTerminalService?.isBusy() &&
      shellTerminalService?.isPromptPending() &&
      shellTerminalService?.isReady()
    ) {
      shellTerminalService?.showPromptIfPending();
    }
    shellTerminalService?.focus();
  }

  function closeConsole() {
    if (!ui.consolePanel) {
      return;
    }
    state.consoleOpen = false;
    layoutUiState.terminalVisible = false;
    ui.consolePanel.hidden = true;
    ui.consolePanel.setAttribute("aria-hidden", "true");
    updateViewToggleLabels();
    requestEditorResize();
    ui.input.focus();
  }

  function toggleConsole() {
    if (state.consoleOpen) {
      closeConsole();
      return;
    }
    openConsole();
  }

  function setFiletreeVisible(visible) {
    layoutUiState.filetreeVisible = Boolean(visible);
    if (ui.filesystemPanel) {
      ui.filesystemPanel.hidden = !layoutUiState.filetreeVisible;
    }
    updateViewToggleLabels();
    requestEditorResize();
  }

  function setAiPanelVisible(visible) {
    layoutUiState.aiPanelVisible = Boolean(visible);
    if (ui.aiPanel) {
      ui.aiPanel.hidden = !layoutUiState.aiPanelVisible;
    }
    updateViewToggleLabels();
    requestEditorResize();
  }

  function toggleAiPanel() {
    setAiPanelVisible(!layoutUiState.aiPanelVisible);
  }

  function setCheatSheetPanelVisible(visible) {
    layoutUiState.cheatSheetVisible = Boolean(visible);
    if (ui.cheatSheetPanel) {
      ui.cheatSheetPanel.hidden = !layoutUiState.cheatSheetVisible;
    }
    updateViewToggleLabels();
    requestEditorResize();
  }

  function toggleCheatSheetPanel() {
    setCheatSheetPanelVisible(!layoutUiState.cheatSheetVisible);
  }

  function toggleFiletree() {
    setFiletreeVisible(!layoutUiState.filetreeVisible);
  }

  function buildSyntaxVimRc() {
    if (syntaxUiState.enabled) {
      return [
        '" Session syntax highlighting setting',
        "silent! filetype plugin indent on",
        "silent! syntax enable",
        "",
      ].join("\n");
    }

    return ['" Session syntax highlighting setting', "silent! syntax off", ""].join(
      "\n"
    );
  }

  async function setSyntaxHighlightingEnabled(enabled) {
    syntaxUiState.enabled = Boolean(enabled);
    updateViewToggleLabels();

    if (!state.vimEditor) {
      return;
    }

    try {
      await state.vimEditor.setSyntaxHighlightingEnabled(syntaxUiState.enabled);
      setStatus(
        syntaxUiState.enabled
          ? "Syntax highlighting enabled."
          : "Syntax highlighting disabled."
      );
    } catch (error) {
      reportFailure("Syntax toggle failed.", error);
      setStatus("Syntax toggle failed.");
    }
  }

  function toggleSyntaxHighlighting() {
    void setSyntaxHighlightingEnabled(!syntaxUiState.enabled);
  }

  function hideHelper() {
    if (!ui.helper || !ui.helper.parentNode) {
      return;
    }
    ui.helper.parentNode.removeChild(ui.helper);
  }

  return {
    setLessonPanelVisible,
    requestEditorResize,
    openConsole,
    closeConsole,
    toggleConsole,
    setFiletreeVisible,
    setAiPanelVisible,
    toggleAiPanel,
    setCheatSheetPanelVisible,
    toggleCheatSheetPanel,
    toggleFiletree,
    buildSyntaxVimRc,
    setSyntaxHighlightingEnabled,
    toggleSyntaxHighlighting,
    hideHelper,
  };
}
