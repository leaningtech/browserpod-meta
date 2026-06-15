const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "acree-ai/acree-trinity-mini:free";

function readSetting(env, key, fallback = "") {
  const value = String(env?.[key] ?? "").trim();
  if (value) {
    return value;
  }
  return String(fallback ?? "").trim();
}

function jsonResponse(payload, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), {
    ...init,
    headers,
  });
}

function toErrorMessage(payload, fallback) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }
  const nested = String(payload?.error?.message || "").trim();
  if (nested) {
    return nested;
  }
  const top = String(payload?.message || "").trim();
  if (top) {
    return top;
  }
  return fallback;
}

export async function onRequestPost(context) {
  const apiKey = readSetting(context?.env, "OPENROUTER_API_KEY", "");
  const modelFromEnv = readSetting(context?.env, "OPENROUTER_MODEL", DEFAULT_MODEL);
  const referer = readSetting(context?.env, "OPENROUTER_REFERER", context?.request?.url || "");
  const appTitle = readSetting(context?.env, "OPENROUTER_APP_TITLE", "VimAmp");

  if (!apiKey) {
    return jsonResponse(
      {
        error: {
          message: "Missing OPENROUTER_API_KEY.",
        },
      },
      { status: 500 }
    );
  }

  let body = {};
  try {
    body = await context.request.json();
  } catch (_error) {
    return jsonResponse(
      {
        error: {
          message: "Invalid JSON payload.",
        },
      },
      { status: 400 }
    );
  }

  const requestMessages = Array.isArray(body?.messages) ? body.messages : [];
  if (requestMessages.length === 0) {
    return jsonResponse(
      {
        error: {
          message: "Request must include messages.",
        },
      },
      { status: 400 }
    );
  }

  const requestedModel = String(body?.model || "").trim();
  const model = requestedModel || modelFromEnv;
  const payload = {
    model,
    messages: requestMessages,
    stream: false,
  };

  const temperature = Number.parseFloat(String(body?.temperature ?? ""));
  if (Number.isFinite(temperature)) {
    payload.temperature = temperature;
  }

  try {
    const upstream = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": referer,
        "X-Title": appTitle,
      },
      body: JSON.stringify(payload),
    });

    const upstreamText = await upstream.text();
    let upstreamPayload = {};
    if (upstreamText.trim()) {
      try {
        upstreamPayload = JSON.parse(upstreamText);
      } catch (_error) {
        return jsonResponse(
          {
            error: {
              message: "OpenRouter returned invalid JSON.",
            },
          },
          { status: 502 }
        );
      }
    }

    if (!upstream.ok) {
      return jsonResponse(
        {
          error: {
            message: toErrorMessage(upstreamPayload, "OpenRouter request failed."),
          },
        },
        { status: upstream.status }
      );
    }

    return jsonResponse(upstreamPayload, { status: 200 });
  } catch (_error) {
    return jsonResponse(
      {
        error: {
          message: "OpenRouter request failed.",
        },
      },
      { status: 502 }
    );
  }
}
