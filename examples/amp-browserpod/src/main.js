import { BrowserPod } from "@leaningtech/browserpod";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import "./styles.scss";

const prop = (el, name) =>
  getComputedStyle(el).getPropertyValue(name).trim();

// Their palette, not a copy.
function themeFrom(el) {
  return {
    background: prop(el, "--base03"),
    foreground: prop(el, "--base00"),
    cursor: prop(el, "--base00"),
    black: prop(el, "--base02"),
    red: prop(el, "--red"),
    green: prop(el, "--green"),
    yellow: prop(el, "--yellow"),
    blue: prop(el, "--blue"),
    magenta: prop(el, "--magenta"),
    cyan: prop(el, "--cyan"),
    white: prop(el, "--base00"),
    brightBlack: prop(el, "--base01"),
    brightWhite: prop(el, "--base1"),
  };
}

// Measure their pre rule.
function typeFrom(frame) {
  const probe = document.createElement("pre");
  frame.appendChild(probe);
  const style = getComputedStyle(probe);
  const type = {
    fontFamily: style.fontFamily,
    fontSize: parseFloat(style.fontSize),
  };
  probe.remove();
  return type;
}

async function attachAmp(pod) {
  const frame = document.getElementById("amp-terminal");
  const host = document.getElementById("amp-console");

  const type = typeFrom(frame);

  // Family alone, or it never waits.
  await document.fonts.load(`${type.fontSize}px "Fira Mono"`);

  const xterm = new Terminal({
    ...type,
    fontWeight: 400,
    fontWeightBold: 700,
    theme: themeFrom(host),
    cursorBlink: true,
  });

  const fit = new FitAddon();
  xterm.loadAddon(fit);
  host.classList.add("bkscrollbar");
  xterm.open(host);
  xterm.scrollToTop();

  // Paint before measuring.
  await new Promise((resolve) => requestAnimationFrame(resolve));
  fit.fit();

  const terminal = await pod.createCustomTerminal({
    cols: xterm.cols,
    rows: xterm.rows,
    onOutput: (buffer) => xterm.write(new Uint8Array(buffer)),
  });
  xterm.onData((data) => terminal.readData(data));

  return terminal;
}

async function attachBash(pod) {
  const host = document.getElementById("bash-console");
  const terminal = await pod.createDefaultTerminal(host);
  return terminal;
}

function setUpDrawer(pod, terminal) {
  const drawer = document.getElementById("bash-drawer");
  const handle = document.getElementById("bash-handle");
  let started = false;

  handle.disabled = false;
  handle.addEventListener("click", () => {
    const open = drawer.classList.toggle("open");
    handle.setAttribute("aria-expanded", String(open));
    if (!open) return;

    if (started) return;
    started = true;
    pod.run("bash", ["--rcfile", RC_PATH, "-i"], {
      terminal,
      cwd: "/project",
    });
  });
}

async function copyIntoPod(pod, podPath, url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${url} -> HTTP ${resp.status}`);
  const bytes = await resp.arrayBuffer();

  const file = await pod.createFile(podPath, "binary");
  await file.write(bytes);
  await file.close();
}

const RC_PATH = "/home/user/.bp_bash_rc";

// Prompt, colours, greeting.
const BASH_RC =
  [
    'PS1="\\n\\[\\e[38;5;240m\\]╭─\\[\\e[0m\\] \\[\\e[1m\\]browserpod\\[\\e[0m\\] \\[\\e[38;5;240m\\]in\\[\\e[0m\\] \\[\\e[38;5;245m\\]\\w\\[\\e[0m\\]\\n\\[\\e[38;5;240m\\]╰─\\[\\e[0m\\]\\[\\e[38;5;208m\\]❯\\[\\e[0m\\] "',
    'PS2="\\[\\e[38;5;240m\\]··\\[\\e[0m\\]\\[\\e[38;5;208m\\]❯\\[\\e[0m\\] "',
    'export LS_COLORS="di=38;5;208:ln=38;5;39:ex=38;5;46:*.md=38;5;245"',
    'alias ls="ls --color=auto"',
    'alias ll="ls -lah --color=auto"',
    'alias la="ls -A --color=auto"',
    'alias grep="grep --color=auto"',
    'printf "  \\033[1mWelcome to BrowserPod\\033[0m\\n"',
    'printf "  \\033[38;5;240mtype \\033[38;5;208mhelp\\033[38;5;240m or hit Tab to explore.\\033[0m\\n"',
  ].join("\n") + "\n";

async function installBashRc(pod) {
  await pod.createDirectory("/home/user", { recursive: true });

  const rc = await pod.createFile(RC_PATH, "utf-8");
  await rc.write(BASH_RC);
  await rc.close();
}

// app_dirs2 UserConfig for amp.
const CONFIG = "/home/user/.config/amp";

async function installTheme(pod) {
  await pod.createDirectory(`${CONFIG}/themes`, { recursive: true });
  await copyIntoPod(pod, `${CONFIG}/themes/monokai.tmTheme`, "monokai.tmTheme");

  const config = await pod.createFile(`${CONFIG}/config.yml`, "utf-8");
  await config.write("theme: monokai\n");
  await config.close();
}

async function main() {
  const apiKey = import.meta.env.VITE_BROWSERPOD_API_KEY;
  if (!apiKey) {
    throw new Error("Set VITE_BROWSERPOD_API_KEY in web/.env.local");
  }

  const pod = await BrowserPod.boot({ apiKey });

  // Both before anything runs.
  const bash = await attachBash(pod);
  const terminal = await attachAmp(pod);

  await pod.createDirectory("/project");
  await copyIntoPod(pod, "/project/amp", "amp");
  await pod.run("chmod", ["+x", "/project/amp"], { terminal });

  await installTheme(pod);
  await installBashRc(pod);

  pod.run("/project/amp", [], { terminal, cwd: "/project" });
  setUpDrawer(pod, bash);
}

main();
