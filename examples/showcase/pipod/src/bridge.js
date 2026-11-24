import { firstStep, parseCalls } from "./pythonic.js";

const TAGS = ["<think>", "</think>", "<tool_call>", "</tool_call>"];
const PY_OPEN = "\x60\x60\x60python";
const PY_CLOSE = "\x60\x60\x60";

export function parseArgs(raw) {
  if (typeof raw !== "string") return raw ?? {};
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function asObject(args) {
  const parsed = parseArgs(args);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { input: parsed };
}

export function textOf(content) {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p?.type === "text" ? p.text : p?.type === "image_url" ? "[image omitted]" : ""))
      .filter(Boolean)
      .join("\n");
  }
  return String(content);
}

function toolSchemas(tools) {
  const map = {};
  for (const t of tools || []) {
    const fn = t?.function ?? t;
    if (fn?.name) map[fn.name] = fn.parameters?.properties ?? {};
  }
  return map;
}

function paramValue(raw, schema) {
  const types = [].concat(schema?.type ?? []);
  if (types.length === 1 && types[0] === "string") return raw;
  return parseArgs(raw);
}

function parseToolCall(raw, schemas) {
  const text = raw.trim();
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj.name === "string") {
      return { name: obj.name, arguments: parseArgs(obj.arguments ?? obj.parameters ?? {}) };
    }
  } catch {}
  const fn = text.match(/<function=([^>\s]+)>([\s\S]*?)(?:<\/function>|$)/);
  if (fn) {
    const props = schemas[fn[1]] ?? {};
    const args = {};
    const re = /<parameter=([^>\s]+)>\n?([\s\S]*?)\n?<\/parameter>/g;
    let p;
    while ((p = re.exec(fn[2]))) args[p[1]] = paramValue(p[2], props[p[1]]);
    return { name: fn[1], arguments: args };
  }
  return null;
}

// Splits model output
export class OutputParser {
  constructor(onEvent, tools, { pythonic = false } = {}) {
    this.onEvent = onEvent;
    this.tools = tools;
    this.schemas = toolSchemas(tools);
    this.pythonic = pythonic;
    this.tags = pythonic ? [...TAGS, PY_OPEN, PY_CLOSE] : TAGS;
    this.mode = "content";
    this.buf = "";
    this.tool = "";
    this.code = "";
    this.pendingWs = "";
    this.started = false;
    this.ended = false;
  }

  emitContent(text) {
    if (!text) return;
    if (!text.trim()) {
      this.pendingWs += text;
      return;
    }
    const out = this.started ? this.pendingWs + text : text.replace(/^\s+/, "");
    this.pendingWs = "";
    this.started = true;
    this.onEvent({ type: "content", text: out });
  }

  emit(text) {
    if (!text) return;
    if (this.mode === "content") this.emitContent(text);
    else if (this.mode === "think") this.onEvent({ type: "reasoning", text });
    else if (this.mode === "python") this.code += text;
    else this.tool += text;
  }

  closeTool() {
    const call = parseToolCall(this.tool, this.schemas);
    if (call) this.onEvent({ type: "tool", ...call });
    else this.emitContent(`<tool_call>${this.tool}</tool_call>`);
    this.tool = "";
  }

  // Run it, or show it as text
  closePython(closed) {
    const code = this.code;
    this.code = "";
    const calls = closed ? parseCalls(code, this.tools) : null;
    if (calls) {
      for (const call of firstStep(calls)) this.onEvent({ type: "tool", ...call });
      this.ended = true;
    } else {
      this.emitContent(PY_OPEN + code + (closed ? PY_CLOSE : ""));
    }
  }

  wantedTags() {
    if (this.mode === "think") return ["</think>"];
    if (this.mode === "tool") return ["</tool_call>"];
    if (this.mode === "python") return [PY_CLOSE];
    return this.pythonic ? ["<think>", "<tool_call>", PY_OPEN] : ["<think>", "<tool_call>"];
  }

  nextTag() {
    const wanted = this.wantedTags();
    let best = null;
    for (const tag of wanted) {
      const i = this.buf.indexOf(tag);
      if (i >= 0 && (best === null || i < best.i)) best = { i, tag };
    }
    return best;
  }

  feed(chunk) {
    if (this.ended) return;
    this.buf += chunk;
    for (;;) {
      const hit = this.nextTag();
      if (!hit) break;
      this.emit(this.buf.slice(0, hit.i));
      this.buf = this.buf.slice(hit.i + hit.tag.length);
      if (hit.tag === "<think>") this.mode = "think";
      else if (hit.tag === "</think>") this.mode = "content";
      else if (hit.tag === "<tool_call>") this.mode = "tool";
      else if (hit.tag === PY_OPEN) this.mode = "python";
      else if (hit.tag === PY_CLOSE) {
        this.mode = "content";
        this.closePython(true);
        if (this.ended) {
          this.buf = "";
          return;
        }
      } else {
        this.closeTool();
        this.mode = "content";
      }
    }
    let keep = 0;
    for (const tag of this.tags) {
      for (let n = Math.min(tag.length - 1, this.buf.length); n > keep; n--) {
        if (this.buf.endsWith(tag.slice(0, n))) {
          keep = n;
          break;
        }
      }
    }
    this.emit(this.buf.slice(0, this.buf.length - keep));
    this.buf = this.buf.slice(this.buf.length - keep);
  }

  finish() {
    this.emit(this.buf);
    this.buf = "";
    const mode = this.mode;
    this.mode = "content";
    if (mode === "tool") this.closeTool();
    if (mode === "python") this.closePython(false);
  }
}

async function readText(pod, path) {
  let file;
  try {
    file = await pod.openFile(path, "utf-8");
  } catch {
    return null;
  }
  try {
    const size = await file.getSize();
    return size > 0 ? await file.read(size) : "";
  } finally {
    await file.close();
  }
}

async function writeText(pod, path, text) {
  const file = await pod.createFile(path, "utf-8");
  await file.write(text);
  await file.close();
}

async function readRequest(pod, dir) {
  const text = await readText(pod, `${dir}/request.json`);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

class Sender {
  constructor(pod, dir, id) {
    this.pod = pod;
    this.dir = dir;
    this.id = id;
    this.seq = 0;
    this.queue = [];
    this.inflight = null;
    this.timer = null;
    this.aborted = false;
  }

  push(ev) {
    this.queue.push(ev);
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, 60);
    }
  }

  async write(body) {
    const path = `${this.dir}/res-${this.id}-${this.seq++}.json`;
    await writeText(this.pod, path, body);
    const req = await readRequest(this.pod, this.dir);
    if (req?.id !== this.id) {
      this.aborted = true;
      this.current = req?.id ?? "missing";
    }
  }

  async flush(extra) {
    while (this.inflight) await this.inflight;
    const events = this.queue.splice(0);
    if (!events.length && !extra) return;
    const body = JSON.stringify({ events, ...extra });
    this.inflight = this.write(body)
      .catch((err) => console.warn("[bridge] write failed", err))
      .finally(() => {
        this.inflight = null;
      });
    await this.inflight;
  }

  async finish(extra) {
    clearTimeout(this.timer);
    this.timer = null;
    await this.flush({ done: true, ...extra });
  }
}

async function handleJob(engine, modelId, pod, dir, job) {
  const sender = new Sender(pod, dir, job.id);
  const stream = !!job.body.stream;
  const created = Math.floor(Date.now() / 1000);
  const head = { id: `chatcmpl-${job.id}`, object: "chat.completion.chunk", created, model: modelId };
  const chunk = (delta, finish = null) => ({
    ...head,
    choices: [{ index: 0, delta, finish_reason: finish }],
  });

  let content = "";
  let reasoning = "";
  const toolCalls = [];
  let usage = null;
  let finish = "stop";

  const abort = new AbortController();
  const parser = new OutputParser((ev) => {
    if (ev.type === "content") {
      content += ev.text;
      if (stream) sender.push(chunk({ content: ev.text }));
    } else if (ev.type === "reasoning") {
      reasoning += ev.text;
      if (stream) sender.push(chunk({ reasoning_content: ev.text }));
    } else if (ev.type === "tool") {
      const call = {
        index: toolCalls.length,
        id: `call_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
        type: "function",
        function: { name: ev.name, arguments: JSON.stringify(ev.arguments ?? {}) },
      };
      toolCalls.push(call);
      if (stream) sender.push(chunk({ tool_calls: [call] }));
    }
  }, job.body.tools, { pythonic: engine.toolFormat === "pythonic" });

  const stop = (reason) => {
    sender.aborted = true;
    if (abort.signal.aborted) return;
    console.log(`[bridge] stopped generating: ${reason}`);
    abort.abort();
  };
  let checking = false;
  const watcher = setInterval(async () => {
    if (checking || abort.signal.aborted) return;
    checking = true;
    try {
      const req = await readRequest(pod, dir);
      if (req?.id !== job.id) stop(`request is now ${req?.id ?? "missing"}`);
    } catch {}
    checking = false;
  }, 250);

  try {
    if (stream) sender.push(chunk({ role: "assistant", content: "" }));
    try {
      const result = await engine.generate(job.body, {
        signal: abort.signal,
        onText: (text) => {
          parser.feed(text);
          if (parser.ended) stop("tool call complete");
          else if (sender.aborted) stop(`request is now ${sender.current ?? "missing"}`);
        },
      });
      finish = result.finishReason;
      usage = result.usage;
    } catch (err) {
      if (!abort.signal.aborted) throw err;
    } finally {
      clearInterval(watcher);
    }
    parser.finish();
    if (toolCalls.length) finish = "tool_calls";
    else if (finish !== "length") finish = "stop";

    const usageOut = usage;
    if (stream) {
      sender.push(chunk({}, finish));
      if (usageOut) sender.push({ ...head, choices: [], usage: usageOut });
      await sender.finish();
    } else {
      const message = { role: "assistant", content: content || null };
      if (reasoning) message.reasoning_content = reasoning;
      if (toolCalls.length) message.tool_calls = toolCalls.map(({ index, ...tc }) => tc);
      await sender.finish({
        final: {
          id: head.id,
          object: "chat.completion",
          created,
          model: modelId,
          choices: [{ index: 0, message, finish_reason: finish }],
          usage: usageOut,
        },
      });
    }
  } catch (err) {
    console.error("[bridge] generation failed", err);
    await sender.finish({ error: String(err?.message || err) });
  }
}

export async function runBridge({ engine, modelId, pod, dir, onStatus }) {
  let lastId = null;
  onStatus?.("ready");
  for (;;) {
    let job = null;
    try {
      job = await readRequest(pod, dir);
    } catch (err) {
      console.warn("[bridge] poll failed", err);
    }
    if (!job?.id || !job.body || job.id === lastId) {
      await new Promise((res) => setTimeout(res, 200));
      continue;
    }
    lastId = job.id;
    onStatus?.("generating");
    await handleJob(engine, modelId, pod, dir, job);
    onStatus?.("ready");
  }
}
