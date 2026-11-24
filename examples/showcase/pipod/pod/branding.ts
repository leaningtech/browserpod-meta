import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { basename } from "node:path";

const LOGO = [
  "⠀⠀⠀⠀⠀⠀⠀⢀⣠⣴⠾⠷⣦⡀⠀⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⣀⣤⡾⠟⠋⠁⠀⠀⢸⣧⠸⠷⣦⡀⠀⠀⠀⠀",
  "⠀⣠⣴⠿⠛⠁⠀⠀⣀⣤⣶⠟⢸⣿⠀⠀⢸⣿⢰⣦⣄⠀",
  "⢰⡿⠁⠀⠀⣠⣴⡾⠛⠉⠀⠀⢸⣿⢰⡾⢸⣿⠀⠈⢻⡇",
  "⢺⡇⠀⠀⣼⡟⠁⠀⠀⢀⣠⣶⢸⣿⠀⠀⢸⣿⠀⠀⢸⡇",
  "⢸⡇⠀⠀⣿⡇⠀⠀⣼⡟⠉⠀⢸⣿⠀⠀⢸⣿⠀⠀⢸⡇",
  "⢸⡇⠀⠀⣿⡇⠀⠀⣿⡇⠀⣀⣼⡟⠀⠀⢸⣿⠀⠀⢸⡇",
  "⣾⡇⠀⠀⣿⡇⠀⠀⣩⣴⡾⠛⠉⠀⠀⠀⣸⡿⠀⠀⢸⡇",
  "⠸⣧⡀⠀⠙⠿⠶⠿⣋⡅⠀⠀⢀⣠⣶⠿⠛⠁⠀⢀⣾⠇",
  "⠀⠙⠿⣶⣄⡀⠀⠀⠙⢷⣶⡾⠟⠋⠀⠀⢀⣠⣶⠿⠋⠀",
  "⠀⠀⠀⠀⠙⠻⢷⣦⣀⠀⠀⠀⠀⣀⣴⡾⠟⠉⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠈⠛⠿⠶⠶⠿⠛⠁⠀⠀⠀⠀⠀⠀⠀",
];
const TAGLINE = "Made with BrowserPod and Little Coder (a fork of Pi)";

function buildHeader(theme: Theme): string[] {
  const dim = (s: string) => theme.fg("dim", s);
  const sep = theme.fg("muted", " · ");
  const hints = [
    `${dim("esc")} interrupt`,
    `${dim("ctrl-l/ctrl-c")} clear/exit`,
    `${dim("/")} commands`,
    `${dim("!")} bash`,
    `${dim("ctrl-r")} more`,
  ].join(sep);
  return [
    "",
    ...LOGO.map((line) => theme.fg("accent", line)),
    "",
    theme.bold(theme.fg("accent", "PiPod")),
    theme.fg("muted", TAGLINE),
    "",
    hints,
    "",
  ];
}

const setTitle = (ctx: any) => ctx.ui.setTitle(`PiPod - ${basename(ctx.cwd)}`);

// Pi resets the title each turn
export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    ctx.ui.setHeader((_tui, theme) => ({
      render: () => buildHeader(theme),
      invalidate() {},
    }));
    setTitle(ctx);
  });
  pi.on("turn_start", async (_event, ctx) => {
    if (ctx.hasUI) setTitle(ctx);
  });
  pi.on("turn_end", async (_event, ctx) => {
    if (ctx.hasUI) setTitle(ctx);
  });
}
