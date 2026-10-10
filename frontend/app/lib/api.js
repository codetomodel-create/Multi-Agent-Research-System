"use client";

// Single place that knows the backend URL and the response contract. Nothing
// else in the app is allowed to call fetch — that keeps error handling, the
// session header and the offline signal consistent across every feature.

export const API_BASE =
  typeof window !== "undefined"
    ? window.location.port === "3000" || window.location.port === "3001"
      ? "http://localhost:8000"
      : window.location.origin
    : "http://localhost:8000";

export class ApiError extends Error {
  constructor(message, { status = 0, offline = false } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.offline = offline;
  }
}

function sessionId() {
  if (typeof window === "undefined") return "sess_ssr";
  let id = sessionStorage.getItem("mr_session_id");
  if (!id) {
    id = "sess_" + Math.random().toString(36).slice(2, 7);
    sessionStorage.setItem("mr_session_id", id);
  }
  return id;
}

async function request(path, { method = "GET", body, signal, raw = false } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      signal,
      headers: {
        "X-Session-ID": sessionId(),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ApiError("Backend unreachable. Check that the API is running.", {
      offline: true,
    });
  }

  if (!res.ok) {
    let detail = `Request failed (${res.status}).`;
    try {
      const data = await res.json();
      // FastAPI validation errors arrive as a list of objects.
      detail = Array.isArray(data?.detail)
        ? data.detail.map((d) => d.msg).join("; ")
        : data?.detail || detail;
    } catch {
      /* body was not JSON — keep the status-derived message */
    }
    throw new ApiError(detail, { status: res.status });
  }

  if (raw) return res;
  try {
    return await res.json();
  } catch {
    throw new ApiError("Server returned a malformed response.", { status: res.status });
  }
}

export const api = {
  health: (signal) => request("/api/health", { signal }),
  demo: (signal) => request("/api/demo", { signal }),
  seedDemo: () => request("/api/demo/seed", { method: "POST", body: {} }),
  config: (signal) => request("/api/config", { signal }),
  saveConfig: (body) => request("/api/config", { method: "POST", body }),

  runs: (signal) => request("/api/runs", { signal }),
  progress: (id, signal) => request(`/api/runs/${encodeURIComponent(id)}/progress`, { signal }),
  report: (id, signal) => request(`/api/runs/${encodeURIComponent(id)}/report`, { signal }),
  research: (body) => request("/api/research", { method: "POST", body }),
  cancel: (id) => request(`/api/runs/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
  retry: (id) => request(`/api/runs/${encodeURIComponent(id)}/retry`, { method: "POST" }),
  remove: (id) => request(`/api/runs/${encodeURIComponent(id)}`, { method: "DELETE" }),
  compare: (a, b, signal) =>
    request(`/api/runs/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`, { signal }),
  exportUrl: (id, format) =>
    `${API_BASE}/api/runs/${encodeURIComponent(id)}/export?format=${format}`,
  exportRaw: (id, format) =>
    request(`/api/runs/${encodeURIComponent(id)}/export?format=${format}`, { raw: true }),

  models: (body, signal) => request("/api/models", { method: "POST", body, signal }),
  testProvider: (body) => request("/api/providers/test", { method: "POST", body }),

  streamUrl: (id) => `${API_BASE}/api/runs/${encodeURIComponent(id)}/stream`,
};

export const PROVIDERS = [
  { id: "ollama", label: "Ollama (local)" },
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "gemini", label: "Gemini" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "qwen", label: "Qwen" },
  { id: "bedrock", label: "AWS Bedrock" },
];

export const FALLBACK_MODELS = {
  ollama: ["llama3.1:8b", "llama3:8b", "mistral", "gemma2", "qwen2", "phi3"],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"],
  anthropic: ["claude-3-5-sonnet-latest", "claude-3-haiku-20240307"],
  deepseek: ["deepseek-chat", "deepseek-coder"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  qwen: ["qwen-max", "qwen-plus", "qwen-turbo"],
  bedrock: [
    "anthropic.claude-3-5-sonnet-20240620-v1:0",
    "anthropic.claude-3-haiku-20240307-v1:0",
    "meta.llama3-70b-instruct-v1:0",
  ],
};
