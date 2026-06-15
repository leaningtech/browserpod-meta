// Shared constants used by both BrowserPod runtime and vim-wasm integration.
export const DEMO_FILE_PATH = "/vimamp/note.txt";

export const BOOT_STABILIZATION_MS = 500;

export const DEFAULT_TEXT = [
  "# BrowserPod + vim-wasm",
  "",
  "This file is edited in vim-wasm and synced into BrowserPod.",
  "",
  "Sync steps:",
  "1. Edit in Vim",
  "2. Run :BPSave",
  "3. File is written to /vimamp/note.txt inside BrowserPod",
  "",
].join("\n");

export const VIM_RC = [
  "set number",
  "set norelativenumber",
  "set cursorline",
  "set nowrap",
  "set guifont=monospace:h18",
  "",
  '" Pipeline: sync current buffer into BrowserPod',
  "command! -nargs=0 BPSave call jsevalfunc('window.__bpSyncFromVim(arguments[0], arguments[1]);', [expand('%:p'), join(getline(1, \"$\"), \"\\\\n\")], v:true)",
  '" Pipeline: open or create BrowserPod file in Vim, e.g. :BPEdit /vimamp/main.js',
  "command! -nargs=1 BPEdit call jsevalfunc('window.__bpOpenFromPod(arguments[0]);', [<q-args>], v:true)",
  '" Pipeline: list BrowserPod directory in Vim buffer, e.g. :BPLs /vimamp',
  "command! -nargs=? BPLs call jsevalfunc('window.__bpListFromPod(arguments[0]);', [<q-args>], v:true)",
  "command! -nargs=1 BPPull BPEdit <q-args>",
  "command! -nargs=? BPList BPLs <q-args>",
  '" Pipeline: run BrowserPod command in console, e.g. :BP npm ls',
  "command! -nargs=* BP call jsevalfunc('window.__bpRunCommand(arguments[0]);', [<q-args>], v:true)",
  "nnoremap <leader>s :BPSave<CR>",
  "",
].join("\n");
