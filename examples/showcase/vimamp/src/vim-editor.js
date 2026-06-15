import { VimWasm, checkBrowserCompatibility } from "vim-wasm";

const VIM_WORKER_SCRIPT_PATH = "/vim-wasm/vim.js";

function encodeTextAsArrayBuffer(text) {
  const bytes = new TextEncoder().encode(text);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function toDropPath(filePath) {
  return filePath.startsWith("/") ? filePath.slice(1) : filePath;
}

function escapeForSingleQuotedVimString(value) {
  return value.replace(/'/g, "''");
}

function escapeForVimEditPath(filePath) {
  return filePath.replace(/([\\ ])/g, "\\$1");
}

function buildSnapshotCallbackName() {
  const random = Math.floor(Math.random() * 1e9)
    .toString(36)
    .padStart(6, "0");
  return `__bpCaptureBuffer_${Date.now().toString(36)}_${random}`;
}

export function createVimEditor({
  canvasElement,
  inputElement,
  vimRc,
  onSyncRequested,
  onExit = () => {},
  onError = () => {},
}) {
  let vim = null;
  const MAX_CANVAS_DIMENSION = 8192;
  let lastAppliedDomWidth = 0;
  let lastAppliedDomHeight = 0;
  let lastAppliedDpr = 0;
  let refreshInFlight = false;
  let operationChain = Promise.resolve();
  let runtimeToken = 0;

  function queueVimOperation(operation, { requireRunning = false } = {}) {
    const token = runtimeToken;
    const run = async () => {
      const instance = vim;
      if (!instance || !instance.isRunning() || token !== runtimeToken) {
        if (requireRunning) {
          throw new Error("Vim is not running.");
        }
        return;
      }
      return operation(instance);
    };

    const task = operationChain.then(run, run);
    operationChain = task.catch(() => {});
    return task;
  }

  function resizeCanvasBufferToDom(width, height, dpr) {
    const nextWidth = Math.max(
      1,
      Math.min(MAX_CANVAS_DIMENSION, Math.floor(width * dpr))
    );
    const nextHeight = Math.max(
      1,
      Math.min(MAX_CANVAS_DIMENSION, Math.floor(height * dpr))
    );

    if (canvasElement.width !== nextWidth) {
      canvasElement.width = nextWidth;
    }
    if (canvasElement.height !== nextHeight) {
      canvasElement.height = nextHeight;
    }
  }

  function resizeToContainer() {
    if (!vim || !vim.isRunning()) {
      return false;
    }

    const rect = canvasElement.getBoundingClientRect();
    const measuredWidth = Math.floor(rect.width);
    const measuredHeight = Math.floor(rect.height);
    if (measuredWidth < 2 || measuredHeight < 2) {
      // Ignore transient collapsed layout states (e.g. DevTools docking transitions).
      return false;
    }

    const domWidth = measuredWidth;
    const domHeight = measuredHeight;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    if (
      domWidth === lastAppliedDomWidth &&
      domHeight === lastAppliedDomHeight &&
      dpr === lastAppliedDpr
    ) {
      return false;
    }

    resizeCanvasBufferToDom(domWidth, domHeight, dpr);
    vim.resize(domWidth, domHeight);
    lastAppliedDomWidth = domWidth;
    lastAppliedDomHeight = domHeight;
    lastAppliedDpr = dpr;
    return true;
  }

  async function refreshDisplay() {
    if (refreshInFlight) {
      return;
    }
    await queueVimOperation(async (instance) => {
      if (refreshInFlight) {
        return;
      }
      refreshInFlight = true;
      try {
        await instance.cmdline("silent! redraw!");
        instance.focus();
      } finally {
        refreshInFlight = false;
      }
    });
  }

  async function openFileInVim(filePath, text) {
    const fullPath = String(filePath || "").trim();
    if (!fullPath) {
      throw new Error("File path is required.");
    }
    const contents = typeof text === "string" ? text : String(text ?? "");
    const directory = fullPath.replace(/\/[^/]*$/, "") || "/";

    await queueVimOperation(async (instance) => {
      await instance.cmdline(
        `call mkdir('${escapeForSingleQuotedVimString(directory)}', 'p')`
      );
      await instance.dropFile(toDropPath(fullPath), encodeTextAsArrayBuffer(contents));
      // Keep a single-window layout when switching modes/files.
      await instance.cmdline("silent! tabonly!");
      await instance.cmdline("silent! only!");
      await instance.cmdline(`edit! ${escapeForVimEditPath(fullPath)}`);
      await instance.cmdline("silent! redraw!");
      instance.focus();
    }, { requireRunning: true });
  }

  return {
    start({ initialFilePath, initialText }) {
      const compatibilityError = checkBrowserCompatibility();
      if (compatibilityError) {
        throw new Error(compatibilityError);
      }

      vim = new VimWasm({
        canvas: canvasElement,
        input: inputElement,
        workerScriptPath: VIM_WORKER_SCRIPT_PATH,
      });

      vim.onError = (error) => onError(error);
      vim.onVimExit = (statusCode) => onExit(statusCode);

      window.__bpSyncFromVim = (fullPath, contents) => {
        void onSyncRequested(fullPath, contents);
      };

      vim.start({
        dirs: ["/vimamp"],
        files: {
          [initialFilePath]: initialText,
          "/home/web_user/.vim/vimrc": vimRc,
          "/.vim/vimrc": vimRc,
        },
        cmdArgs: [initialFilePath],
        clipboard: true,
      });

      runtimeToken += 1;
      operationChain = Promise.resolve();
      refreshInFlight = false;
      lastAppliedDomWidth = 0;
      lastAppliedDomHeight = 0;
      lastAppliedDpr = 0;
      vim.focus();
    },

    async openFile(filePath, text) {
      await openFileInVim(filePath, text);
    },

    async runSyncCommand() {
      await queueVimOperation(async (instance) => {
        await instance.cmdline("BPSave");
      }, { requireRunning: true });
    },

    async runSaveAsCommand(filePath) {
      const targetPath = String(filePath || "").trim();
      if (!targetPath) {
        throw new Error("Save As target path is required.");
      }
      await queueVimOperation(async (instance) => {
        await instance.cmdline(
          `execute 'file ' . fnameescape('${escapeForSingleQuotedVimString(targetPath)}')`
        );
        await instance.cmdline("BPSave");
      }, { requireRunning: true });
    },

    async captureCurrentBuffer() {
      return queueVimOperation(async (instance) => {
        const callbackName = buildSnapshotCallbackName();

        return new Promise((resolve, reject) => {
          let settled = false;
          const timeoutId = window.setTimeout(() => {
            if (settled) {
              return;
            }
            settled = true;
            delete window[callbackName];
            reject(new Error("Timed out reading Vim buffer."));
          }, 4000);

          window[callbackName] = (fullPath, contents) => {
            if (settled) {
              return;
            }
            settled = true;
            clearTimeout(timeoutId);
            delete window[callbackName];
            resolve({
              path: String(fullPath || ""),
              text: String(contents ?? ""),
            });
          };

          instance
            .cmdline(
              `call jsevalfunc('window.${callbackName}(arguments[0], arguments[1]);', [expand('%:p'), join(getline(1, line('$')), \"\\\\n\")], v:true)`
            )
            .catch((error) => {
              if (settled) {
                return;
              }
              settled = true;
              clearTimeout(timeoutId);
              delete window[callbackName];
              reject(error);
            });
        });
      }, { requireRunning: true });
    },

    async setSyntaxHighlightingEnabled(enabled) {
      await queueVimOperation(async (instance) => {
        if (enabled) {
          await instance.cmdline("silent! filetype plugin indent on");
          await instance.cmdline("silent! syntax enable");
          return;
        }
        await instance.cmdline("silent! syntax off");
      });
    },

    isRunning() {
      return Boolean(vim && vim.isRunning());
    },

    async refreshDisplay() {
      await refreshDisplay();
    },

    async clearBuffer() {
      await queueVimOperation(async (instance) => {
        await instance.cmdline("silent! tabonly!");
        await instance.cmdline("silent! only!");
        await instance.cmdline("silent! enew!");
        await instance.cmdline("silent! redraw!");
        instance.focus();
      }, { requireRunning: true });
    },

    resizeToContainer() {
      return resizeToContainer();
    },

    stop() {
      delete window.__bpSyncFromVim;
      runtimeToken += 1;
      operationChain = Promise.resolve();
      refreshInFlight = false;

      const instance = vim;
      if (instance && instance.isRunning()) {
        void instance.cmdline("qall!");
      }
    },
  };
}
