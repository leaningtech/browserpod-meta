const SYSTEM_PROMPT = `You are an expert AI assistant that specializes in providing Python code to solve the task/problem at hand provided by the user.

You can use Python code freely, including the following available functions:

<|functions_schema|>
{{functions_schema}}
<|end_functions_schema|>

The following dangerous builtins are restricted for security:
- exec
- eval
- execfile
- compile
- importlib
- input
- exit

Think step by step and provide your reasoning, outside of function calls.
You can write Python code and use the available functions. Provide all your Python code in a SINGLE markdown code block.

DO NOT use print() statements AT ALL. Avoid mutating variables whenever possible.

Each function's result is returned to you in the next message. Do not use one function's result as an argument to another function in the same code block: call the first function, wait for its result, then continue. Only direct calls to the available functions with literal values are run.

Always call functions in a \`\`\`python code block, and never write JSON. Do one step in each reply, then end your reply straight after the code block and wait for the result. Example of a correct reply:

I will create the file first.

\`\`\`python
write({{write_path}}="/home/user/my-project/notes.txt", content="first line\\n")
\`\`\``;

const NUDGE = "Your previous response embedded tool calls";
const NUDGE_FIX = "Your previous response did not call a function correctly. Call the function directly in a \`\`\`python code block.";

// Swap the native call nudge
export function fixNudge(text) {
  return text.startsWith(NUDGE) ? NUDGE_FIX : text;
}

export function selectTools(tools, names) {
  if (!names) return tools;
  return (tools ?? []).filter((t) => names.includes(fnOf(t).name?.toLowerCase()));
}

const PY_TYPES = {
  string: "str",
  number: "float",
  integer: "int",
  boolean: "bool",
  array: "list",
  object: "dict",
};

function fnOf(tool) {
  return tool?.function ?? tool;
}

// Required params come first
function paramNames(parameters) {
  const props = Object.keys(parameters?.properties ?? {});
  const required = (parameters?.required ?? []).filter((p) => props.includes(p));
  return [...required, ...props.filter((p) => !required.includes(p))];
}

function pyType(schema) {
  if (!schema) return "Any";
  if (schema.enum) return "str";
  const options = schema.anyOf ?? schema.oneOf;
  if (options) return pyType(options.find((o) => o.type !== "null"));
  const type = [].concat(schema.type ?? []).find((t) => t !== "null");
  return PY_TYPES[type] ?? "Any";
}

function signature(tool) {
  const { name, description, parameters } = fnOf(tool);
  const required = parameters?.required ?? [];
  const names = paramNames(parameters);
  const props = parameters?.properties ?? {};
  const args = names.map((p) => {
    const typed = `${p}: ${pyType(props[p])}`;
    return required.includes(p) ? typed : `${typed} = None`;
  });
  const clean = (text) => String(text ?? "").replace(/"""/g, "'''").replace(/\n/g, "\n    ");
  const lines = [`def ${name}(${args.join(", ")}) -> Any:`, '    """'];
  if (description) lines.push(`    ${clean(description)}`, "");
  for (const p of names) {
    if (props[p]?.description) lines.push(`    :param ${p}: ${clean(props[p].description)}`);
  }
  lines.push('    """', "    pass");
  return lines.join("\n");
}

export function buildSystemPrompt(system, tools) {
  if (!tools?.length) return system;
  const schema = tools.map(signature).join("\n\n");
  const write = tools.map(fnOf).find((t) => t.name === "write");
  const writePath = write ? paramNames(write.parameters)[0] : "path";
  const prompt = SYSTEM_PROMPT
    .replace("{{functions_schema}}", () => schema)
    .replace("{{write_path}}", () => writePath);
  return system ? `${system}\n\n${prompt}` : prompt;
}

function pyValue(value) {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (Array.isArray(value)) return `[${value.map(pyValue).join(", ")}]`;
  if (typeof value === "object") {
    const items = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${pyValue(v)}`);
    return `{${items.join(", ")}}`;
  }
  return JSON.stringify(value);
}

// Past calls for the prompt
export function renderCalls(calls) {
  const lines = calls.map(({ name, arguments: args }) => {
    const parts = Object.entries(args ?? {}).map(([k, v]) => `${k}=${pyValue(v)}`);
    return `${name}(${parts.join(", ")})`;
  });
  return "```python\n" + lines.join("\n") + "\n```";
}

class Unmappable extends Error {}
const RESULT = Symbol("result");
const ESCAPES = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", a: "\x07", 0: "\0", "\\": "\\", "'": "'", '"': '"' };

class CallParser {
  constructor(src, tools) {
    this.s = src;
    this.i = 0;
    this.depth = 0;
    this.vars = new Map();
    this.calls = [];
    this.tools = new Map(tools.map((t) => [fnOf(t).name, paramNames(fnOf(t).parameters)]));
  }

  fail() {
    throw new Unmappable();
  }

  match(re) {
    re.lastIndex = this.i;
    const m = re.exec(this.s);
    if (m) this.i = re.lastIndex;
    return m;
  }

  skip() {
    this.match(this.depth > 0 ? /(?:\s|#[^\n]*)*/y : /(?:[ \t]|\\\n)*/y);
  }

  program() {
    for (;;) {
      this.match(/(?:\s|;|#[^\n]*)*/y);
      if (this.i >= this.s.length) return this.calls;
      this.statement();
      this.match(/[ \t]*(?:#[^\n]*)?/y);
      if (this.i < this.s.length && !/[\n;]/.test(this.s[this.i])) this.fail();
    }
  }

  statement() {
    if (this.match(/(?:import|from)[ \t][^\n]*/y)) return;
    const start = this.i;
    const target = this.match(/[A-Za-z_]\w*/y);
    if (target && !/["']/.test(this.s[this.i] ?? "")) {
      this.skip();
      if (this.s[this.i] === "=" && this.s[this.i + 1] !== "=") {
        this.i++;
        this.vars.set(target[0], this.value());
        return;
      }
      if (this.s[this.i] === "(") {
        this.i++;
        this.call(target[0]);
        return;
      }
      this.fail();
    }
    this.i = start;
    if (this.value() === RESULT) this.fail();
  }

  value() {
    this.skip();
    const c = this.s[this.i];
    if (c === "[" || c === "(") return this.sequence(c === "[" ? "]" : ")");
    if (c === "{") return this.dict();
    if (this.isStringStart()) return this.strings();
    const num = this.match(/-?(?:\d[\d_]*(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y);
    if (num) return Number(num[0].replace(/_/g, ""));
    const word = this.match(/[A-Za-z_]\w*/y);
    if (!word) this.fail();
    if (word[0] === "True") return true;
    if (word[0] === "False") return false;
    if (word[0] === "None") return null;
    this.skip();
    if (this.s[this.i] === "(") {
      if (this.depth > 0) this.fail();
      this.i++;
      return this.call(word[0]);
    }
    if (!this.vars.has(word[0]) || this.vars.get(word[0]) === RESULT) this.fail();
    return this.vars.get(word[0]);
  }

  nested() {
    const v = this.value();
    if (v === RESULT) this.fail();
    return v;
  }

  // Close bracket or comma
  listEnd(close) {
    this.skip();
    if (this.s[this.i] === ",") {
      this.i++;
      this.skip();
    } else if (this.s[this.i] !== close) {
      this.fail();
    }
    return this.s[this.i] === close;
  }

  sequence(close) {
    this.i++;
    this.depth++;
    const out = [];
    this.skip();
    if (this.s[this.i] !== close) {
      do out.push(this.nested());
      while (!this.listEnd(close));
    }
    this.i++;
    this.depth--;
    return out;
  }

  dict() {
    this.i++;
    this.depth++;
    const out = {};
    this.skip();
    if (this.s[this.i] !== "}") {
      do {
        const key = this.nested();
        this.skip();
        if (this.s[this.i] !== ":") this.fail();
        this.i++;
        out[key] = this.nested();
      } while (!this.listEnd("}"));
    }
    this.i++;
    this.depth--;
    return out;
  }

  call(name) {
    const params = this.tools.get(name);
    if (!params) this.fail();
    this.depth++;
    const args = {};
    let position = 0;
    let keywords = false;
    this.skip();
    if (this.s[this.i] !== ")") {
      do {
        this.skip();
        const kw = this.match(/([A-Za-z_]\w*)\s*=(?!=)/y);
        if (kw) {
          keywords = true;
          args[kw[1]] = this.nested();
        } else {
          if (keywords || position >= params.length) this.fail();
          args[params[position++]] = this.nested();
        }
      } while (!this.listEnd(")"));
    }
    this.i++;
    this.depth--;
    this.calls.push({ name, arguments: args });
    return RESULT;
  }

  isStringStart() {
    return /^[rRuUbBfF]{0,2}["']/.test(this.s.slice(this.i, this.i + 3));
  }

  strings() {
    let out = this.string();
    for (;;) {
      const mark = this.i;
      this.skip();
      if (!this.isStringStart()) {
        this.i = mark;
        return out;
      }
      out += this.string();
    }
  }

  string() {
    const open = this.match(/([rRuUbBfF]{0,2})("""|'''|"|')/y);
    const raw = /r/i.test(open[1]);
    const format = /f/i.test(open[1]);
    const quote = open[2];
    let out = "";
    for (;;) {
      if (this.i >= this.s.length) this.fail();
      if (this.s.startsWith(quote, this.i)) {
        this.i += quote.length;
        return out;
      }
      const c = this.s[this.i];
      if (c === "\n" && quote.length === 1) this.fail();
      if (format && c === "{") this.fail();
      if (c !== "\\") {
        out += c;
        this.i++;
      } else if (raw) {
        out += this.s.slice(this.i, this.i + 2);
        this.i += 2;
      } else {
        out += this.escape();
      }
    }
  }

  escape() {
    const next = this.s[this.i + 1];
    this.i += 2;
    if (next === "\n") return "";
    if (next in ESCAPES) return ESCAPES[next];
    const size = { x: 2, u: 4, U: 8 }[next];
    if (size) {
      const hex = this.s.slice(this.i, this.i + size);
      if (hex.length !== size || !/^[0-9a-fA-F]+$/.test(hex)) this.fail();
      this.i += size;
      return String.fromCodePoint(parseInt(hex, 16));
    }
    return `\\${next ?? ""}`;
  }
}

const isShell = (call) => call.name === "bash" && typeof call.arguments?.command === "string";

// Pi runs calls in parallel
export function firstStep(calls) {
  const shell = isShell(calls[0]);
  let end = 1;
  while (end < calls.length && isShell(calls[end]) === shell) end++;
  const group = calls.slice(0, end);
  if (!shell || group.length === 1) return group;
  const args = { command:["set -e", ...group.map((c) => c.arguments.command)].join("\n") };
  const timeouts = group.map((c) => c.arguments.timeout).filter(Number.isFinite);
  if (timeouts.length === group.length) args.timeout = timeouts.reduce((a, b) => a + b);
  return [{ name:"bash", arguments:args }];
}

// Null means keep it as text
export function parseCalls(code, tools) {
  try {
    const calls = new CallParser(code, tools ?? []).program();
    return calls.length ? calls : null;
  } catch (err) {
    if (err instanceof Unmappable || err instanceof RangeError) return null;
    throw err;
  }
}
