export function installVimBridge({
  openConsole,
  setStatus,
  runCommand,
  openPodFileInEditor,
  listPodDirectoryInEditor,
}) {
  window.__bpRunCommand = (command) => {
    const text = String(command ?? "").trim();
    if (!text) {
      openConsole();
      setStatus("Enter a BrowserPod command.");
      return Promise.resolve();
    }

    openConsole();
    return runCommand(text);
  };

  window.__bpOpenFromPod = (pathArg) => {
    return openPodFileInEditor(pathArg);
  };

  window.__bpListFromPod = (pathArg) => {
    return listPodDirectoryInEditor(pathArg);
  };
}

export function uninstallVimBridge() {
  delete window.__bpRunCommand;
  delete window.__bpOpenFromPod;
  delete window.__bpListFromPod;
}
