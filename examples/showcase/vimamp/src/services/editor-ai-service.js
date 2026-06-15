import { fetchOpenRouterMeta, requestOpenRouterChat } from "../../openrouter.ts";
import { renderMarkdownToHtml } from "./markdown-renderer.js";

const DEFAULT_SYSTEM_PROMPT =
  "You are a practical coding assistant focused on Vim workflows and Node.js project execution.";
const MAX_CONTEXT_CHARS = 12000;
const CHAT_HISTORY_DIRECTORY = "/vimamp/.bp/chats";
const CHAT_HISTORY_MAX_MESSAGES = 120;
const CHAT_HISTORY_MAX_CHARS = 100000;

function trimContextText(text, maxChars = MAX_CONTEXT_CHARS) {
  const value = String(text || "");
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}\n\n[truncated at ${maxChars} characters]`;
}

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

export function createEditorAiService({
  ui,
  state,
  filesystemRootPath,
  getFilesystemService,
  getCurrentBufferSnapshot,
  onHidePanel,
}) {
  const chatState = {
    pending: false,
    hasKey: false,
    model: "",
    chatId: createChatId(),
    chatCreatedAt: new Date().toISOString(),
    fileContextPath: "",
    fileContextText: "",
    persistQueue: Promise.resolve(),
    messages: /** @type {Array<{ role: "user" | "assistant" | "system"; content: string }>} */ ([]),
  };

  function setMetaStatus(message) {
    if (!ui.aiPanelMeta) {
      return;
    }
    ui.aiPanelMeta.textContent = message;
  }

  function setChatStatus(message, tone = "") {
    if (!ui.aiPanelStatus) {
      return;
    }
    ui.aiPanelStatus.textContent = message;
    if (!tone) {
      ui.aiPanelStatus.removeAttribute("data-tone");
      return;
    }
    ui.aiPanelStatus.setAttribute("data-tone", tone);
  }

  function setCurrentFileLabel(message = "No file attached") {
    if (!ui.aiPanelFileLabel) {
      return;
    }
    ui.aiPanelFileLabel.textContent = message;
  }

  function setPending(isPending) {
    chatState.pending = Boolean(isPending);

    if (ui.aiPanelSendBtn) {
      ui.aiPanelSendBtn.disabled = chatState.pending || !chatState.hasKey;
      ui.aiPanelSendBtn.textContent = chatState.pending ? "Thinking..." : "Send";
    }
    if (ui.aiPanelPromptInput) {
      ui.aiPanelPromptInput.disabled = chatState.pending || !chatState.hasKey;
    }
    if (ui.aiPanelNewChatBtn) {
      ui.aiPanelNewChatBtn.disabled = chatState.pending;
    }
    if (ui.aiPanelUseFileBtn) {
      ui.aiPanelUseFileBtn.disabled = chatState.pending || !chatState.hasKey;
    }
    if (chatState.pending && ui.aiSettingsDetails?.open) {
      ui.aiSettingsDetails.open = false;
    }
  }

  function renderTranscript() {
    if (!ui.aiPanelTranscript) {
      return;
    }

    ui.aiPanelTranscript.innerHTML = "";
    if (chatState.messages.length === 0) {
      const empty = document.createElement("p");
      empty.className = "ai-panel-empty";
      empty.textContent =
        "Ask about your current file, Vim commands, or Node project errors.";
      ui.aiPanelTranscript.append(empty);
      return;
    }

    for (const message of chatState.messages) {
      const card = document.createElement("article");
      card.className = `ai-panel-message ${message.role}`;

      const role = document.createElement("p");
      role.className = "ai-panel-message-role";
      role.textContent = message.role;
      card.append(role);

      const body = document.createElement("div");
      body.className = "ai-panel-message-content";
      if (message.role === "assistant") {
        body.innerHTML = renderMarkdownToHtml(message.content);
      } else {
        const plain = document.createElement("p");
        plain.textContent = message.content;
        body.append(plain);
      }
      card.append(body);

      ui.aiPanelTranscript.append(card);
    }

    ui.aiPanelTranscript.scrollTop = ui.aiPanelTranscript.scrollHeight;
  }

  async function persistChatNow() {
    if (!state.podReady) {
      return;
    }

    const filesystemService = getFilesystemService?.();
    if (
      !filesystemService ||
      typeof filesystemService.createDirectory !== "function" ||
      typeof filesystemService.writeFileText !== "function"
    ) {
      return;
    }

    const truncatedMessages = truncateMessages(chatState.messages);
    const payload = {
      schemaVersion: 1,
      chatId: chatState.chatId,
      createdAt: chatState.chatCreatedAt,
      updatedAt: new Date().toISOString(),
      model: chatState.model || "",
      systemPrompt: String(ui.aiSystemPromptInput?.value || "").trim(),
      temperature: Number.parseFloat(String(ui.aiTemperatureInput?.value || "0.7")),
      fileContextPath: chatState.fileContextPath,
      messageCount: truncatedMessages.length,
      messages: truncatedMessages,
    };

    await filesystemService.createDirectory(CHAT_HISTORY_DIRECTORY);
    await filesystemService.writeFileText(
      getChatFilePath(chatState.chatId),
      `${JSON.stringify(payload, null, 2)}\n`
    );
  }

  function queueChatPersist() {
    chatState.persistQueue = chatState.persistQueue
      .then(() => persistChatNow())
      .catch((error) => {
        console.warn("AI chat persist failed", error);
      });
    return chatState.persistQueue;
  }

  function resetChatSession() {
    chatState.chatId = createChatId();
    chatState.chatCreatedAt = new Date().toISOString();
    chatState.messages = [];
  }

  function clearChat() {
    resetChatSession();
    renderTranscript();
    setChatStatus("Enter to send. Shift+Enter for newline.");
    void queueChatPersist();
  }

  function pushMessage(role, content) {
    const text = String(content || "").trim();
    if (!text) {
      return;
    }
    chatState.messages.push({ role, content: text });
    chatState.messages = truncateMessages(chatState.messages);
    renderTranscript();
    void queueChatPersist();
  }

  async function captureContextFromCurrentFile() {
    const activePath = String(state.activeFilePath || "").trim();
    if (!activePath || !activePath.startsWith(filesystemRootPath)) {
      throw new Error(`Active file must be inside ${filesystemRootPath}.`);
    }

    if (state.vimEditor && typeof getCurrentBufferSnapshot === "function") {
      const snapshot = await getCurrentBufferSnapshot();
      const fullPath = String(snapshot?.path || activePath);
      const text = String(snapshot?.text || "");
      return { path: fullPath, text };
    }

    const filesystemService = getFilesystemService();
    if (!filesystemService || typeof filesystemService.readFileText !== "function") {
      throw new Error("Filesystem read is unavailable.");
    }

    const text = await filesystemService.readFileText(activePath);
    return { path: activePath, text: String(text || "") };
  }

  async function attachCurrentFileContext() {
    try {
      const snapshot = await captureContextFromCurrentFile();
      chatState.fileContextPath = snapshot.path;
      chatState.fileContextText = trimContextText(snapshot.text);
      setCurrentFileLabel(`Attached: ${snapshot.path}`);
      setChatStatus("Current file attached.");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to read current file.";
      setChatStatus(message, "error");
      return false;
    }
  }

  function buildRequestMessages(userPrompt) {
    const messages = [];
    const systemPrompt = String(ui.aiSystemPromptInput?.value || "").trim();
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }

    if (chatState.fileContextPath && chatState.fileContextText) {
      messages.push({
        role: "user",
        content: [
          `Current file context (${chatState.fileContextPath}):`,
          "```",
          chatState.fileContextText,
          "```",
        ].join("\n"),
      });
    }

    for (const message of chatState.messages) {
      if (message.role === "user" || message.role === "assistant") {
        messages.push({ role: message.role, content: message.content });
      }
    }

    messages.push({ role: "user", content: userPrompt });
    return messages;
  }

  async function sendPrompt() {
    if (!ui.aiPanelPromptInput || chatState.pending || !chatState.hasKey) {
      return;
    }

    const userPrompt = String(ui.aiPanelPromptInput.value || "").trim();
    if (!userPrompt) {
      setChatStatus("Type a message first.", "error");
      return;
    }

    pushMessage("user", userPrompt);
    ui.aiPanelPromptInput.value = "";
    setPending(true);
    setChatStatus("Thinking...");

    try {
      const temperatureValue = Number.parseFloat(String(ui.aiTemperatureInput?.value || "0.7"));
      const temperature = Number.isFinite(temperatureValue) ? temperatureValue : undefined;

      const response = await requestOpenRouterChat({
        model: chatState.model || undefined,
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
      ui.aiPanelPromptInput?.focus();
    }
  }

  async function boot() {
    renderTranscript();
    setPending(true);
    setMetaStatus("Loading AI service...");
    setCurrentFileLabel("No file attached");

    if (ui.aiSystemPromptInput && !ui.aiSystemPromptInput.value.trim()) {
      ui.aiSystemPromptInput.value = DEFAULT_SYSTEM_PROMPT;
    }

    try {
      const meta = await fetchOpenRouterMeta();
      chatState.hasKey = Boolean(meta?.hasKey);
      chatState.model = String(meta?.model || "");
      if (!chatState.hasKey) {
        setMetaStatus("OpenRouter key missing. Add OPENROUTER_API_KEY to .env.");
        setChatStatus("Missing API key.", "error");
        return;
      }
      setMetaStatus("Connected.");
      setChatStatus("Enter to send. Shift+Enter for newline.");
      void queueChatPersist();
    } catch (error) {
      chatState.hasKey = false;
      const message = error instanceof Error ? error.message : "Failed to initialize OpenRouter.";
      setMetaStatus(message);
      setChatStatus(message, "error");
    } finally {
      setPending(false);
    }
  }

  function installHandlers() {
    ui.aiPanelForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      void sendPrompt();
    });

    ui.aiPanelPromptInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void sendPrompt();
      }
    });

    ui.aiPanelNewChatBtn?.addEventListener("click", () => {
      clearChat();
      ui.aiPanelPromptInput?.focus();
    });

    ui.aiPanelUseFileBtn?.addEventListener("click", () => {
      void attachCurrentFileContext();
    });

    ui.aiPanelCloseBtn?.addEventListener("click", () => {
      onHidePanel?.();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && ui.aiSettingsDetails?.open) {
        ui.aiSettingsDetails.open = false;
      }
    });

    document.addEventListener("pointerdown", (event) => {
      if (!ui.aiSettingsDetails?.open) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (ui.aiSettingsDetails.contains(target)) {
        return;
      }
      ui.aiSettingsDetails.open = false;
    });

    void boot();
  }

  return {
    installHandlers,
    clearChat,
    focusInput() {
      ui.aiPanelPromptInput?.focus();
    },
  };
}
