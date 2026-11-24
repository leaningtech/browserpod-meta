import { Engine, SamplerType } from "@litert-lm/core";
import { asObject, textOf } from "./bridge.js";

const CACHE_NAME = "litert-models";

// OpenAI -> LiteRT messages
export function toLiteRtMessages(messages) {
  const names = new Map();
  const out = [];
  for (const m of messages) {
    if (m.role === "system" || m.role === "developer" || m.role === "user") {
      out.push({ role: m.role === "user" ? "user" : "system", content: textOf(m.content) });
    } else if (m.role === "assistant") {
      const msg = { role: "assistant", content: textOf(m.content) };
      if (m.tool_calls?.length) {
        msg.tool_calls = m.tool_calls.map((tc) => {
          names.set(tc.id, tc.function?.name);
          return { type: "function", function: { name: tc.function?.name, arguments: asObject(tc.function?.arguments) } };
        });
      }
      out.push(msg);
    } else if (m.role === "tool") {
      const part = { type: "tool_response", name: m.name ?? names.get(m.tool_call_id), response: textOf(m.content) };
      const prev = out.at(-1);
      if (prev?.role === "tool") prev.content.push(part);
      else out.push({ role: "tool", content: [part] });
    }
  }
  const last = out.pop() ?? { role: "user", content: "" };
  return { preface: out, last };
}

// LiteRT chunk -> bridge text
export function chunkText(chunk) {
  let text = "";
  const thought = chunk.channels?.thought;
  if (thought) text += `<think>${thought}</think>`;
  const parts = typeof chunk.content === "string" ? [{ type: "text", text: chunk.content }] : chunk.content ?? [];
  for (const part of parts) if (part.type === "text" && part.text) text += part.text;
  for (const tc of chunk.tool_calls ?? []) {
    text += `<tool_call>${JSON.stringify({ name: tc.function.name, arguments: tc.function.arguments })}</tool_call>`;
  }
  return text;
}

// Leading messages left unchanged
export function sharedPrefix(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && JSON.stringify(a[n]) === JSON.stringify(b[n])) n++;
  return n;
}

// No built-in model cache
async function loadModel(url, onStatus) {
  const cache = await caches.open(CACHE_NAME);
  let res = await cache.match(url);
  if (!res) {
    const net = await fetch(url);
    if (!net.ok) throw new Error(`Model download failed with status ${net.status}`);
    const total = Number(net.headers.get("content-length")) || 0;
    let loaded = 0;
    let shown = -1;
    const counted = net.body.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        loaded += chunk.byteLength;
        const pct = total ? Math.floor((loaded * 100) / total) : -1;
        if (pct !== shown) onStatus?.(`Downloading model ${(shown = pct)}%`);
        controller.enqueue(chunk);
      },
    }));
    await cache.put(url, new Response(counted, { headers: net.headers }));
    res = await cache.match(url);
  }
  return res.blob();
}

export async function createEngine({ model:config, context, onStatus }) {
  if (!navigator.gpu) throw new Error("WebGPU is not available in this browser");

  onStatus?.("Checking model cache");
  const blob = await loadModel(config.url, onStatus);
  onStatus?.("Loading model");
  const engine = await Engine.create({ model:blob, mainExecutorSettings:{ maxNumTokens:context } });

  let previous = [];

  async function generate(body, { onText, signal }) {
    const messages = body.messages || [];
    const kept = sharedPrefix(previous, messages);
    const reusable = previous.length > 0 && kept === previous.length;
    previous = messages;
    const t0 = performance.now();
    let tFirst = 0;

    const { preface, last } = toLiteRtMessages(messages);
    const conversation = await engine.createConversation({
      preface:{
        messages:preface,
        tools:body.tools?.length ? body.tools : undefined,
        extra_context:{ enable_thinking:!!body.reasoning_effort },
      },
      // Tool calls must fit schemas
      enableConstrainedDecoding:true,
      sessionConfig:{
        maxOutputTokens:body.max_completion_tokens ?? body.max_tokens ?? 4096,
        samplerParams:{ type:SamplerType.TOP_P, ...config.sampling },
      },
    });
    const tCreated = performance.now();
    const cancel = () => conversation.cancel();
    signal?.addEventListener("abort", cancel, { once:true });
    try {
      for await (const chunk of conversation.sendMessageStreaming(last)) {
        if (signal?.aborted) break;
        tFirst ||= performance.now();
        const text = chunkText(chunk);
        if (text) onText(text);
      }
      if (signal?.aborted) throw new Error("Request cancelled");
      const tokens = await conversation.getTokenCount();
      const ms = (t) => `${Math.round(t)}ms`;
      console.log(
        `[litert] ${tokens} tokens, ${messages.length} messages (${kept} unchanged, reusable: ${reusable}), ` +
        `setup ${ms(tCreated - t0)}, prefill ${ms((tFirst || tCreated) - tCreated)}, total ${ms(performance.now() - t0)}`
      );
      return {
        finishReason:"stop",
        usage:{ prompt_tokens:tokens, completion_tokens:0, total_tokens:tokens },
      };
    } finally {
      signal?.removeEventListener("abort", cancel);
      await conversation.delete();
    }
  }

  return { generate, toolFormat:config.toolFormat };
}
