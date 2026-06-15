function basename(filePath) {
  const value = String(filePath || "");
  const parts = value.split("/").filter(Boolean);
  return parts[parts.length - 1] || value || "(untitled)";
}

export function createTabsController({
  ui,
  state,
  appState,
  getFilesystemService,
  requestEditorResize,
  reportFailure,
  setStatus,
  filesystemRootPath,
}) {
  const tabs = [];

  function renderTabs() {
    if (!ui.tabBar) {
      return;
    }

    ui.tabBar.textContent = "";
    const activePath = String(state.activeFilePath || "").trim();

    tabs.forEach((path) => {
      const tabButton = document.createElement("button");
      tabButton.type = "button";
      tabButton.className = "tab-item";
      tabButton.dataset.path = path;
      if (path === activePath) {
        tabButton.classList.add("is-active");
      }

      const name = document.createElement("span");
      name.className = "tab-name";
      name.textContent = basename(path);

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "tab-close";
      closeButton.textContent = "x";
      closeButton.setAttribute("aria-label", `Close ${basename(path)}`);
      closeButton.addEventListener("click", (event) => {
        event.stopPropagation();
        void closeTab(path);
      });

      tabButton.appendChild(name);
      tabButton.appendChild(closeButton);
      tabButton.addEventListener("click", () => {
        void activateTab(path);
      });
      ui.tabBar.appendChild(tabButton);
    });
  }

  function ensureTab(path) {
    const fullPath = String(path || "").trim();
    if (!fullPath) {
      return;
    }
    if (!tabs.includes(fullPath)) {
      tabs.push(fullPath);
    }
    renderTabs();
  }

  async function clearEditorWhenNoTabs() {
    if (!state.vimEditor) {
      return;
    }

    if (typeof state.vimEditor.clearBuffer === "function") {
      await state.vimEditor.clearBuffer();
      return;
    }

    // Fallback for editor instances created before clearBuffer existed.
    if (typeof state.vimEditor.openFile === "function") {
      await state.vimEditor.openFile(`${filesystemRootPath}/.bp/.scratch-buffer`, "");
      state.vimEditor.resizeToContainer?.();
      await state.vimEditor.refreshDisplay?.();
    }
  }

  async function transitionToNoOpenTabsState() {
    renderTabs();
    try {
      await clearEditorWhenNoTabs();
    } catch (error) {
      reportFailure("Close tab failed.", error);
      setStatus("Close tab failed.");
      return false;
    }
    appState.setActiveFilePath("");
    setStatus("No file open.");
    requestEditorResize();
    return true;
  }

  async function activateTab(path) {
    const fullPath = String(path || "").trim();
    const activePath = String(state.activeFilePath || "").trim();
    if (!fullPath || fullPath === activePath) {
      return;
    }
    const filesystemService = getFilesystemService();
    const opened = await filesystemService?.openPodFileInEditor(fullPath);
    if (!opened) {
      return;
    }
    requestEditorResize();
    ensureTab(fullPath);
  }

  async function closeTab(path) {
    const fullPath = String(path || "").trim();
    if (!fullPath) {
      return;
    }

    const nextTabs = tabs.filter((item) => item !== fullPath);
    tabs.length = 0;
    tabs.push(...nextTabs);
    if (tabs.length === 0) {
      await transitionToNoOpenTabsState();
      return;
    }

    const activePath = String(state.activeFilePath || "").trim();
    if (activePath === fullPath) {
      const nextPath = tabs[tabs.length - 1] || "";
      renderTabs();
      if (nextPath) {
        const filesystemService = getFilesystemService();
        const opened = await filesystemService?.openPodFileInEditor(nextPath);
        if (!opened) {
          setStatus("Tab open failed.");
        } else {
          requestEditorResize();
        }
        return;
      }

      await transitionToNoOpenTabsState();
      return;
    }
    renderTabs();
  }

  return {
    renderTabs,
    ensureTab,
  };
}
