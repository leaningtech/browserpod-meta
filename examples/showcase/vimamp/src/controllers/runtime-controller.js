export function createRuntimeController({
  state,
  appState,
  ui,
  modeEditor,
  modeLearn,
  filesystemRootPath,
  vimLifecycleState,
  vimRecoveryState,
  editorResizeState,
  shellUiState,
  getPodService,
  getFilesystemService,
  getShellCommandService,
  getShellTerminalService,
  getLessonService,
  getRuntimeVimRc,
  createVimEditor,
  reportFailure,
  setStatus,
  setError,
  requestEditorResize,
  ensureTab,
  hideHelper,
  setLessonPanelVisible,
  requestFilesystemRefresh,
  loadRuntimeThemeProfile,
}) {
  async function bootVim() {
    if (state.vimEditor) {
      return;
    }

    if (typeof window !== "undefined" && !window.crossOriginIsolated) {
      const isolationMessage =
        "Vim requires cross-origin isolation (COOP/COEP). Cloudflare must serve COOP=same-origin and COEP=require-corp.";
      setError(isolationMessage);
      setStatus("Vim unavailable: cross-origin isolation is missing.");
      vimLifecycleState.allowAutoRecover = false;
      return;
    }

    try {
      const filesystemService = getFilesystemService();
      const initialFile = await filesystemService.getInitialFile();
      const instanceToken = ++state.vimInstanceToken;

      state.vimEditor = createVimEditor({
        canvasElement: ui.canvas,
        inputElement: ui.input,
        vimRc: getRuntimeVimRc(),
        onSyncRequested: (fullPath, contents) =>
          filesystemService.syncFromVim(fullPath, contents).catch((error) => {
            if (instanceToken !== state.vimInstanceToken) {
              return;
            }
            reportFailure("Sync failed.", error);
          }),
        onError: (error) => {
          if (instanceToken !== state.vimInstanceToken) {
            return;
          }
          reportFailure("Vim runtime error.", error);
        },
        onExit: () => {
          if (instanceToken !== state.vimInstanceToken) {
            return;
          }
          state.vimEditor = null;
          if (!vimLifecycleState.allowAutoRecover) {
            setStatus("Vim exited.");
            return;
          }

          const now = Date.now();
          if (now - vimLifecycleState.lastAutoRecoverAt < 1200) {
            setStatus("Vim exited.");
            return;
          }

          vimLifecycleState.lastAutoRecoverAt = now;
          setStatus("Vim exited unexpectedly. Recovering...");
          void bootVim();
        },
      });

      state.vimEditor.start({
        initialFilePath: initialFile.filePath,
        initialText: initialFile.text,
      });
      requestEditorResize();

      if (state.mode === modeLearn) {
        setStatus("Vim ready. Learn mode active.");
        return;
      }

      if (state.podReady) {
        setStatus("Vim ready. Use :BPSave to sync.");
      } else {
        setStatus("Vim ready (standalone). :BPSave requires BrowserPod.");
      }
    } catch (error) {
      // Ensure failed boots do not leave a half-created editor that triggers recovery loops.
      if (state.vimEditor) {
        try {
          state.vimEditor.stop?.();
        } catch (_stopError) {
          // Ignore cleanup failures after boot errors.
        }
        state.vimEditor = null;
      }

      const errorMessage = String(error?.message || "");
      if (/SharedArrayBuffer is not supported/i.test(errorMessage)) {
        vimLifecycleState.allowAutoRecover = false;
        setError(
          "SharedArrayBuffer unavailable. Configure COOP/COEP headers on deployment: COOP=same-origin and COEP=require-corp."
        );
      }
      reportFailure("Vim boot failed.", error);
      setStatus("Vim boot failed.");
    }
  }

  async function restartVimForMode(mode) {
    appState.setMode(mode);
    const existingEditor = state.vimEditor;
    if (existingEditor) {
      state.vimInstanceToken += 1;
      state.vimEditor = null;
      vimLifecycleState.allowAutoRecover = false;
      existingEditor.stop();
      await new Promise((resolve) => {
        setTimeout(resolve, 120);
      });
      vimLifecycleState.allowAutoRecover = true;
    }

    await bootVim();
  }

  async function bootAll() {
    setError("");
    setStatus("Starting...");
    await getPodService()?.bootBrowserPodIfAvailable();
    await loadRuntimeThemeProfile();
    if (getShellCommandService()?.isPodTerminalReady() && state.terminal) {
      getShellTerminalService()?.installPodTerminalMirror(state.terminal);
    }
    await bootVim();
    shellUiState.cwd = filesystemRootPath;
    await requestFilesystemRefresh({ preserveSelection: false });
  }

  async function startApplication(mode) {
    if (state.started) {
      return;
    }

    state.started = true;
    appState.setMode(mode);
    hideHelper();

    if (mode === modeLearn) {
      getLessonService()?.startLessons();
    } else {
      setLessonPanelVisible(false);
    }

    await bootAll();
  }

  function installEntryHandlers() {
    if (!ui.helper) {
      return;
    }

    const setSubmenuVisible = (button, menu, visible) => {
      if (!menu) {
        return;
      }
      const nextVisible = Boolean(visible);
      menu.hidden = !nextVisible;
      button?.setAttribute("aria-expanded", nextVisible ? "true" : "false");
    };

    const closeSubmenus = () => {
      setSubmenuVisible(ui.entryHelpBtn, ui.entryHelpMenu, false);
      setSubmenuVisible(ui.entrySettingsBtn, ui.entrySettingsMenu, false);
    };

    const focusFirstMenuItem = (menu) => {
      if (!menu || menu.hidden) {
        return;
      }
      const first = menu.querySelector("button, a");
      if (first instanceof HTMLElement) {
        first.focus();
      }
    };

    const toggleSubmenu = (button, menu) => {
      const isOpen = Boolean(menu && !menu.hidden);
      closeSubmenus();
      if (!isOpen) {
        setSubmenuVisible(button, menu, true);
        focusFirstMenuItem(menu);
        return;
      }
      button?.focus();
    };

    const activateEntryElement = (element) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }
      element.click();
    };

    const getVisibleEntryOptions = () =>
      Array.from(ui.helper.querySelectorAll(".dos-option")).filter((element) => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }
        return !element.closest("[hidden]");
      });

    const focusEntryOptionByOffset = (offset) => {
      const options = getVisibleEntryOptions();
      if (options.length === 0) {
        return;
      }

      const active = document.activeElement;
      const currentIndex = options.findIndex((option) => option === active);
      if (currentIndex < 0) {
        options[0].focus();
        return;
      }

      const nextIndex = (currentIndex + offset + options.length) % options.length;
      options[nextIndex].focus();
    };

    ui.entryLearnBtn?.addEventListener("click", () => {
      void startApplication(modeLearn);
    });

    ui.entryEditorBtn?.addEventListener("click", () => {
      void startApplication(modeEditor);
    });

    ui.entryHelpBtn?.addEventListener("click", () => {
      toggleSubmenu(ui.entryHelpBtn, ui.entryHelpMenu);
    });

    ui.entrySettingsBtn?.addEventListener("click", () => {
      toggleSubmenu(ui.entrySettingsBtn, ui.entrySettingsMenu);
    });

    ui.entryDocsBtn?.addEventListener("click", () => {
      window.location.assign("/docs.html");
    });

    ui.entryAboutBtn?.addEventListener("click", () => {
      setStatus("VimAmp: BrowserPod-powered Vim with learning tools.");
    });

    ui.helper.addEventListener("pointerdown", () => {
      ui.helper.focus();
    });

    ui.helper.addEventListener(
      "keydown",
      (event) => {
        if (!event.isTrusted || state.started) {
          return;
        }
        if (event.ctrlKey || event.metaKey || event.altKey) {
          return;
        }

        const key = String(event.key || "");
        if (key === "Escape") {
          event.preventDefault();
          closeSubmenus();
          setStatus("Select an option to continue.");
          ui.entryEditorBtn?.focus();
          return;
        }

        if (key === "ArrowDown") {
          event.preventDefault();
          focusEntryOptionByOffset(1);
          return;
        }

        if (key === "ArrowUp") {
          event.preventDefault();
          focusEntryOptionByOffset(-1);
          return;
        }

        if (key === "ArrowRight") {
          const active = document.activeElement;
          if (active === ui.entryHelpBtn) {
            event.preventDefault();
            toggleSubmenu(ui.entryHelpBtn, ui.entryHelpMenu);
            return;
          }
          if (active === ui.entrySettingsBtn) {
            event.preventDefault();
            toggleSubmenu(ui.entrySettingsBtn, ui.entrySettingsMenu);
            return;
          }
        }

        if (key === "ArrowLeft") {
          const active = document.activeElement;
          if (ui.entryHelpMenu && !ui.entryHelpMenu.hidden) {
            if (active instanceof HTMLElement && ui.entryHelpMenu.contains(active)) {
              event.preventDefault();
              closeSubmenus();
              ui.entryHelpBtn?.focus();
              return;
            }
          }

          if (ui.entrySettingsMenu && !ui.entrySettingsMenu.hidden) {
            if (active instanceof HTMLElement && ui.entrySettingsMenu.contains(active)) {
              event.preventDefault();
              closeSubmenus();
              ui.entrySettingsBtn?.focus();
              return;
            }
          }
        }

        if (key === "Enter" || key === " ") {
          const active = document.activeElement;
          if (!(active instanceof HTMLElement) || !active.classList.contains("dos-option")) {
            return;
          }
          event.preventDefault();
          activateEntryElement(active);
        }
      },
      { capture: true }
    );

    ui.entryEditorBtn?.focus();
  }

  function installEditorResizeObserver() {
    if (editorResizeState.observer || typeof ResizeObserver === "undefined") {
      return;
    }
    const editorShell = ui.canvas?.parentElement;
    if (!editorShell) {
      return;
    }

    editorResizeState.observer = new ResizeObserver(() => {
      requestEditorResize();
    });
    editorResizeState.observer.observe(editorShell);
  }

  async function recoverVimSession(reason) {
    const now = Date.now();
    if (vimRecoveryState.inProgress || now - vimRecoveryState.lastAttemptAt < 1500) {
      return;
    }

    vimRecoveryState.inProgress = true;
    vimRecoveryState.lastAttemptAt = now;

    try {
      console.warn("Recovering Vim session", reason);
      const targetPath = String(state.activeFilePath || "").trim();
      await restartVimForMode(state.mode);

      if (
        targetPath &&
        targetPath.startsWith(filesystemRootPath) &&
        state.podReady &&
        state.vimEditor
      ) {
        const opened = await getFilesystemService()?.openPodFileInEditor(targetPath);
        if (opened) {
          ensureTab(targetPath);
        }
      }

      requestEditorResize();
    } catch (error) {
      reportFailure("Vim recovery failed.", error);
      setStatus("Vim recovery failed.");
    } finally {
      vimRecoveryState.inProgress = false;
    }
  }

  return {
    restartVimForMode,
    installEntryHandlers,
    installEditorResizeObserver,
    recoverVimSession,
  };
}
