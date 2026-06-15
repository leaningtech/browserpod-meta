import { parsePodCommand, runPodCommand } from "../browserpod-runtime";

const COMMAND_TIMEOUT_MS = 10000;
const REPL_ONLY_COMMANDS = new Set([
  ".help",
  ".exit",
  ".break",
  ".clear",
  ".editor",
  ".load",
  ".save",
]);

function createTimeoutError(timeoutMs) {
  const error = new Error(`Command timed out after ${timeoutMs}ms.`);
  error.name = "CommandTimeoutError";
  return error;
}

function classifyCommandRisk(command) {
  const parsed = parsePodCommand(command);
  if (!parsed) {
    return null;
  }

  const executable = String(parsed.executable || "").trim();
  const args = Array.isArray(parsed.args) ? parsed.args : [];
  const firstArg = String(args[0] || "").trim();

  if (REPL_ONLY_COMMANDS.has(executable)) {
    return {
      short: "REPL command blocked.",
      detail: "REPL commands only work inside an interactive Node REPL session.",
    };
  }

  if (executable === "node" && args.length === 0) {
    return {
      short: "Interactive node REPL blocked.",
      detail: "Use node <file.js> instead of bare node in this command input.",
    };
  }

  if (executable === "node" && firstArg === "-e") {
    return {
      short: "Inline node -e blocked.",
      detail: "Use a file in /vimamp and run node <file.js> to avoid parsing issues.",
    };
  }

  if (executable === "npm" && firstArg === "exec") {
    return {
      short: "npm exec blocked.",
      detail: "Use direct node/npm commands in this input (npm exec has unstable parsing here).",
    };
  }

  return null;
}

function commandOrEmpty(command) {
  return String(command ?? "").trim();
}

function withTimeout(promise, timeoutMs) {
  const normalizedTimeoutMs = Number(timeoutMs);
  if (!Number.isFinite(normalizedTimeoutMs) || normalizedTimeoutMs <= 0) {
    return Promise.resolve(promise);
  }

  const guardedPromise = Promise.resolve(promise);
  let timeoutId = null;
  let didTimeout = false;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      reject(createTimeoutError(normalizedTimeoutMs));
    }, normalizedTimeoutMs);
  });

  return Promise.race([guardedPromise, timeoutPromise])
    .finally(() => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    })
    .catch((error) => {
      if (didTimeout) {
        // If the original command rejects later, prevent an unhandled rejection.
        guardedPromise.catch(() => {});
      }
      throw error;
    });
}

export function createRunnerService({
  state,
  setStatus,
  setError,
  reportFailure,
  cwd = "/vimamp",
  commandTimeoutMs = COMMAND_TIMEOUT_MS,
}) {
  let activeRunToken = 0;

  async function runCommand(command, options = {}) {
    const normalized = commandOrEmpty(command);
    if (!normalized) {
      setStatus("Enter a BrowserPod command.");
      return "empty";
    }

    const commandRisk = classifyCommandRisk(normalized);
    if (commandRisk) {
      const error = new Error(commandRisk.detail);
      reportFailure(commandRisk.short, error);
      setStatus(commandRisk.short);
      return "blocked";
    }

    if (!state.podReady || !state.pod || !state.terminal) {
      const error = new Error("BrowserPod is not ready. Commands are unavailable.");
      reportFailure("Command failed.", error);
      setStatus("BrowserPod is not ready.");
      return "blocked";
    }

    const commandCwd = String(options?.cwd || cwd || "/vimamp");
    const commandEcho = options?.echo ?? true;
    const hasTimeoutOverride =
      Object.prototype.hasOwnProperty.call(options, "timeoutMs");
    const commandTimeoutValue = hasTimeoutOverride
      ? Number(options.timeoutMs)
      : Number(commandTimeoutMs);
    const effectiveTimeoutMs =
      Number.isFinite(commandTimeoutValue) && commandTimeoutValue > 0
        ? commandTimeoutValue
        : 0;
    const runToken = ++activeRunToken;
    setError("");
    setStatus(`Running: ${normalized}`);

    try {
      await withTimeout(
        runPodCommand({
          pod: state.pod,
          terminal: state.terminal,
          command: normalized,
          cwd: commandCwd,
          echo: commandEcho,
        }),
        effectiveTimeoutMs
      );

      if (runToken !== activeRunToken) {
        return;
      }

      setStatus(`Completed: ${normalized}`);
      return "succeeded";
    } catch (error) {
      if (runToken !== activeRunToken) {
        return "superseded";
      }

      const timedOut = error?.name === "CommandTimeoutError";
      if (timedOut) {
        reportFailure("Command timed out.", error);
        if (effectiveTimeoutMs > 0) {
          const seconds = Math.max(1, Math.round(effectiveTimeoutMs / 1000));
          setStatus(`Command timed out after ${seconds}s.`);
        } else {
          setStatus("Command timed out.");
        }
        return "timed_out";
      }

      reportFailure("Command failed.", error);
      setStatus("Command failed.");
      return "failed";
    }
  }

  return {
    runCommand,
  };
}
