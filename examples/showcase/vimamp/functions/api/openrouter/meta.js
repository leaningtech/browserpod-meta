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

export async function onRequestGet(context) {
  const model = readSetting(context?.env, "OPENROUTER_MODEL", DEFAULT_MODEL);
  const apiKey = readSetting(context?.env, "OPENROUTER_API_KEY", "");

  return jsonResponse({
    ok: true,
    provider: "openrouter",
    model,
    hasKey: Boolean(apiKey),
  });
}
