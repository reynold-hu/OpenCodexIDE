export const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "update_plan",
      description: "Publish or update the task plan checklist shown to the user.",
      parameters: {
        type: "object",
        properties: { items: { type: "array", items: { type: "string" }, description: "Short plan step titles, in order" } },
        required: ["items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a shell command inside the workspace directory. Output is returned.",
      parameters: {
        type: "object",
        properties: { command: { type: "string", description: "bash command to execute" } },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a file (path relative to workspace root) with full content.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file (path relative to workspace root).",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
];

export async function chatStream({ baseUrl, apiKey, model, messages, tools, temperature = 0.2 }, onTextDelta, signal) {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, tools, tool_choice: "auto", stream: true, temperature }),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM HTTP ${res.status}: ${body.slice(0, 400)}`);
  }
  let content = "";
  const toolCalls = new Map();
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      let json;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      const delta = json.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        content += delta.content;
        onTextDelta?.(delta.content);
      }
      for (const tc of delta.tool_calls || []) {
        const i = tc.index ?? 0;
        const cur = toolCalls.get(i) || { id: "", name: "", args: "" };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name += tc.function.name;
        if (tc.function?.arguments) cur.args += tc.function.arguments;
        toolCalls.set(i, cur);
      }
    }
  }
  return { content, toolCalls: [...toolCalls.values()].filter((t) => t.name) };
}

export async function listRemoteModels({ baseUrl, apiKey }) {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, { headers: { authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.data || []).map((m) => m.id);
}
