import { DEMO_FILE_PATH, DEFAULT_TEXT, VIM_RC } from "./constants";
import { createAppState } from "./app-state";
import { formatErrorDetails, formatErrorSummary } from "./error-utils";
import { createVimEditor } from "./vim-editor";
import {
  DEFAULT_THEME_PROFILE,
  buildThemeVimRc,
  normalizeThemeProfile,
} from "./theme-config";
import {
  loadThemeProfileFromSessionStorage,
  saveThemeProfileToSessionStorage,
} from "./theme-storage";
import {
  TRAINING_FILE_PATH,
  TRAINING_FILE_TEXT,
  createLessonSession,
} from "./vim-lessons";
import {
  buildUserMappingVimRc,
  loadMappings,
  replaceMappings,
} from "./keymap-storage";
import { loadVimConfigBundleFromPod } from "./vim-config-storage";
import { createPodService } from "./services/pod-service";
import {
  createFilesystemService,
  joinPodPath,
} from "./services/filesystem-service";
import { createFileDialogService } from "./services/file-dialog-service";
import { createRunnerService } from "./services/runner-service";
import { createShellTerminalService } from "./services/shell-terminal-service";
import { createShellCommandService } from "./services/shell-command-service";
import { createLessonService } from "./services/lesson-service";
import { createEditorAiService } from "./services/editor-ai-service";
import { createCheatSheetPanelService } from "./services/cheatsheet-panel-service";
import {
  installVimBridge,
  uninstallVimBridge,
} from "./services/vim-bridge-service";
import { createUiSelectors } from "./ui/selectors";
import { createTabsController } from "./controllers/tabs-controller";
import { createFilesystemController } from "./controllers/filesystem-controller";
import { createMenuController } from "./controllers/menu-controller";
import { installGlobalEventHandlers as installGlobalEvents } from "./controllers/global-events-controller";
import { createLayoutController } from "./controllers/layout-controller";
import { createRuntimeController } from "./controllers/runtime-controller";
import { createFileActionsController } from "./controllers/file-actions-controller";

// App mode and filesystem contract constants shared across services.
const MODE_EDITOR = "editor";
const MODE_LEARN = "learn";
const LESSON_AUTO_ADVANCE_MS = 700;
const FILESYSTEM_ROOT_PATH = "/vimamp";

const ui = createUiSelectors();

const appState = createAppState({
  mode: MODE_EDITOR,
  activeFilePath: DEMO_FILE_PATH,
});
const state = appState.state;

const shellUiState = {
  cwd: FILESYSTEM_ROOT_PATH,
};
const layoutUiState = {
  filetreeVisible: false,
  aiPanelVisible: false,
  cheatSheetVisible: false,
  terminalVisible: false,
};
const portalUiState = {
  lastUrl: "",
  lastPort: 0,
};
const themeUiState = {
  profile: normalizeThemeProfile(DEFAULT_THEME_PROFILE),
};
const syntaxUiState = {
  enabled: true,
};
const editorResizeState = {
  frameId: 0,
  settleFrameId: 0,
  observer: null,
  retryTimerId: 0,
  retryCount: 0,
};
const vimLifecycleState = {
  allowAutoRecover: true,
  lastAutoRecoverAt: 0,
};
const vimRecoveryState = {
  inProgress: false,
  lastAttemptAt: 0,
};
let podService = null;
let filesystemService = null;
let runnerService = null;
let tabsController = null;
let filesystemController = null;
let menuController = null;
let shellTerminalService = null;
let shellCommandService = null;
let fileDialogService = null;
let lessonService = null;
let editorAiService = null;
let cheatSheetService = null;
let layoutController = null;
let runtimeController = null;
let fileActionsController = null;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// Shared top-level status/error messaging.
function setStatus(message) {
  ui.status.textContent = message;
}

function setPortalActionEnabled(enabled) {
  if (!ui.menuViewOpenPortalBtn) {
    return;
  }
  ui.menuViewOpenPortalBtn.disabled = !enabled;
}

function openLastPortal() {
  const portalUrl = String(portalUiState.lastUrl || "").trim();
  if (!portalUrl) {
    setStatus("No BrowserPod portal URL yet. Start a dev server first.");
    return;
  }

  window.open(portalUrl, "_blank", "noopener,noreferrer");
  const portText = portalUiState.lastPort > 0 ? `:${portalUiState.lastPort}` : "";
  setStatus(`Opened BrowserPod portal${portText}.`);
}

function handleBrowserPodPortal(portal) {
  const portalUrl = String(portal?.url || "").trim();
  const parsedPort = Number(portal?.port);
  const nextPort = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 0;

  if (!portalUrl) {
    return;
  }
  if (portalUiState.lastUrl === portalUrl && portalUiState.lastPort === nextPort) {
    return;
  }

  portalUiState.lastUrl = portalUrl;
  portalUiState.lastPort = nextPort;
  setPortalActionEnabled(true);

  const portLabel = nextPort > 0 ? `port ${nextPort}` : "BrowserPod portal";
  setStatus(`${portLabel} is ready. View > Open Last Portal.`);
  shellTerminalService?.writeSystemLine(`[portal] ${portalUrl}`);
}

function setError(message = "") {
  if (!message) {
    ui.error.hidden = true;
    ui.error.textContent = "";
    return;
  }
  ui.error.hidden = false;
  ui.error.textContent = message;
}

function reportFailure(prefix, error) {
  const summary = formatErrorSummary(error);
  const details = formatErrorDetails(error);
  setError(`${prefix} ${summary}`);
  console.error(prefix, error);
  console.error(details);
}

// ---------------------------------------------------------------------------
// Runtime configuration (vimrc, theme, syntax)
// ---------------------------------------------------------------------------

// Build runtime vimrc from static base + session options.
function getRuntimeVimRc() {
  const themeRc = buildThemeVimRc(themeUiState.profile);
  const syntaxRc = layoutController?.buildSyntaxVimRc() || "";
  const userMappingRc = buildUserMappingVimRc();
  if (!userMappingRc) {
    return `${VIM_RC}\n${themeRc}\n${syntaxRc}\n`;
  }
  return `${VIM_RC}\n${themeRc}\n${syntaxRc}\n${userMappingRc}\n`;
}

async function loadRuntimeThemeProfile() {
  if (state.podReady && state.pod) {
    try {
      const configBundle = await loadVimConfigBundleFromPod({
        pod: state.pod,
        fallbackTheme: DEFAULT_THEME_PROFILE,
        fallbackMappings: loadMappings(),
      });
      themeUiState.profile = configBundle.themeProfile;
      replaceMappings(configBundle.mappings);
      saveThemeProfileToSessionStorage(configBundle.themeProfile);
      return;
    } catch (error) {
      console.warn("Runtime config load from BrowserPod failed", error);
    }
  }

  themeUiState.profile = loadThemeProfileFromSessionStorage();
}

// ---------------------------------------------------------------------------
// Service wiring and app runtime lifecycle
// ---------------------------------------------------------------------------

function initializeServices() {
  layoutController = createLayoutController({
    ui,
    state,
    layoutUiState,
    syntaxUiState,
    editorResizeState,
    getShellTerminalService: () => shellTerminalService,
    setStatus,
    reportFailure,
    recoverVimSession: (reason) => runtimeController?.recoverVimSession(reason),
  });

  podService = createPodService({
    state,
    appState,
    terminalElement: ui.browserpodTerminalHost,
    setStatus,
    reportFailure,
    onPortal: (portal) => handleBrowserPodPortal(portal),
  });

  filesystemService = createFilesystemService({
    state,
    appState,
    modeLearn: MODE_LEARN,
    trainingFilePath: TRAINING_FILE_PATH,
    trainingFileText: TRAINING_FILE_TEXT,
    demoFilePath: DEMO_FILE_PATH,
    defaultText: DEFAULT_TEXT,
    setStatus,
    reportFailure,
  });

  runnerService = createRunnerService({
    state,
    setStatus,
    setError,
    reportFailure,
    cwd: FILESYSTEM_ROOT_PATH,
  });

  tabsController = createTabsController({
    ui,
    state,
    appState,
    getFilesystemService: () => filesystemService,
    requestEditorResize: () => layoutController?.requestEditorResize(),
    reportFailure,
    setStatus,
    filesystemRootPath: FILESYSTEM_ROOT_PATH,
  });

  filesystemController = createFilesystemController({
    ui,
    state,
    filesystemRootPath: FILESYSTEM_ROOT_PATH,
    getFilesystemService: () => filesystemService,
    ensureTab: (path) => tabsController?.ensureTab(path),
    requestEditorResize: () => layoutController?.requestEditorResize(),
    setFiletreeVisible: (visible) => layoutController?.setFiletreeVisible(visible),
    reportFailure,
    focusEditorInput: () => ui.input.focus(),
  });

  const ensureTab = (path) => tabsController.ensureTab(path);
  const isFilesystemRuntimeReady = () => filesystemController.isFilesystemRuntimeReady();
  const requestFilesystemRefresh = (options = {}) =>
    filesystemController.requestFilesystemRefresh(options);
  const normalizeFilesystemPath = (path) => filesystemController.normalizeFilesystemPath(path);
  const getDirectoryPath = (path) => filesystemController.getDirectoryPath(path);
  const getParentDirectoryPath = (path) => filesystemController.getParentDirectoryPath(path);
  const resolvePathInput = (rawInput, baseDirectory) =>
    filesystemController.resolvePathInput(rawInput, baseDirectory);
  const assertPathWithinRoot = (fullPath) => {
    if (!fullPath || !fullPath.startsWith(FILESYSTEM_ROOT_PATH)) {
      throw new Error(`Path must stay inside ${FILESYSTEM_ROOT_PATH}.`);
    }
  };

  fileActionsController = createFileActionsController({
    state,
    appState,
    ui,
    filesystemRootPath: FILESYSTEM_ROOT_PATH,
    getFilesystemService: () => filesystemService,
    isFilesystemRuntimeReady,
    ensureTab,
    getDirectoryPath,
    resolvePathInput,
    assertPathWithinRoot,
    openFilesystemPath: (path, type) => filesystemController.openFilesystemPath(path, type),
    requestFilesystemRefresh,
    selectFilesystemPath: (path, type = "other") =>
      filesystemController.selectFilesystemPath(path, type),
    setFilesystemCurrentDir: (path) => filesystemController.setCurrentDir(path),
    setStatus,
    reportFailure,
  });

  cheatSheetService = createCheatSheetPanelService({
    ui,
  });

  menuController = createMenuController({
    ui,
    onCreateNewFile: () => void fileActionsController?.createNewFileFromMenu(),
    onOpenFileDialog: () => fileDialogService?.openFileDialog(),
    onTriggerImportFiles: () => fileActionsController?.triggerImportPicker(ui.importFilesInput),
    onTriggerImportFolder: () =>
      fileActionsController?.triggerImportPicker(ui.importFolderInput),
    onSave: () => void fileActionsController?.saveCurrentBuffer(),
    onSaveAs: () => void fileActionsController?.saveCurrentBufferAs(),
    onExit: () => fileActionsController?.exitToEntryPage(),
    onToggleFiletree: () => layoutController?.toggleFiletree(),
    onToggleAi: () => {
      layoutController?.toggleAiPanel();
      if (layoutUiState.aiPanelVisible) {
        editorAiService?.focusInput();
      }
    },
    onToggleCheatSheet: () => {
      layoutController?.toggleCheatSheetPanel();
      if (layoutUiState.cheatSheetVisible) {
        void cheatSheetService?.ensureLoaded();
      }
    },
    onToggleTerminal: () => layoutController?.toggleConsole(),
    onOpenPortal: () => openLastPortal(),
    onToggleSyntax: () => layoutController?.toggleSyntaxHighlighting(),
    onToggleLessons: () => layoutController?.setLessonPanelVisible(!ui.lessonPanel?.hidden),
    onImportFilesChanged: () => {
      void fileActionsController?.importFromPicker(ui.importFilesInput, "files");
    },
    onImportFolderChanged: () => {
      void fileActionsController?.importFromPicker(ui.importFolderInput, "folder files");
    },
  });

  runtimeController = createRuntimeController({
    state,
    appState,
    ui,
    modeEditor: MODE_EDITOR,
    modeLearn: MODE_LEARN,
    filesystemRootPath: FILESYSTEM_ROOT_PATH,
    vimLifecycleState,
    vimRecoveryState,
    editorResizeState,
    shellUiState,
    getPodService: () => podService,
    getFilesystemService: () => filesystemService,
    getShellCommandService: () => shellCommandService,
    getShellTerminalService: () => shellTerminalService,
    getLessonService: () => lessonService,
    getRuntimeVimRc,
    createVimEditor,
    reportFailure,
    setStatus,
    setError,
    requestEditorResize: () => layoutController?.requestEditorResize(),
    ensureTab,
    hideHelper: () => layoutController?.hideHelper(),
    setLessonPanelVisible: (visible) => layoutController?.setLessonPanelVisible(visible),
    requestFilesystemRefresh,
    loadRuntimeThemeProfile,
  });

  fileDialogService = createFileDialogService({
    ui,
    filesystemRootPath: FILESYSTEM_ROOT_PATH,
    isFilesystemRuntimeReady,
    listDirectory: filesystemService.listDirectory,
    openPodFileInEditor: filesystemService.openPodFileInEditor,
    ensureTab,
    normalizeFilesystemPath,
    joinPodPath,
    getParentDirectoryPath,
    focusEditorInput: () => ui.input.focus(),
  });

  shellCommandService = createShellCommandService({
    state,
    shellState: shellUiState,
    filesystemRootPath: FILESYSTEM_ROOT_PATH,
    filesystemService,
    runnerService,
    ensureTab,
    saveCurrentBuffer: () => fileActionsController?.saveCurrentBuffer(),
    requestFilesystemRefresh,
    normalizeFilesystemPath,
    joinPodPath,
    formatErrorSummary,
    setStatus,
    writeShellErrorLine: (message) => shellTerminalService?.writeErrorLine(message),
  });

  shellTerminalService = createShellTerminalService({
    shellElement: ui.shellTerminal,
    browserpodTerminalHostElement: ui.browserpodTerminalHost,
    getCwd: () => shellUiState.cwd,
    runCommand: (command) => shellCommandService.runShellCommand(command),
  });

  lessonService = createLessonService({
    state,
    ui,
    createLessonSession,
    setStatus,
    setLessonPanelVisible: (visible) => layoutController?.setLessonPanelVisible(visible),
    restartVimForMode: (mode) => runtimeController?.restartVimForMode(mode),
    modeEditor: MODE_EDITOR,
    lessonAutoAdvanceMs: LESSON_AUTO_ADVANCE_MS,
    focusEditorInput: () => ui.input.focus(),
  });

  editorAiService = createEditorAiService({
    ui,
    state,
    filesystemRootPath: FILESYSTEM_ROOT_PATH,
    getFilesystemService: () => filesystemService,
    getCurrentBufferSnapshot: async () => {
      const activePath = String(state.activeFilePath || "").trim();
      if (!activePath) {
        return { path: "", text: "" };
      }

      if (state.vimEditor && typeof state.vimEditor.runSyncCommand === "function") {
        await state.vimEditor.runSyncCommand();
      }

      const text = await filesystemService.readFileText(activePath);
      return { path: activePath, text };
    },
    onHidePanel: () => layoutController?.setAiPanelVisible(false),
  });
}

// ---------------------------------------------------------------------------
// Bootstrap pipeline
// ---------------------------------------------------------------------------

function installGlobalEventHandlers() {
  installGlobalEvents({
    state,
    ui,
    editorResizeState,
    vimLifecycleState,
    isMenuOpen: () => menuController.isMenuOpen(),
    closeMenus: () => menuController.closeMenus(),
    getFileDialogService: () => fileDialogService,
    requestEditorResize: () => layoutController.requestEditorResize(),
    toggleFiletree: () => layoutController.toggleFiletree(),
    toggleAiPanel: () => {
      layoutController.toggleAiPanel();
      if (layoutUiState.aiPanelVisible) {
        editorAiService?.focusInput();
      }
    },
    toggleConsole: () => layoutController.toggleConsole(),
    closeConsole: () => layoutController.closeConsole(),
    getLessonService: () => lessonService,
    getShellTerminalService: () => shellTerminalService,
    uninstallVimBridge,
  });
}

function installRuntimeBindings() {
  installVimBridge({
    openConsole: () => layoutController.openConsole(),
    setStatus,
    runCommand: (command) =>
      shellTerminalService.submitCommand(command, { fromBridge: true }),
    openPodFileInEditor: (pathArg) => filesystemService.openPodFileInEditor(pathArg),
    listPodDirectoryInEditor: (pathArg) => filesystemService.listPodDirectoryInEditor(pathArg),
  });

  // Keep UI-only state synchronized with shared app events from services/editor.
  appState.subscribe(({ event, payload }) => {
    if (event === "activeFile") {
      const activePath = String(payload?.path || "");
      if (!activePath.startsWith(FILESYSTEM_ROOT_PATH)) {
        return;
      }

      const nextDirectory = filesystemController.getDirectoryPath(activePath);
      if (nextDirectory !== filesystemController.getCurrentDir()) {
        filesystemController.setCurrentDir(nextDirectory);
        shellUiState.cwd = nextDirectory;
        shellTerminalService.showPromptIfPending();
        filesystemController.clearFilesystemSelection();
        if (ui.filesystemPanel) {
          void filesystemController.requestFilesystemRefresh({
            preserveSelection: false,
          });
        }
      }

      tabsController.ensureTab(activePath);
      if (ui.filesystemPanel) {
        filesystemController.selectFilesystemPath(activePath, "file");
      }
      return;
    }

    if (event === "podStatus" && ui.filesystemPanel) {
      void filesystemController.requestFilesystemRefresh();
    }
  });
}

function installInterfaceHandlers() {
  menuController.installMenuHandlers();
  filesystemController.installFilesystemHandlers();
  fileDialogService.installFileDialogHandlers();
  shellTerminalService.install();
  lessonService.installLessonHandlers();
  editorAiService.installHandlers();
  ui.cheatSheetCloseBtn?.addEventListener("click", () => {
    layoutController?.setCheatSheetPanelVisible(false);
  });
}

function initializeInterfaceState() {
  setPortalActionEnabled(false);
  layoutController.setFiletreeVisible(false);
  layoutController.setAiPanelVisible(false);
  layoutController.setCheatSheetPanelVisible(false);
  layoutController.closeConsole();
  shellTerminalService.setBrowserPodMonitorVisible(false);
  layoutController.setLessonPanelVisible(false);
}

function bootstrapApplication() {
  initializeServices();
  installGlobalEventHandlers();
  installRuntimeBindings();
  installInterfaceHandlers();
  runtimeController.installEditorResizeObserver();
  initializeInterfaceState();
  runtimeController.installEntryHandlers();
}

bootstrapApplication();
