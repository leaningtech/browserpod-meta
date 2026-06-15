import { defineConfig, loadEnv } from "vite";

const isolationHeaders = {
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
};

const OPENROUTER_CHAT_ROUTE = "/api/openrouter/chat";
const OPENROUTER_META_ROUTE = "/api/openrouter/meta";
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    req.on("error", (error) => {
      reject(error);
    });
  });
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function createOpenRouterProxyPlugin() {
  const installRoutes = (middlewares, mode) => {
    const env = loadEnv(mode, process.cwd(), "");
    const apiKey = String(env.OPENROUTER_API_KEY || "").trim();
    const defaultModel = String(env.OPENROUTER_MODEL || "acree-ai/acree-trinity-mini:free").trim();
    const referer = String(env.OPENROUTER_REFERER || "http://localhost:5173").trim();
    const appTitle = String(env.OPENROUTER_APP_TITLE || "VimAmp").trim();

    middlewares.use(OPENROUTER_META_ROUTE, (req, res) => {
      if ((req.method || "").toUpperCase() !== "GET") {
        sendJson(res, 405, { error: { message: "Method not allowed." } });
        return;
      }

      sendJson(res, 200, {
        ok: true,
        provider: "openrouter",
        model: defaultModel,
        hasKey: Boolean(apiKey),
      });
    });

    middlewares.use(OPENROUTER_CHAT_ROUTE, async (req, res) => {
      if ((req.method || "").toUpperCase() !== "POST") {
        sendJson(res, 405, { error: { message: "Method not allowed." } });
        return;
      }

      if (!apiKey) {
        sendJson(res, 500, { error: { message: "Missing OPENROUTER_API_KEY." } });
        return;
      }

      let body = "";
      try {
        body = await readRequestBody(req);
      } catch (error) {
        sendJson(res, 400, { error: { message: "Unable to read request body." } });
        return;
      }

      let parsed = {};
      if (body.trim()) {
        try {
          parsed = JSON.parse(body);
        } catch (error) {
          sendJson(res, 400, { error: { message: "Invalid JSON payload." } });
          return;
        }
      }

      const requestMessages = Array.isArray(parsed?.messages) ? parsed.messages : [];
      if (requestMessages.length === 0) {
        sendJson(res, 400, { error: { message: "Request must include messages." } });
        return;
      }

      const requestedModel = String(parsed?.model || "").trim();
      const model = requestedModel || defaultModel;
      const payload = {
        model,
        messages: requestMessages,
        stream: false,
      };

      const temperature = Number.parseFloat(String(parsed?.temperature ?? ""));
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
          } catch (error) {
            sendJson(res, 502, { error: { message: "OpenRouter returned invalid JSON." } });
            return;
          }
        }

        if (!upstream.ok) {
          const message =
            upstreamPayload?.error?.message || upstreamPayload?.message || "OpenRouter request failed.";
          sendJson(res, upstream.status, { error: { message } });
          return;
        }

        sendJson(res, 200, upstreamPayload);
      } catch (error) {
        sendJson(res, 502, { error: { message: "OpenRouter request failed." } });
      }
    });
  };

  return {
    name: "openrouter-proxy",
    configureServer(server) {
      installRoutes(server.middlewares, server.config.mode || "development");
    },
    configurePreviewServer(server) {
      installRoutes(server.middlewares, server.config.mode || "production");
    },
  };
}

export default defineConfig({
  plugins: [createOpenRouterProxyPlugin()],
  server: {
    headers: isolationHeaders,
  },
  preview: {
    headers: isolationHeaders,
  },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        keyboard: "keyboard.html",
        cheatsheet: "vim-cheatsheet.html",
        themeEditor: "theme-editor.html",
        askAi: "ask-ai.html",
        docs: "docs.html",
      },
    },
  },
});
