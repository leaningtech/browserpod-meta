import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

const UTF8_DECODER = new TextDecoder();

export function createShellTerminalService({
  shellElement,
  browserpodTerminalHostElement,
  getCwd,
  runCommand,
}) {
  const runtime = {
    term: null,
    fitAddon: null,
    resizeFrameId: 0,
    currentInput: "",
    history: [],
    historyCursor: -1,
    busy: false,
    promptPending: false,
    lineStart: true,
    ansiEscaping: false,
    podMirrorPatched: false,
    podMirrorOriginalWrite: null,
    podMirrorObserver: null,
    podMirrorPollId: 0,
    podMirrorRows: [],
    podLastDirectOutputAt: 0,
    podSnapshotMirrorSuppressedUntil: 0,
    podSnapshotMirrorEnabled: false,
  };

  function normalizeMirrorLine(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+$/g, "");
  }

  function areSameRows(previousRows, nextRows) {
    const previous = Array.isArray(previousRows) ? previousRows : [];
    const next = Array.isArray(nextRows) ? nextRows : [];
    if (previous.length !== next.length) {
      return false;
    }
    for (let index = 0; index < previous.length; index += 1) {
      if (previous[index] !== next[index]) {
        return false;
      }
    }
    return true;
  }

  function computeAppendedRows(previousRows, nextRows) {
    const previous = Array.isArray(previousRows) ? previousRows : [];
    const next = Array.isArray(nextRows) ? nextRows : [];

    if (previous.length === 0) {
      return next;
    }
    if (next.length === 0) {
      return [];
    }

    const maxOverlap = Math.min(previous.length, next.length, 512);
    for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
      let matches = true;
      for (let index = 0; index < overlap; index += 1) {
        if (previous[previous.length - overlap + index] !== next[index]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        return next.slice(overlap);
      }
    }

    const previousUnique = new Set(previous.filter((line) => line.length > 0));
    return next.filter((line) => line.length > 0 && !previousUnique.has(line));
  }

  function getPromptPrefix() {
    return String(getCwd?.() || "/vimamp");
  }

  function isReady() {
    return Boolean(runtime.term);
  }

  function isBusy() {
    return runtime.busy;
  }

  function isPromptPending() {
    return runtime.promptPending;
  }

  function decodePodOutputChunk(data) {
    if (typeof data === "string") {
      return data;
    }
    if (data instanceof ArrayBuffer) {
      return UTF8_DECODER.decode(new Uint8Array(data));
    }
    if (ArrayBuffer.isView(data)) {
      return UTF8_DECODER.decode(data);
    }
    return String(data ?? "");
  }

  function readBrowserpodTerminalRows() {
    if (!browserpodTerminalHostElement) {
      return [];
    }

    const rowContainer = browserpodTerminalHostElement.querySelector(".xterm-rows");
    if (rowContainer) {
      const rowNodes = Array.from(rowContainer.children || []);
      if (rowNodes.length === 0) {
        return [];
      }
      return rowNodes.map((row) => normalizeMirrorLine(row.textContent || ""));
    }

    const helperTextarea = browserpodTerminalHostElement.querySelector("textarea");
    if (helperTextarea && typeof helperTextarea.value === "string") {
      return String(helperTextarea.value)
        .split(/\r?\n/)
        .map((line) => normalizeMirrorLine(line));
    }

    return [];
  }

  function toMirrorChunk(rows) {
    const promptPrefix = `${getPromptPrefix()} $`;
    const printableRows = rows
      .map((line) => normalizeMirrorLine(line))
      .filter((line) => line.length > 0 && !line.startsWith(promptPrefix));

    if (printableRows.length === 0) {
      return "";
    }

    return `${printableRows.join("\r\n")}\r\n`;
  }

  function mirrorFromBrowserpodTerminalSnapshot() {
    if (!browserpodTerminalHostElement) {
      return;
    }
    if (!runtime.podSnapshotMirrorEnabled) {
      return;
    }
    if (Date.now() < runtime.podSnapshotMirrorSuppressedUntil) {
      return;
    }
    if (Date.now() - runtime.podLastDirectOutputAt < 160) {
      return;
    }

    const nextRows = readBrowserpodTerminalRows();
    if (areSameRows(nextRows, runtime.podMirrorRows)) {
      return;
    }

    const appendedRows = computeAppendedRows(runtime.podMirrorRows, nextRows);
    runtime.podMirrorRows = nextRows;
    const chunk = toMirrorChunk(appendedRows);
    if (chunk) {
      writeRaw(chunk);
    }
  }

  function updateLineState(text) {
    const chunk = String(text || "");
    if (!chunk) {
      return;
    }

    for (const char of chunk) {
      if (runtime.ansiEscaping) {
        if ((char >= "@" && char <= "~") || char === "\\") {
          runtime.ansiEscaping = false;
        }
        continue;
      }
      if (char === "\u001b") {
        runtime.ansiEscaping = true;
        continue;
      }
      if (char === "\n") {
        runtime.lineStart = true;
        continue;
      }
      if (char === "\r") {
        continue;
      }
      runtime.lineStart = false;
    }
  }

  function writeRaw(text) {
    if (!isReady()) {
      return;
    }
    const chunk = String(text ?? "");
    if (!chunk) {
      return;
    }
    runtime.term.write(chunk);
    updateLineState(chunk);
  }

  function writePrompt() {
    if (!isReady()) {
      return;
    }
    if (!runtime.lineStart) {
      writeRaw("\r\n");
    }
    writeRaw(`${getPromptPrefix()} $ `);
    runtime.promptPending = false;
  }

  function showPromptIfPending() {
    if (!isReady() || !runtime.promptPending) {
      return;
    }
    writePrompt();
  }

  function clearInput() {
    if (!isReady() || !runtime.currentInput) {
      return;
    }
    const erase = "\b \b".repeat(runtime.currentInput.length);
    writeRaw(erase);
    runtime.currentInput = "";
  }

  function replaceInput(nextInput) {
    clearInput();
    const next = String(nextInput || "");
    if (!next) {
      return;
    }
    runtime.currentInput = next;
    writeRaw(next);
  }

  function navigateHistory(direction) {
    const count = runtime.history.length;
    if (count === 0) {
      return;
    }

    if (runtime.historyCursor < 0) {
      runtime.historyCursor = count;
    }

    const nextIndex = Math.max(0, Math.min(count, runtime.historyCursor + direction));
    runtime.historyCursor = nextIndex;

    if (nextIndex >= count) {
      replaceInput("");
      return;
    }
    replaceInput(runtime.history[nextIndex]);
  }

  function focus() {
    if (!isReady()) {
      return;
    }
    runtime.term.focus();
  }

  function requestResize() {
    if (!runtime.fitAddon) {
      return;
    }
    if (runtime.resizeFrameId) {
      cancelAnimationFrame(runtime.resizeFrameId);
      runtime.resizeFrameId = 0;
    }
    runtime.resizeFrameId = requestAnimationFrame(() => {
      runtime.resizeFrameId = 0;
      try {
        runtime.fitAddon.fit();
      } catch (error) {
        console.warn("shell fit failed", error);
      }
    });
  }

  function setBrowserPodMonitorVisible(visible) {
    const show = Boolean(visible);
    if (browserpodTerminalHostElement) {
      browserpodTerminalHostElement.classList.toggle("is-visible", show);
      browserpodTerminalHostElement.setAttribute("aria-hidden", show ? "false" : "true");
    }

    const terminalShell = shellElement?.parentElement;
    if (terminalShell) {
      terminalShell.classList.toggle("bp-monitor-visible", show);
    }

    requestResize();
  }

  function mirrorPodOutput(data) {
    if (!isReady()) {
      return;
    }
    const chunk = decodePodOutputChunk(data);
    if (!chunk) {
      return;
    }
    writeRaw(chunk);
  }

  function installPodTerminalMirror(podTerminal) {
    if (!podTerminal || runtime.podMirrorPatched) {
      return;
    }

    let writeHookInstalled = false;
    if (typeof podTerminal.write === "function") {
      try {
        const originalWrite = podTerminal.write.bind(podTerminal);
        runtime.podMirrorOriginalWrite = originalWrite;
        podTerminal.write = async (data) => {
          const result = await originalWrite(data);
          runtime.podLastDirectOutputAt = Date.now();
          mirrorPodOutput(data);
          return result;
        };
        writeHookInstalled = true;
      } catch (error) {
        console.warn("terminal write patch failed", error);
      }
    }

    if (browserpodTerminalHostElement) {
      runtime.podMirrorRows = readBrowserpodTerminalRows();
      runtime.podMirrorObserver = new MutationObserver(() => {
        mirrorFromBrowserpodTerminalSnapshot();
      });
      runtime.podMirrorObserver.observe(browserpodTerminalHostElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      runtime.podMirrorPollId = window.setInterval(() => {
        mirrorFromBrowserpodTerminalSnapshot();
      }, 120);
    }

    runtime.podMirrorPatched = Boolean(
      writeHookInstalled || runtime.podMirrorObserver || runtime.podMirrorPollId
    );
  }

  async function submitCommand(commandText, options = {}) {
    const command = String(commandText || "");
    const fromBridge = Boolean(options?.fromBridge);
    const trimmed = command.trim();
    const isPassThrough = /^(?:npm|node)(?:\s|$)/.test(trimmed);

    if (!isReady()) {
      return;
    }

    if (runtime.busy) {
      writeRaw("\r\nerror: command already running\r\n");
      runtime.promptPending = true;
      showPromptIfPending();
      return;
    }

    if (fromBridge) {
      clearInput();
      if (!runtime.lineStart) {
        writeRaw("\r\n");
      }
      writeRaw(`${getPromptPrefix()} $ ${trimmed}\r\n`);
    } else {
      writeRaw("\r\n");
    }

    if (!trimmed) {
      runtime.promptPending = true;
      showPromptIfPending();
      return;
    }

    runtime.busy = true;
    try {
      if (isPassThrough) {
        runtime.podSnapshotMirrorEnabled = true;
        runtime.podMirrorRows = readBrowserpodTerminalRows();
        runtime.podSnapshotMirrorSuppressedUntil = 0;
      } else {
        runtime.podSnapshotMirrorEnabled = false;
        runtime.podMirrorRows = readBrowserpodTerminalRows();
        runtime.podSnapshotMirrorSuppressedUntil = Date.now() + 1800;
      }
      await runCommand(trimmed);
    } finally {
      runtime.busy = false;
      runtime.currentInput = "";
      runtime.historyCursor = runtime.history.length;
      if (!isPassThrough) {
        runtime.podSnapshotMirrorSuppressedUntil = Date.now() + 1200;
      } else {
        runtime.podSnapshotMirrorEnabled = false;
        runtime.podMirrorRows = readBrowserpodTerminalRows();
      }
      runtime.promptPending = true;
      showPromptIfPending();
    }
  }

  function install() {
    if (!shellElement || runtime.term) {
      return;
    }

    const term = new XTerm({
      cursorBlink: true,
      convertEol: false,
      fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 13,
      theme: {
        background: "#060606",
        foreground: "#d4d4d4",
        cursor: "#9fc3ff",
      },
      scrollback: 3000,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(shellElement);

    runtime.term = term;
    runtime.fitAddon = fitAddon;
    runtime.promptPending = true;

    term.onData((data) => {
      if (runtime.busy) {
        return;
      }

      if (data === "\r") {
        const command = runtime.currentInput;
        if (command.trim()) {
          runtime.history.push(command);
          if (runtime.history.length > 200) {
            runtime.history.shift();
          }
        }
        runtime.historyCursor = runtime.history.length;
        runtime.currentInput = "";
        void submitCommand(command);
        return;
      }

      if (data === "\u0003") {
        clearInput();
        writeRaw("^C");
        runtime.promptPending = true;
        showPromptIfPending();
        return;
      }

      if (data === "\u007f") {
        if (!runtime.currentInput) {
          return;
        }
        runtime.currentInput = runtime.currentInput.slice(0, -1);
        writeRaw("\b \b");
        return;
      }

      if (data === "\u001b[A") {
        navigateHistory(-1);
        return;
      }

      if (data === "\u001b[B") {
        navigateHistory(1);
        return;
      }

      if (data === "\u001b[C" || data === "\u001b[D" || data === "\t") {
        return;
      }

      if (!/^[\x20-\x7e]$/.test(data)) {
        return;
      }

      runtime.currentInput += data;
      writeRaw(data);
    });

    shellElement.addEventListener("pointerdown", () => {
      focus();
    });

    requestResize();
    showPromptIfPending();
  }

  function writeErrorLine(message) {
    const summary = String(message || "Unknown error");
    writeRaw(`error: ${summary}\r\n`);
  }

  function writeSystemLine(message) {
    const text = String(message || "").trim();
    if (!text) {
      return;
    }
    if (!runtime.lineStart) {
      writeRaw("\r\n");
    }
    writeRaw(`${text}\r\n`);
    runtime.promptPending = true;
    if (!runtime.busy) {
      showPromptIfPending();
    }
  }

  function dispose({ podTerminal = null } = {}) {
    if (runtime.resizeFrameId) {
      cancelAnimationFrame(runtime.resizeFrameId);
      runtime.resizeFrameId = 0;
    }
    if (runtime.podMirrorObserver) {
      runtime.podMirrorObserver.disconnect();
      runtime.podMirrorObserver = null;
    }
    if (runtime.podMirrorPollId) {
      clearInterval(runtime.podMirrorPollId);
      runtime.podMirrorPollId = 0;
    }
    if (runtime.podMirrorOriginalWrite && podTerminal) {
      try {
        podTerminal.write = runtime.podMirrorOriginalWrite;
      } catch (error) {
        console.warn("terminal write restore failed", error);
      }
      runtime.podMirrorOriginalWrite = null;
    }
    if (runtime.term) {
      runtime.term.dispose();
      runtime.term = null;
    }
    runtime.podMirrorPatched = false;
    runtime.podMirrorRows = [];
    runtime.podLastDirectOutputAt = 0;
  }

  return {
    install,
    dispose,
    focus,
    requestResize,
    setBrowserPodMonitorVisible,
    isReady,
    isBusy,
    isPromptPending,
    showPromptIfPending,
    installPodTerminalMirror,
    submitCommand,
    writeErrorLine,
    writeSystemLine,
  };
}
