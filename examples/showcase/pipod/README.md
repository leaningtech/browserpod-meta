# PiPod

**A free AI coding agent that runs open-weight models entirely in your browser. No sign-up, no API key, no cloud model.**

PiPod gives you a terminal coding agent in a browser tab. You describe what you want, and the agent writes files, runs shell commands, installs npm packages and starts servers, all on your own device. The language model runs locally on your GPU through WebGPU, and the code runs in a Linux-like sandbox inside the same tab.

There is nothing to install and no account to create. Open the page, pick a model, press Start.

Powered by [BrowserPod](https://browserpod.io).

---

## Contents

- [Why PiPod](#why-pipod)
- [Features](#features)
- [How it works](#how-it-works)
- [Models](#models)
- [With or without a BrowserPod key](#with-or-without-a-browserpod-key)
- [Requirements](#requirements)
- [Using PiPod](#using-pipod)
- [Privacy](#privacy)
- [Limitations](#limitations)
- [Open source and licences](#open-source-and-licences)
- [What PiPod changes in Little Coder](#what-pipod-changes-in-little-coder)
- [Self-hosting and development](#self-hosting-and-development)
- [FAQ](#faq)

---

## Why PiPod

Most AI coding agents send your prompts and code to a cloud model and run commands on your machine or on a remote server. They need an account, an API key or a subscription.

PiPod takes a different approach. Everything happens inside one browser tab:

- **The model runs on your device.** Open-weight models are downloaded from Hugging Face once, saved in your browser's storage, and run on your GPU.
- **The agent runs on your device.** PiPod uses [Little Coder](https://github.com/itayinbarr/little-coder), a version of the [Pi](https://github.com/earendil-works/pi/tree/main/packages/coding-agent) agent harness adapted for smaller models.
- **The code runs on your device.** [BrowserPod](https://browserpod.io) provides a Linux-like sandbox with bash, Node.js and npm, compiled to WebAssembly and running in the tab.

That makes PiPod a free, no-sign-up way to try an agentic coding workflow, experiment with local LLMs, or work on small projects without sending anything to an AI provider.

## Features

- **Free, with no sign-up.** No account, no API key and no credit card to use a hosted PiPod.
- **Runs locally.** Inference happens on your GPU through WebGPU. Your prompts and code are never sent to an AI service.
- **Open-weight models.** Gemma 4 E4B, Gemma 4 E2B and Qwen2.5 Coder 1.5B, plus two legacy options. All are Apache 2.0 licensed.
- **A real terminal agent.** The agent can read, write and edit files, run bash commands, install npm packages and start servers.
- **A Linux-like sandbox in the tab.** bash, git, Node.js 22, npm, pnpm, ripgrep, curl and the usual command-line tools.
- **Live server links.** With a BrowserPod key, a server started in the sandbox gets a public portal URL. The agent is told the URL and it appears in the footer.
- **Thinking.** The Gemma 4 models show their reasoning before they answer.
- **Your files persist.** The sandbox's disk is kept in your browser between visits.
- **Open source.** PiPod's own code is Apache 2.0. See [Open source and licences](#open-source-and-licences) for the parts that are not.

## How it works

PiPod has three parts, plus a small bridge that connects them.

### Harness: Little Coder on Pi

The agent itself is [Little Coder](https://github.com/itayinbarr/little-coder), which builds on the [Pi](https://github.com/earendil-works/pi/tree/main/packages/coding-agent) coding agent harness and adds extensions aimed at smaller models, such as loop detection and tool gating. The harness provides the agent loop, the tools (bash, read, write, edit and others), the system prompt and the terminal interface. It does not include a model.

PiPod ships a prebuilt, patched copy of Little Coder in this repository. On the first visit it is copied into the sandbox and unpacked. PiPod's changes are listed in [What PiPod changes in Little Coder](#what-pipod-changes-in-little-coder).

### Inference: LiteRT-LM and Sipp on WebGPU

The model runs in the web page, not in the sandbox.

- **LiteRT-LM.** The main models run on [LiteRT-LM](https://github.com/google-ai-edge/LiteRT-LM), Google's on-device inference runtime. Its runtime is compiled to [WebAssembly](https://webassembly.org) and runs the model on your GPU through [WebGPU](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API).
- **Sipp (legacy engine).** The legacy models run on [Sipp](https://www.sipp.sh/), which runs [llama.cpp](https://github.com/ggml-org/llama.cpp) compiled to WebAssembly, also on WebGPU.

Both runtimes are used unmodified. Models are downloaded from [Hugging Face](https://huggingface.co) the first time you choose them and saved in your browser's storage, so later visits load them without downloading again.

### Execution: BrowserPod

[BrowserPod](https://browserpod.io) runs a Linux-like environment in the browser, compiled to WebAssembly. It provides a POSIX-style filesystem that persists in the browser, processes, bash, Node.js and npm. Little Coder runs inside it, and so does every command the agent runs. BrowserPod is used unmodified.

### The bridge

The agent runs inside the sandbox and the model runs in the page, so they need a way to talk.

1. PiPod's provider extension registers the model with Pi as an OpenAI-compatible endpoint.
2. When Pi asks for a reply, the extension writes the request to a file in the sandbox.
3. The page watches the sandbox's filesystem, picks up the request, and runs it on the model.
4. The model's reply, including thinking and tool calls, streams back as small files that the extension turns into a normal streaming response for Pi.
5. Pi runs any tool calls in the sandbox, sends the results back, and the loop continues.

## Models

All models are open-weight, Apache 2.0 licensed and downloaded from Hugging Face without an account.

| Model | Download | Engine | Context in PiPod | Thinking | Notes |
|---|---|---|---|---|---|
| Gemma 4 E4B | 3.0 GB | LiteRT-LM | 32,768 tokens | Yes | Default. The most capable option. |
| Gemma 4 E2B | 2.0 GB | LiteRT-LM | 32,768 tokens | Yes | Smaller and faster. |
| Qwen2.5 Coder 1.5B | 1.1 GB | LiteRT-LM | 4,096 tokens | No | Unstable. Its LiteRT build only holds a short conversation, and it may fail at tool calls. |
| Qwen3.5 4B | 2.7 GB | Sipp (legacy) | 32,768 tokens | No | Under Advanced. |
| Tiny-Agent 0.5B | 0.4 GB | Sipp (legacy) | 32,768 tokens | No | Under Advanced. Very small, for devices with limited resources. |

Larger models take longer to download and use more of your device's resources. Smaller models are quicker to download but less reliable at tool calls, and an agent that can't make tool calls can't do anything.

Model sources:

- [litert-community/gemma-4-E4B-it-litert-lm](https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm)
- [litert-community/gemma-4-E2B-it-litert-lm](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm)
- [litert-community/Qwen2.5-Coder-1.5B-Instruct](https://huggingface.co/litert-community/Qwen2.5-Coder-1.5B-Instruct)
- [unsloth/Qwen3.5-4B-GGUF](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF)
- [driaforall/Tiny-Agent-a-0.5B](https://huggingface.co/driaforall/Tiny-Agent-a-0.5B)

## With or without a BrowserPod key

PiPod's setup screen offers two ways to start the sandbox.

| | With key | Without key |
|---|---|---|
| Portal links for servers | Yes | No |
| npm install | Yes | Yes |
| Other web access | Allowlisted hosts, including github.com and raw.githubusercontent.com | Only sites that allow requests from a web page (CORS) |
| Needs a BrowserPod API key | Yes, built into the deployment | No |

The key mode uses BrowserPod Edge, BrowserPod's optional networking service. The keyless mode uses BrowserPod's built-in fetch network, which reaches the internet through the page's own `fetch()`. The agent is told which mode it is in, so it knows whether servers will have a public URL.

If a deployment has no key, the "With key" option is disabled.

## Requirements

- **A browser with WebGPU.** Recent versions of Chrome and Edge support it. Check [MDN's WebGPU page](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API#browser_compatibility) for other browsers.
- **Enough memory and GPU for the model.** Running a model takes a lot of processing power. On less powerful devices, or with larger models, the browser may stop responding for a while.
- **Disk space for the model.** Between 0.4 GB and 3.0 GB, depending on the model.
- **An internet connection on first use**, to download the model, the BrowserPod runtime and PiPod itself.

## Using PiPod

1. Open PiPod.
2. Choose a model and a BrowserPod mode, then press Start. Start downloads the model into your browser's storage unless it is already there.
3. Wait for the loading screen. The first visit takes longest, because the model and Little Coder have to be downloaded and set up.
4. Type a request and press Enter.

Keys and commands in the terminal:

- `esc` stops the current reply
- `/` opens the command list
- `!` runs a bash command yourself, for example `!ls`
- `ctrl-o` expands a collapsed tool output
- `ctrl-l` clears the screen, `ctrl-c` exits
- `ctrl-r` shows more shortcuts

Example requests:

- "Create an Express hello world app and run it"
- "Write a Node script that counts the words in every .md file in this folder"
- "Explain what this file does" (after creating or cloning a project)

Servers the agent starts run in the background. With a key, the latest portal URL appears in Pi's footer and the agent gives it to you.

## Privacy

PiPod is built so that your prompts and code stay on your device.

What stays on your device:

- Your prompts and the model's replies. The model runs in the page.
- Your code and files. They live in the sandbox's storage in your browser.

What does reach the network:

- **Downloads.** The model comes from Hugging Face. BrowserPod's runtime and disk images come from BrowserPod's servers, which, according to the BrowserPod licence, see your IP address and the page's origin and receive no telemetry. PiPod's own files come from wherever PiPod is hosted.
- **Commands the agent runs.** `npm install`, `git clone`, `curl` and similar commands reach the internet like they would on any computer. In key mode they go through BrowserPod Edge.
- **Portals.** When you open a portal link, the traffic to your server goes through BrowserPod Edge.

## Limitations

PiPod runs small models on consumer hardware. Expect the following:

- **Small models are much weaker than cloud models.** They handle short, well-defined tasks best and can lose track of longer ones.
- **Turns get slower as a session grows.** Each request re-processes the whole conversation, so later turns take longer before the reply starts.
- **Your browser may freeze briefly** while the model is working, especially on less powerful devices or with larger models.
- **Some npm packages need care.** Packages with native binaries don't run in BrowserPod. The agent is told how to swap common ones, such as esbuild and rollup, for their WebAssembly builds.
- **Python is limited.** `python3` runs with its standard library only. There is no pip.
- **Qwen2.5 Coder is unstable** because its LiteRT build is limited to 4,096 tokens.
- **Not built for offline use.** The BrowserPod runtime loads from BrowserPod's servers.

## Open source and licences

**PiPod's own code is open source under the [Apache License 2.0](LICENSE).** That covers the web app, the provider extension, the build script and the patches in this repository.

PiPod also depends on software under other licences. One of them, BrowserPod, is not open source.

| Component | What it does in PiPod | Licence | Open source |
|---|---|---|---|
| PiPod (this repository) | Web app, bridge, provider extension, patches | Apache 2.0 | Yes |
| [Little Coder](https://github.com/itayinbarr/little-coder) | Agent harness, bundled and modified | Apache 2.0 | Yes |
| [Pi coding agent](https://github.com/earendil-works/pi/tree/main/packages/coding-agent) | Harness core, bundled and modified | MIT | Yes |
| [LiteRT-LM](https://github.com/google-ai-edge/LiteRT-LM) | Model runtime | Apache 2.0 | Yes |
| [Sipp](https://www.sipp.sh/) | Legacy model runtime | Apache 2.0 | Yes |
| [BrowserPod](https://browserpod.io) | Sandbox | BrowserPod Community Licence | No. Free to use, including commercially, with credit. |
| Models (see [Models](#models)) | Inference | Apache 2.0 | Open-weight |

Notes:

- **BrowserPod** is free for any use under its Community Licence, as long as it is credited. Its runtime is loaded from BrowserPod's servers and is not copied, modified or redistributed by PiPod. Self-hosting or redistributing the BrowserPod runtime needs a separate licence from Leaning Technologies. See [browserpod.io](https://browserpod.io) for the licence terms.
- **Little Coder and Pi** are bundled in `pod/little-coder.tgz.*` together with their npm dependencies. Each dependency keeps its own licence file inside the bundle.
- **Models** are not distributed in this repository. They are downloaded from Hugging Face at runtime.

The full list of third-party components is in [NOTICE](NOTICE).

## What PiPod changes in Little Coder

PiPod uses Little Coder 1.4.1 with these changes, applied at build time by `build-little-coder.sh`:

- **Provider extension.** A new extension that connects Pi to the model in the page through the bridge, adds guidance about the sandbox to the system prompt, shows the latest portal link in the footer and tells the agent the URL.
- **Shared working directory.** A `cd` in one bash call now carries over to the next one, and the file tools resolve relative paths from the same directory.
- **Stopping commands.** When you press `esc` or a command times out, the bash tool now returns control to the agent even if the command's process doesn't report that it has exited.
- **No nudge after `esc`.** Little Coder's quality monitor no longer treats a reply you stopped as an empty reply.
- **TypeBox loading.** The `@sinclair/typebox` package is loaded through its CommonJS build so it works in the sandbox.
- **Branding.** The header shows the PiPod logo and name, and Little Coder's example "hello" extension is removed.
- **Smaller bundle.** Windows-only native binaries of the `koffi` package are removed.

## Self-hosting and development

### Run it locally

```bash
npm install
npm run dev
```

The dev server sends the cross-origin isolation headers BrowserPod needs (`vite.config.js`).

### BrowserPod key (optional)

Without a key, PiPod runs in keyless mode only. To enable portals and wider web access, create an API key at [console.browserpod.io](https://console.browserpod.io) and add it to `.env.local`:

```bash
cp .env.example .env.local     # then paste the key after VITE_BP_APIKEY=
```

The key is built into the web app, so anyone using your deployment uses your key.

### Deploy

```bash
npm run build
```

Build command `npm run build`, output directory `dist`. To deploy with a key, set `VITE_BP_APIKEY` as a build environment variable (a secret on Cloudflare Pages), since Vite inlines it into the bundle at build time.

Serve the `dist` folder from any static host. The page must be cross-origin isolated, so the host has to send these headers. `public/_headers` sets them for Cloudflare Pages and Netlify:

```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: cross-origin
```

The bundled Little Coder is split into parts under 25 MB each, so it fits Cloudflare Pages' file size limit.

Under the BrowserPod licence, a deployment must show a visible "Powered by BrowserPod" credit linked to https://browserpod.io where the pod runs.

### Rebuild the bundled Little Coder

```bash
./build-little-coder.sh
```

This installs Little Coder from npm, applies PiPod's patches, and writes `pod/little-coder.tgz.aa` and `pod/little-coder.tgz.ab`. It runs on your computer, not in the browser.

### Add a model

Models are listed in `src/models.js`. A LiteRT-LM model needs a `.litertlm` file built for the web. A Sipp model needs a GGUF file. Each entry sets the download URL, the engine, the size shown on the setup screen and the sampling settings, and can set its own context and reply limits.

## FAQ

### Is PiPod a free alternative to Claude Code?

PiPod is a free, no-sign-up coding agent in the same style as terminal agents like Claude Code. It is not affiliated with Anthropic or any other AI provider, and it is not as capable. Claude Code and similar tools use large cloud models. PiPod runs small open-weight models on your own device, so it suits short tasks, learning how coding agents work, and situations where you don't want to send code to a cloud service.

### Do I need an account, an API key or a credit card?

Not to use a hosted PiPod. If you self-host it, the keyless mode needs nothing. The key mode needs a BrowserPod API key, which you get from the BrowserPod console.

### Is PiPod really free?

Yes. PiPod is open source under Apache 2.0, the models are free to download, and BrowserPod is free to use under its Community Licence. The model runs on your own hardware, so there is no per-token cost.

### Does my code get sent anywhere?

Your prompts and code are never sent to an AI service. The network only sees downloads, the commands the agent runs (such as `npm install`), and portal traffic. See [Privacy](#privacy).

### Which browsers work?

Browsers with WebGPU, such as recent Chrome and Edge. PiPod tells you if WebGPU is missing.

### Why does my browser freeze?

Running a language model is heavy work for a GPU. On less powerful devices, or with larger models, the browser can stop responding for a while. Try Gemma 4 E2B, which is smaller and faster.

### Which model should I pick?

Start with Gemma 4 E4B if your device can handle it, or Gemma 4 E2B for something lighter and faster. The others are there to try on devices with limited resources, but they are less reliable.

### Can I use my own model?

Yes, if you self-host. Add it to `src/models.js`. See [Add a model](#add-a-model).

### Can it run Python, React, Vite or Next.js?

Python runs with its standard library only. Node.js frameworks can work, but packages with native binaries need their WebAssembly builds. The agent is told how to set this up for esbuild, rollup, Vite and Next.js.

### Where are my files stored?

In the sandbox's disk, which BrowserPod keeps in your browser's storage. They stay there between visits. Clearing the site's data in your browser deletes them.

### Does it work offline?

No. PiPod needs BrowserPod's runtime and disk images, which load from BrowserPod's servers.

### Is PiPod open source?

PiPod's own code is, under Apache 2.0. Little Coder, Pi, LiteRT-LM and Sipp are open source too. BrowserPod is not open source. It is free to use under its own Community Licence. See [Open source and licences](#open-source-and-licences).

---

Powered by [BrowserPod](https://browserpod.io).
