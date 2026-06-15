import { fetchOpenRouterMeta, requestOpenRouterChat } from "../openrouter.ts";
import { bootPod, writeTextFile } from "./browserpod-runtime";
import { renderMarkdownToHtml } from "./services/markdown-renderer.js";

export const DEFAULT_SYSTEM_PROMPT =
  "You are a practical coding assistant focused on Vim workflows and Node.js project execution.";
const CHAT_HISTORY_DIRECTORY = "/vimamp/.bp/chats";
const CHAT_HISTORY_MAX_MESSAGES = 120;
const CHAT_HISTORY_MAX_CHARS = 100000;

const ui = {
  settingsDetails: document.querySelector("#settingsDetails"),
  systemPromptInput: document.querySelector("#systemPromptInput"),
  temperatureInput: document.querySelector("#temperatureInput"),
  newChatBtn: document.querySelector("#newChatBtn"),
  metaStatus: document.querySelector("#metaStatus"),
  chatTranscript: document.querySelector("#chatTranscript"),
  chatForm: document.querySelector("#chatForm"),
  promptInput: document.querySelector("#promptInput"),
  sendBtn: document.querySelector("#sendBtn"),
  chatStatus: document.querySelector("#chatStatus"),
};

const state = {
  pending: false,
  hasKey: false,
  model: "",
  pod: null,
  terminal: null,
  podReady: false,
  chatId: "",
  chatCreatedAt: "",
  persistQueue: Promise.resolve(),
  messages: /** @type {Array<{ role: "user" | "assistant" | "system"; content: string }>} */ ([]),
};

function createChatId() {
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .replace("Z", "");
  const randomSuffix = Math.random().toString(36).slice(2, 9);
  return `chat-${stamp}-${randomSuffix}`;
}

function getChatFilePath(chatId) {
  return `${CHAT_HISTORY_DIRECTORY}/${String(chatId || "chat")}.json`;
}

function truncateMessages(messages = []) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const limitedByCount = safeMessages.slice(-CHAT_HISTORY_MAX_MESSAGES);
  const kept = [];
  let runningChars = 0;

  for (let index = limitedByCount.length - 1; index >= 0; index -= 1) {
    const message = limitedByCount[index];
    const content = String(message?.content || "");
    const projectedChars = runningChars + content.length;
    if (kept.length > 0 && projectedChars > CHAT_HISTORY_MAX_CHARS) {
      break;
    }
    runningChars = projectedChars;
    kept.push({
      role: message?.role === "assistant" || message?.role === "system" ? message.role : "user",
      content,
    });
  }

  return kept.reverse();
}

function setMetaStatus(message) {
  if (!ui.metaStatus) {
    return;
  }
  ui.metaStatus.textContent = message;
}

function setChatStatus(message, tone = "") {
  if (!ui.chatStatus) {
    return;
  }

  ui.chatStatus.textContent = message;
  if (!tone) {
    ui.chatStatus.removeAttribute("data-tone");
    return;
  }
  ui.chatStatus.setAttribute("data-tone", tone);
}

function setPending(isPending) {
  state.pending = Boolean(isPending);

  if (ui.sendBtn) {
    ui.sendBtn.disabled = state.pending || !state.hasKey;
    ui.sendBtn.textContent = state.pending ? "Thinking..." : "Send";
  }

  if (ui.newChatBtn) {
    ui.newChatBtn.disabled = state.pending;
  }

  if (ui.promptInput) {
    ui.promptInput.disabled = state.pending || !state.hasKey;
  }

  if (state.pending && ui.settingsDetails?.open) {
    ui.settingsDetails.open = false;
  }
}

function renderTranscript() {
  if (!ui.chatTranscript) {
    return;
  }

  ui.chatTranscript.innerHTML = "";

  if (state.messages.length === 0) {
    const empty = document.createElement("p");
    empty.className = "chat-empty";
    empty.textContent =
      "Start a conversation. Ask for help with Vim motions, commands, plugins, or Node project setup.";
    ui.chatTranscript.append(empty);
    return;
  }

  for (const message of state.messages) {
    const card = document.createElement("article");
    card.className = `chat-message ${message.role}`;

    const role = document.createElement("p");
    role.className = "chat-message-role";
    role.textContent = message.role;
    card.append(role);

    const body = document.createElement("div");
    body.className = "chat-message-content";
    if (message.role === "assistant") {
      body.innerHTML = renderMarkdownToHtml(message.content);
    } else {
      const plain = document.createElement("p");
      plain.textContent = message.content;
      body.append(plain);
    }

    card.append(body);
    ui.chatTranscript.append(card);
  }

  ui.chatTranscript.scrollTop = ui.chatTranscript.scrollHeight;
}

async function bootChatStorage() {
  if (state.podReady) {
    return true;
  }

  const apiKey = String(import.meta.env?.VITE_BP_APIKEY || "").trim();
  if (!apiKey || !window.crossOriginIsolated) {
    return false;
  }

  try {
    const host = document.createElement("div");
    host.hidden = true;
    host.setAttribute("aria-hidden", "true");
    document.body.append(host);
    const { pod, terminal } = await bootPod({
      apiKey,
      terminalElement: host,
    });
    state.pod = pod;
    state.terminal = terminal;
    state.podReady = true;
    return true;
  } catch (error) {
    console.warn("Ask AI chat storage boot failed", error);
    return false;
  }
}

async function persistChatNow() {
  if (!state.podReady || !state.pod || !state.terminal) {
    return;
  }

  const payload = {
    schemaVersion: 1,
    chatId: state.chatId,
    createdAt: state.chatCreatedAt,
    updatedAt: new Date().toISOString(),
    model: state.model || "",
    systemPrompt: String(ui.systemPromptInput?.value || "").trim(),
    temperature: Number.parseFloat(String(ui.temperatureInput?.value || "0.7")),
    messageCount: state.messages.length,
    messages: truncateMessages(state.messages),
  };

  await state.pod.createDirectory(CHAT_HISTORY_DIRECTORY, { recursive: true });
  await writeTextFile({
    pod: state.pod,
    terminal: state.terminal,
    fullPath: getChatFilePath(state.chatId),
    text: `${JSON.stringify(payload, null, 2)}\n`,
  });
}

function queueChatPersist() {
  state.persistQueue = state.persistQueue
    .then(() => persistChatNow())
    .catch((error) => {
      console.warn("Ask AI chat persist failed", error);
    });
  return state.persistQueue;
}

function resetChatSession() {
  state.chatId = createChatId();
  state.chatCreatedAt = new Date().toISOString();
  state.messages = [];
}

function pushMessage(role, content) {
  const text = String(content || "").trim();
  if (!text) {
    return;
  }

  state.messages.push({ role, content: text });
  state.messages = truncateMessages(state.messages);
  renderTranscript();
  void queueChatPersist();
}

function clearChat() {
  resetChatSession();
  renderTranscript();
  setChatStatus("Enter to send. Shift+Enter for newline.");
  void queueChatPersist();
}

function buildRequestMessages(userPrompt) {
  const messages = [];
  const systemPrompt = String(ui.systemPromptInput?.value || "").trim();

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  for (const message of state.messages) {
    if (message.role === "user" || message.role === "assistant") {
      messages.push({ role: message.role, content: message.content });
    }
  }

  messages.push({ role: "user", content: userPrompt });
  return messages;
}

async function sendPrompt() {
  if (!ui.promptInput || state.pending || !state.hasKey) {
    return;
  }

  const userPrompt = String(ui.promptInput.value || "").trim();
  if (!userPrompt) {
    setChatStatus("Type a message first.", "error");
    return;
  }

  pushMessage("user", userPrompt);
  ui.promptInput.value = "";
  setPending(true);
  setChatStatus("Thinking...");

  try {
    const tempValue = Number.parseFloat(String(ui.temperatureInput?.value || "0.7"));
    const temperature = Number.isFinite(tempValue) ? tempValue : undefined;

    const response = await requestOpenRouterChat({
      model: state.model || undefined,
      temperature,
      messages: buildRequestMessages(userPrompt),
    });

    pushMessage("assistant", response.content);
    setChatStatus("Enter to send. Shift+Enter for newline.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    pushMessage("system", `Error: ${message}`);
    setChatStatus(message, "error");
  } finally {
    setPending(false);
    ui.promptInput?.focus();
  }
}

async function boot() {
  resetChatSession();
  renderTranscript();
  setPending(true);
  setMetaStatus("Loading AI service...");

  if (ui.systemPromptInput && !ui.systemPromptInput.value.trim()) {
    ui.systemPromptInput.value = DEFAULT_SYSTEM_PROMPT;
  }

  try {
    await bootChatStorage();

    const meta = await fetchOpenRouterMeta();
    state.hasKey = Boolean(meta?.hasKey);
    state.model = String(meta?.model || "");

    if (!state.hasKey) {
      setMetaStatus("OpenRouter key missing. Add OPENROUTER_API_KEY to .env.");
      setChatStatus("Missing API key.", "error");
      return;
    }

    setMetaStatus("Connected.");
    setChatStatus("Enter to send. Shift+Enter for newline.");
    void queueChatPersist();
  } catch (error) {
    state.hasKey = false;
    const message = error instanceof Error ? error.message : "Failed to initialize OpenRouter.";
    setMetaStatus(message);
    setChatStatus(message, "error");
  } finally {
    setPending(false);
  }
}

ui.chatForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  void sendPrompt();
});

ui.promptInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void sendPrompt();
  }
});

ui.newChatBtn?.addEventListener("click", () => {
  clearChat();
  ui.promptInput?.focus();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && ui.settingsDetails?.open) {
    ui.settingsDetails.open = false;
  }
});

document.addEventListener("pointerdown", (event) => {
  if (!ui.settingsDetails?.open) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }

  if (ui.settingsDetails.contains(target)) {
    return;
  }

  ui.settingsDetails.open = false;
});

void boot();
