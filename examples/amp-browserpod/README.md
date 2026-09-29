# amp in BrowserPod

Runs [amp](https://amp.rs) 0.7.1, a modal terminal editor written in Rust, inside
a browser tab. amp is cross compiled to `wasm32-browserpod-linux-musl` and
executed in a Pod. The terminal fills the page and is styled by amp's own website
stylesheet. bash lives in a panel below it, opened by the bar along the bottom
edge, attached to the same Pod, so the two share one filesystem.

This is not a port. It is the editor as published, apart from two changes to its
source, both set out below.

This folder is self contained. It holds amp's source, the build, the vendored
stylesheets and the page, and reaches outside itself for nothing.

## Running it

```sh
npm install
cp .env.example .env.local     # paste a key from console.browserpod.io
npm run build-amp              # compiles amp to wasm
npm run dev
```

`npm run dev` runs `copy-binary` first, which is one `cp` of the built binary into
`public/`. It compiles nothing. A change to amp's Rust needs `npm run build-amp`
again before it can reach the page.

Vite binds IPv6 here, so `localhost` works where `127.0.0.1` may not.

## Deploying

Build command `npm run build`, output directory `dist`. Nothing else.

`build` deliberately does not compile amp. `public/amp` is committed, so a deploy
needs no rustup, no browserpod toolchain, no llvm and no cmake. The consequence is
that rebuilding amp is a local step whose result has to be committed, and a stale
`public/amp` will deploy silently.

`public/_headers` carries the cross origin isolation headers for Cloudflare Pages.
The `server` and `preview` blocks in `vite.config.js` only apply to local runs, so
without that file the deployed Pod cannot boot. Any other host needs the same two
headers set its own way.

## Toolchain

rustup, the `browserpod-3.0.1` toolchain, and three things from Homebrew.

```sh
brew install llvm cmake pkg-config
```

`cmake` and `pkg-config` are for `libgit2-sys`. The llvm is because Apple's clang
has no WebAssembly backend, so `build-amp.sh` points `BP_CLANG` and `BP_LLVM_AR`
at Homebrew's instead. `clang --print-targets | grep -i wasm` tells the two apart.

## What the build needed

Four things. Three are handled by `build-amp.sh`.

**The lockfile had to be refreshed.** The toolchain's `cargo` is a wrapper that
injects `[patch.crates-io]` entries for its own forks of `libc`, `rustix` and
`linux-raw-sys`, so a project never declares them. amp's checked in `Cargo.lock`
pinned versions predating those forks, and cargo quietly recorded all three
patches as `[[patch.unused]]` and carried on with the originals. `libc 0.2.152`
has no definitions for this target and fails with over a thousand errors. `rustix`
was worse, because the lockfile held `0.38` while the fork is `1.1.4`, which
cannot satisfy that requirement at all, so the whole graph had to resolve again.
One `cargo update` fixes it and the patches then appear in the graph.

**`BUILD_REVISION` has to be set.** amp's `build.rs` shells out to `git rev-parse
--short HEAD` and calls `.expect()` on the result. The source here came from a
release tarball with no repository, so the build panics without it.

**Vendored libgit2 needs one compiler flag.** It passes a `size_t *` to
`__builtin_uadd_overflow`, which takes an `unsigned int *`. On wasm32 `SIZE_MAX`
equals `UINT_MAX`, so both are 32 bit and the call is harmless, but clang 20 and
later treat the mismatch as an error rather than a warning. Hence
`-Wno-error=incompatible-pointer-types` in
`CFLAGS_wasm32_browserpod_linux_musl`. The `-w` that cc-rs already passes does not
help, because this is an error and not a warning.

**A size profile was added.** `release-small` in `Cargo.toml` turns on `lto`,
`codegen-units = 1`, `opt-level = "z"` and `strip`, taking the binary from 5.3 MB
to 3.5 MB, which matters when a browser has to fetch it.

## Changes to amp's source

Two, both under `amp-0.7.1`.

### The clipboard

`cli-clipboard` pulls in X11 and Wayland backends unconditionally on any unix
that is not macOS, with no feature flags to disable them, and `nix 0.24.3` in that
chain has no wasm32 ioctl constants. A Pod has neither an X server nor a
compositor, so the dependency is made target conditional in `Cargo.toml` and
`src/models/application/clipboard.rs` carries a stub for this target whose `new()`
returns an error.

amp already treated the system clipboard as an `Option` and coped when it was
absent, so in app copy and paste is untouched. Only synchronisation with an OS
clipboard is gone, and there is nothing here to synchronise with.

### Input handling

The substantive one, in `src/view/terminal/termion_terminal.rs`.

amp used `stdin().keys()`, termion's parser, which pulls the next byte on demand
when it meets an `ESC`. On a real terminal all three bytes of an arrow key are
already buffered by the time `poll` reports stdin readable, so that pull succeeds.

Inside a Pod they are not. Input crosses in through `writeChar`, which is one
character per `postMessage`, and the runtime's batching path posts each queued
entry separately as well. So amp could wake holding only the `ESC`. termion then
reported `Key::Esc`, and the `[` behind it arrived as a keystroke of its own. `[`
is bound to `buffer::toggle_line_comment` in amp's default keymap, that command
needs `buffer.path`, and the failure printed `No path found for the current
buffer` and took the screen with it. Pressing any arrow key wiped the editor, in
either direction, which is what made it unusable.

`listen()` now keeps a `Vec<u8>` across calls. It reads whatever bytes are
available, then parses a single event out of that buffer with
`termion::event::parse_event`, over an iterator that counts what it consumed. If
the parse runs out of bytes part way through a sequence, the buffer is left as it
is and nothing is returned, so the next poll brings the rest and the sequence
completes.

Holding a partial back would have broken the Escape key, because a lone `\x1b`
looks exactly like an incomplete sequence. The poll timeout branch settles that.
When the 100ms elapses with a partial still pending, `flush_key` resolves a bare
`\x1b` as Escape. The key mapping moved into `map_key` so both paths share it.

## The page

### Appearance

The markup mirrors `_terminal.html.erb` from amp's website, so amp sits in the
same `div.terminal`, `div.title-bar`, `div.content` structure.
`src/vendor/amp-website/` holds `base.css.scss` and `terminal.css.scss` copied
from amp's website repository verbatim and unmodified, and `src/styles.scss` pulls
them in with `@use`. Everything added on top of them is layout, so the terminal
fills the viewport rather than sitting on a white page.

Fira Mono is served locally from `public/fonts/`, in regular and bold, latin and
latin-ext. It was originally linked from Google, which made the terminal's
geometry depend on a network fetch.

The font and the palette are read back out of those stylesheets at runtime rather
than retyped. `typeFrom` measures a throwaway `pre` inside `.terminal` to pick up
`font-family: "Fira Mono", monospace` and `font-size: small`. `themeFrom` reads
`--base03`, `--yellow` and the rest off the element. Change a value in the
stylesheet and the terminal follows.

That measurement waits on `document.fonts.load` with the family alone and no
fallback in the string. Generic families are always satisfied, so passing the
computed value returns without ever waiting for Fira Mono.

**The painted font has to be forced to match.** `styles.scss` sets `13px` and
`"Fira Mono", monospace` on `.xterm` and `.xterm-rows` directly. The values passed
to the `Terminal` constructor do not reach the element, which resolves to the page
body font at 16px instead. `CharSizeService` sizes the grid from an
`OffscreenCanvas` using the constructor options, so without that CSS the grid is
measured at 13px Fira Mono and painted at 16px monospace. The two differ by about
25 percent, and a centred line lands roughly 34 columns right of centre.

bash shares none of this on purpose. Its frame uses `shell`, `shell-bar` and
`shell-body`, so no rule from amp's stylesheet reaches it.

`.shell-bar` is itself the button that opens the panel, carrying the BrowserPod
mark rather than a label. The mark is a CSS mask, so only the alpha of
`bp-logo2.svg` is used and its green never reaches the page.

`#amp-terminal` is `calc(100vh - 31px)` so that bar has its own strip and does not
cover amp's status line. The 31px is the bar's height, its 22px mark plus 4px of
padding either side plus a 1px border, and nothing ties the two numbers together.

### Syntax colours

The colours in the amp website mockup are applied by hand, token by token, as
spans with classes. Nothing in that stylesheet can reach a live terminal, and the
same goes for its `pre.line-numbers`, `.mode` and `.git-status` rules. The real
amp draws its own gutter and status bar as terminal text.

So the colours have to come from amp, through syntect, and amp ships only
`solarized_dark` and `solarized_light` with `default.yml` selecting the first.
`installTheme` writes `public/monokai.tmTheme` into
`/home/user/.config/amp/themes/` along with a `config.yml` selecting it. That path
is where app_dirs2 resolves `UserConfig` for `AppInfo { name: "amp" }` given
`HOME=/home/user`, and amp loads every `*.tmTheme` it finds there, keyed by
filename stem. The user keymap and theme merge over amp's defaults rather than
replacing them, so the config only names what it changes.

The scope mapping follows the mockup wherever the mockup shows it. Keywords
yellow, type names magenta, field and function names blue, punctuation violet.
Strings, constants and comments appear nowhere in it, so those took the remaining
values from the same palette rather than new ones.

### Terminals

amp is on `createCustomTerminal`, because the font and the palette have to be set
at construction and that path builds no xterm of its own. `attachAmp` follows what
`createDefaultTerminal` does internally, including the FitAddon, the
`bkscrollbar` class on the container, `scrollToTop` before fitting and the
explicit font weights. bash is on `createDefaultTerminal` with nothing set
afterwards.

**Both terminals are created before amp starts.** This is the part that matters.
Creating the second one while amp was already running left amp painting at that
terminal's row count rather than its own, so the editor rendered into 18 rows of a
90 row pane with the remains of its first frame stranded at the bottom. Opening
the panel now only runs bash on a terminal that already exists. Because the panel
is hidden with `visibility` and a transform rather than `display: none`, its
container has real dimensions at load and fits correctly.

## Runtime behaviour worth knowing

Read off `rt.browserpod.io/3.0.1/browserpod.js`, since the published reference is
silent or misleading on all four.

- **A terminal's size is fixed when it is created.** `fit()` runs once and the
  resulting cols and rows are baked in. The ResizeObserver that
  `createDefaultTerminal` installs re-fits xterm only and never tells the Pod, so
  the process's winsize never changes for its whole life. Never create a terminal
  whose container is not yet at its final size.
- **`run()` reports nothing about exits.** It is not `async`. It constructs a
  `Process` and returns it. `Process` is thenable, but `then` delegates to the
  spawn promise, so `await pod.run(...)` resolves once the process has started.
  There is no exit code and no way to sequence one process after another, which
  means `await pod.run("chmod", ...)` genuinely races whatever runs next.
- **Your `env` is appended after the defaults, so it overrides them.** `run()`
  always injects `TERM=xterm-256color`, `PATH=/bin:/usr/bin`,
  `LC_ALL=en_US.UTF-8` and `HOME=/home/user`, then concatenates yours. Passing
  `HOME` swaps a working home directory for a guess. `cwd` defaults to
  `/home/user`. Nothing is passed here.
- **Input crosses one character per message.** `writeChar` is the only input call
  and it takes a single character. This is what the input change to amp exists to
  cope with.

## The rest

- **Cross origin isolation.** BrowserPod needs `SharedArrayBuffer`, which
  requires `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp`. `vite.config.js` covers `dev` and
  `preview`, and `public/_headers` covers Cloudflare Pages. Any other host needs
  them set its own way, over HTTPS, since localhost is the only origin granted
  isolation without TLS.
- **Runtime and toolchain versions must match.** `@leaningtech/browserpod` is a
  375 byte shim that imports `https://rt.browserpod.io/<version>/browserpod.js`.
  The installed 3.0.1 pairs with the `browserpod-3.0.1` toolchain that built the
  binary. Bump them together.
- **Booting costs tokens.** `BrowserPod.boot()` deducts 10 per call, so every
  reload spends some. Passing `storageKey` resumes the same disk rather than a
  fresh ephemeral one.
- **The API key ships to the browser.** Anything `VITE_` prefixed is inlined into
  the bundle.
- `@xterm/xterm` and `@xterm/addon-fit` are direct dependencies because amp drives
  its own xterm. `sass` compiles the vendored stylesheets.
