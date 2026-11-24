import { Endpoint, SippClient } from "@sipphq/sipp";
import { Template } from "@huggingface/jinja";
import { asObject, textOf } from "./bridge.js";
import { buildSystemPrompt, fixNudge, renderCalls, selectTools } from "./pythonic.js";

const CONTEXT_KEY = "little-coder";
const PROMPT_CACHE = true;
const DEBUG = true;

// OpenAI -> template messages
function toTemplateMessages(messages) {
  let system = "";
  const out = [];
  for (const m of messages) {
    if (m.role === "system" || m.role === "developer") {
      system += (system ? "\n\n" : "") + textOf(m.content);
    } else if (m.role === "user") {
      out.push({ role: "user", content: textOf(m.content) });
    } else if (m.role === "assistant") {
      const msg = { role: "assistant", content: textOf(m.content) };
      if (m.tool_calls?.length) {
        msg.tool_calls = m.tool_calls.map((tc) => ({
          type: "function",
          function: { name: tc.function?.name, arguments: asObject(tc.function?.arguments) },
        }));
      }
      out.push(msg);
    } else if (m.role === "tool") {
      out.push({ role: "tool", content: textOf(m.content) });
    }
  }
  if (system) out.unshift({ role: "system", content: system });
  return out;
}

// Tools live in system prompt
export function toPythonicMessages(messages, tools, config) {
  const out = toTemplateMessages(messages).map((m) => {
    if (m.role === "user") return { ...m, content:fixNudge(m.content) };
    if (!m.tool_calls) return m;
    const calls = m.tool_calls.map((tc) => tc.function);
    const code = renderCalls(calls);
    return { role:"assistant", content:m.content ? `${m.content}\n\n${code}` : code };
  });
  const original = out[0]?.role === "system" ? out.shift().content : "";
  const system = config.system ?? original;
  const prompt = buildSystemPrompt(system, selectTools(tools, config.tools));
  if (prompt) out.unshift({ role:"system", content:prompt });
  return out;
}

function progressText(p) {
  const pct = p.percent != null ? ` ${Math.round(p.percent)}%` : "";
  return `${p.phase}${pct}`;
}

async function waitForTemplate(client) {
  for (let i = 0; i < 50; i++) {
    const source = client.state().model?.chatTemplate;
    if (source) return source;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("The loaded model has no chat template");
}

export async function createEngine({ model:config, context, onStatus }) {
  if (!navigator.gpu) throw new Error("WebGPU is not available in this browser");

  const client = new SippClient();
  const pythonic = config.toolFormat === "pythonic";
  const model = await client.models.add([config.url], {
    onProgress:(p) => onStatus?.(`Fetching model: ${progressText(p)}`),
  });
  await client.add("default", Endpoint.local(model, {
    backend:"webgpu",
    onProgress:(p) => onStatus?.(`Loading model: ${progressText(p)}`),
    runtime:{
      context:{ n_ctx:context },
      cache:{ mode:PROMPT_CACHE ? "live_slot_prefix" : "disabled" },
    },
  }));
  const template = new Template(await waitForTemplate(client));

  async function generate(body, { onText, signal }) {
    const prompt = template.render({
      messages:pythonic
        ? toPythonicMessages(body.messages || [], body.tools, config)
        : toTemplateMessages(body.messages || []),
      tools:!pythonic && body.tools?.length ? body.tools : undefined,
      add_generation_prompt:true,
      enable_thinking:!!body.reasoning_effort,
      bos_token:"",
      eos_token:"<|im_end|>",
    });

    if (signal?.aborted) throw new Error("Request cancelled");
    const run = client.query(prompt, {
      emitTokens:true,
      contextKey:CONTEXT_KEY,
      maxTokens:body.max_completion_tokens ?? body.max_tokens ?? 4096,
      stop:["<|im_end|>"],
      sampling:config.sampling,
      signal,
    });
    const cancel = () => run.cancel(new Error("Request cancelled"));
    signal?.addEventListener("abort", cancel, { once:true });

    let raw = "";
    let res;
    try {
      for await (const batch of run.tokens) {
        if (!batch.text) continue;
        raw += batch.text;
        onText(batch.text);
      }
      res = await run.response;
    } finally {
      signal?.removeEventListener("abort", cancel);
      if (DEBUG) {
        console.groupCollapsed(`[sipp] ${res?.finishReason ?? "cancelled"}, ${raw.length} chars`);
        console.log("prompt tail:\n" + prompt.slice(-800));
        console.log("raw output:\n" + raw);
        console.log("stats", res?.stats);
        console.groupEnd();
      }
    }
    const stats = res.stats || {};
    return {
      finishReason:res.finishReason,
      usage:{
        prompt_tokens:stats.inputTokens ?? 0,
        completion_tokens:stats.outputTokens ?? 0,
        total_tokens:(stats.inputTokens ?? 0) + (stats.outputTokens ?? 0),
      },
    };
  }

  return { generate, toolFormat:config.toolFormat };
}
