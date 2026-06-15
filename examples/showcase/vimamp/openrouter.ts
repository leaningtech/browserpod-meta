const OPENROUTER_API_BASE = "/api/openrouter";

export type OpenRouterRole = "system" | "user" | "assistant";

export interface OpenRouterMessage {
  role: OpenRouterRole;
  content: string;
}

export interface OpenRouterMeta {
  ok: boolean;
  model: string;
  hasKey: boolean;
  provider: "openrouter";
}

export interface OpenRouterChatRequest {
  messages: OpenRouterMessage[];
  model?: string;
  temperature?: number;
  signal?: AbortSignal;
}

export interface OpenRouterChatResponse {
  model: string;
  content: string;
  raw: unknown;
}

function normalizeContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const textParts = content
      .map((item) => {
        if (!item || typeof item !== "object") {
          return "";
        }
        const partType = String((item as { type?: unknown }).type || "");
        if (partType === "text") {
          return String((item as { text?: unknown }).text || "");
        }
        return "";
      })
      .filter(Boolean);
    return textParts.join("\n").trim();
  }
  return "";
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const rawText = await response.text();
  let payload: unknown = null;
  if (rawText.trim()) {
    try {
      payload = JSON.parse(rawText);
    } catch (_error) {
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      const looksLikeHtml =
        contentType.includes("text/html") || /^\s*</.test(rawText);
      if (looksLikeHtml) {
        throw new Error(
          "API route returned HTML instead of JSON. Deploy Cloudflare Pages Functions for /api/openrouter/*."
        );
      }
      throw new Error(`Invalid API response (${response.status}).`);
    }
  }

  if (!response.ok) {
    const fallback = `Request failed (${response.status}).`;
    const apiMessage =
      payload && typeof payload === "object"
        ? String(
            (payload as { error?: { message?: unknown }; message?: unknown }).error?.message ||
              (payload as { message?: unknown }).message ||
              ""
          ).trim()
        : "";
    throw new Error(apiMessage || fallback);
  }

  return payload as T;
}

export async function fetchOpenRouterMeta(signal?: AbortSignal): Promise<OpenRouterMeta> {
  const response = await fetch(`${OPENROUTER_API_BASE}/meta`, {
    method: "GET",
    signal,
  });
  return parseApiResponse<OpenRouterMeta>(response);
}

export async function requestOpenRouterChat(
  request: OpenRouterChatRequest
): Promise<OpenRouterChatResponse> {
  const body = {
    messages: request.messages,
    model: request.model,
    temperature: request.temperature,
  };

  const response = await fetch(`${OPENROUTER_API_BASE}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: request.signal,
  });

  const payload = await parseApiResponse<{
    model?: string;
    choices?: Array<{ message?: { content?: unknown } }>;
  }>(response);

  const content = normalizeContent(payload?.choices?.[0]?.message?.content);
  if (!content) {
    throw new Error("Model returned an empty response.");
  }

  return {
    model: String(payload?.model || request.model || ""),
    content,
    raw: payload,
  };
}
