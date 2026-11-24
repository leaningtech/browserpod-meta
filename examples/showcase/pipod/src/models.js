export const MODELS = {
  "gemma-4-E4B-it": {
    name:"Gemma 4 E4B",
    size:"3.0 GB",
    engine:"litert",
    url:"https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.litertlm",
    toolFormat:"native",
    thinking:true,
    sampling:{ temperature:1.0, p:0.95, k:64 },
  },
  "gemma-4-E2B-it": {
    name:"Gemma 4 E2B",
    size:"2.0 GB",
    engine:"litert",
    url:"https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm",
    toolFormat:"native",
    thinking:true,
    sampling:{ temperature:1.0, p:0.95, k:64 },
  },
  "Qwen2.5-Coder-1.5B-Instruct": {
    name:"Qwen2.5 Coder 1.5B",
    size:"1.1 GB",
    unstable:"Quick to download, but it only holds a short conversation and may fail at tool calls.",
    engine:"litert",
    url:"https://huggingface.co/litert-community/Qwen2.5-Coder-1.5B-Instruct/resolve/main/Qwen2.5-Coder-1.5B-Instruct_int4.litertlm",
    toolFormat:"native",
    // LiteRT build's KV budget
    context:4096,
    maxTokens:1024,
    sampling:{ temperature:0.7, p:0.8, k:20 },
  },
  "Qwen3.5-4B-Q4_K_M": {
    name:"Qwen3.5 4B",
    size:"2.7 GB",
    engine:"sipp",
    url:"https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf",
    toolFormat:"template",
    sampling:{
      temperature:0.7,
      top_p:0.8,
      top_k:20,
      min_p:0,
      presence_penalty:1.5,
      repeat_penalty:1.0,
      repeat_last_n:256,
    },
  },
  "Tiny-Agent-a-0.5B-Q4_K_M": {
    name:"Tiny-Agent 0.5B",
    size:"0.4 GB",
    engine:"sipp",
    url:"https://huggingface.co/driaforall/Tiny-Agent-a-0.5B/resolve/main/dria-agent-a-0.5b.Q4_K_M.gguf",
    toolFormat:"pythonic",
    tools:["bash", "read", "write", "edit"],
    system:[
      "You are a coding agent working in a Linux sandbox.",
      "Your home folder is /home/user. Create each project in its own folder there.",
      "Node.js and npm are installed. Use bash to run shell commands.",
      "Each reply starts in a new shell, so begin commands with cd into the project folder.",
      "Use write to create every source file before you run it.",
      "Run servers in the background with their output sent to a log file.",
    ].join("\n"),
    sampling:{
      temperature:0.3,
      top_p:0.8,
      top_k:20,
      min_p:0,
      repeat_penalty:1.05,
    },
  },
};

// Preselected in the setup modal
export const DEFAULT_MODEL = "gemma-4-E4B-it";
