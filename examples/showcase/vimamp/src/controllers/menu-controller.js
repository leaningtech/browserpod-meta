export function createMenuController({
  ui,
  onCreateNewFile,
  onOpenFileDialog,
  onTriggerImportFiles,
  onTriggerImportFolder,
  onSave,
  onSaveAs,
  onExit,
  onToggleFiletree,
  onToggleAi,
  onToggleCheatSheet = () => {},
  onToggleTerminal,
  onOpenPortal = () => {},
  onToggleSyntax,
  onToggleLessons,
  onImportFilesChanged,
  onImportFolderChanged,
}) {
  let menuKey = "";

  function setMenuOpen(nextMenuKey = "") {
    menuKey = nextMenuKey;
    const menuMap = {
      file: [ui.menuFileBtn, ui.menuFilePanel],
      edit: [ui.menuEditBtn, ui.menuEditPanel],
      view: [ui.menuViewBtn, ui.menuViewPanel],
      help: [ui.menuHelpBtn, ui.menuHelpPanel],
    };

    Object.entries(menuMap).forEach(([key, pair]) => {
      const [button, panel] = pair;
      const open = key === menuKey;
      if (button) {
        button.classList.toggle("is-open", open);
      }
      if (panel) {
        panel.hidden = !open;
      }
    });
  }

  function closeMenus() {
    setMenuOpen("");
  }

  function isMenuOpen() {
    return Boolean(menuKey);
  }

  function installMenuHandlers() {
    const menuButtons = [
      ["file", ui.menuFileBtn],
      ["edit", ui.menuEditBtn],
      ["view", ui.menuViewBtn],
      ["help", ui.menuHelpBtn],
    ];
    menuButtons.forEach(([key, button]) => {
      if (!button) {
        return;
      }
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        setMenuOpen(menuKey === key ? "" : key);
      });
    });

    document.addEventListener("click", () => {
      closeMenus();
    });

    const withMenuClosed = (callback) => () => {
      closeMenus();
      callback();
    };

    const menuActionBindings = [
      [ui.menuFileNewBtn, onCreateNewFile],
      [ui.menuFileOpenBtn, onOpenFileDialog],
      [ui.menuFileImportFilesBtn, onTriggerImportFiles],
      [ui.menuFileImportFolderBtn, onTriggerImportFolder],
      [ui.menuFileSaveBtn, onSave],
      [ui.menuFileSaveAsBtn, onSaveAs],
      [ui.menuFileExitBtn, onExit],
      [ui.menuViewToggleTreeBtn, onToggleFiletree],
      [ui.menuViewToggleAiBtn, onToggleAi],
      [ui.menuViewToggleCheatSheetBtn, onToggleCheatSheet],
      [ui.menuViewToggleTerminalBtn, onToggleTerminal],
      [ui.menuViewOpenPortalBtn, onOpenPortal],
      [ui.menuViewToggleSyntaxBtn, onToggleSyntax],
      [ui.menuViewOpenLessonsBtn, onToggleLessons],
    ];
    menuActionBindings.forEach(([button, callback]) => {
      button?.addEventListener("click", withMenuClosed(callback));
    });

    ui.importFilesInput?.addEventListener("change", () => {
      onImportFilesChanged();
    });

    ui.importFolderInput?.addEventListener("change", () => {
      onImportFolderChanged();
    });
  }

  return {
    closeMenus,
    isMenuOpen,
    installMenuHandlers,
  };
}
