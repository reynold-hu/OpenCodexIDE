export const PROVIDER_PRESETS = [
  {
    id: "simulated",
    label: "Built-in simulator (no key needed)",
    baseUrl: null,
    models: ["gpt-5.1-codex", "gpt-5.1-codex-max", "gpt-5-codex", "gpt-5"],
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-5.1-codex", "gpt-5.1-codex-mini", "gpt-5", "gpt-4.1"],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "qwen",
    label: "Qwen (DashScope, OpenAI-compatible)",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen3-coder-plus", "qwen3-coder-flash", "qwen-max", "qwen-plus"],
  },
  {
    id: "moonshot",
    label: "Moonshot Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    models: ["kimi-k2-0905-preview", "moonshot-v1-32k"],
  },
  {
    id: "zhipu",
    label: "Zhipu GLM (BigModel)",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4.6", "glm-4.5-air"],
  },
  {
    id: "openrouter",
    label: "OpenRouter (any frontier model)",
    baseUrl: "https://openrouter.ai/api/v1",
    models: ["deepseek/deepseek-chat", "anthropic/claude-sonnet-4.5", "openai/gpt-5"],
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    models: ["llama-3.3-70b-versatile", "qwen3-coder-32b"],
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    models: ["qwen3-coder", "deepseek-r1", "llama3.1"],
  },
  {
    id: "custom",
    label: "Custom OpenAI-compatible endpoint",
    baseUrl: "",
    models: [],
  },
];

export function preset(id) {
  return PROVIDER_PRESETS.find((p) => p.id === id) || PROVIDER_PRESETS[0];
}

export function providerRuntime(state, id) {
  const p = preset(id);
  const conf = (state.settings.providers || {})[p.id] || {};
  const baseUrl = (conf.baseUrl || p.baseUrl || "").replace(/\/+$/, "");
  const apiKey = conf.apiKey || (p.id !== "simulated" ? process.env.OPEN_CODEX_API_KEY || "" : "");
  const models = conf.models && conf.models.length ? conf.models : p.models || [];
  const model = conf.model && models.includes(conf.model) ? conf.model : models[0] || "";
  return { ...p, baseUrl, apiKey, models, model };
}

export function effectiveProvider(state) {
  return providerRuntime(state, state.settings.provider || "simulated");
}

export function isRealProvider(ep) {
  return ep.id !== "simulated" && !!ep.baseUrl && !!ep.apiKey;
}

export function sanitizeSettings(state) {
  const out = structuredClone(state.settings);
  if (out.providers) {
    for (const [id, conf] of Object.entries(out.providers)) {
      out.providers[id] = { ...conf, hasKey: !!conf.apiKey, apiKey: undefined };
    }
  }
  return out;
}

export function mergeProviderConfig(state, patch) {
  state.settings.providers ||= {};
  for (const [id, conf] of Object.entries(patch || {})) {
    const next = { ...(state.settings.providers[id] || {}) };
    if (conf.apiKey !== undefined) next.apiKey = conf.apiKey === "" ? undefined : conf.apiKey;
    if (conf.baseUrl !== undefined) next.baseUrl = conf.baseUrl;
    if (conf.models !== undefined) next.models = conf.models;
    if (conf.model !== undefined) next.model = conf.model;
    state.settings.providers[id] = next;
  }
}
