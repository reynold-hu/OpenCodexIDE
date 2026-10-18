import { spawn } from "node:child_process";

const RISK_RULES = [
  { level: "destructive", label: "高危", re: /\b(rm\s+-rf|rm\s+-fr|sudo|mkfs|dd\s+if=|:\(\)\{|chmod\s+777|git\s+push\s+--force|drop\s+table)/i },
  { level: "network", label: "联网", re: /\b(curl|wget|nc|ssh|scp|npm\s+(publish|install)|pip\s+install|git\s+(clone|fetch|pull|push))\b/i },
  { level: "write", label: "写入", re: /(^|[^>])>>?\s|\b(mv|cp|tee|touch|mkdir|rmdir|sed\s+-i|git\s+(add|commit|checkout|reset|merge))/i },
];
function classifyCommandFn(cmd) {
  for (const r of RISK_RULES) if (r.re.test(cmd)) return { level: r.level, label: r.label };
  return { level: "read", label: "只读" };
}
import crypto from "node:crypto";

const servers = new Map(); // dir -> { base, port, proc }
let nextPort = 4096;
const modelCache = new Map(); // providerID -> [modelIDs]

export function opencodeAvailable() {
  return new Promise((resolve) => {
    const p = spawn("opencode", ["--version"], { stdio: "ignore" });
    p.on("error", () => resolve(false));
    p.on("exit", (code) => resolve(code === 0));
  });
}

async function probe(base) {
  try {
    const r = await fetch(`${base}/config/providers`, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function serverFor(dir) {
  if (servers.has(dir)) {
    const s = servers.get(dir);
    if (await probe(s.base)) return s;
    servers.delete(dir);
  }
  for (let tries = 0; tries < 8; tries++) {
    const port = nextPort++;
    const base = `http://127.0.0.1:${port}`;
    const proc = spawn("opencode", ["serve", "--port", String(port)], { cwd: dir, detached: true, stdio: "ignore" });
    proc.unref();
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 300));
      if (await probe(base)) {
        const rec = { base, port, proc, dir };
        servers.set(dir, rec);
        return rec;
      }
    }
    try { proc.kill(); } catch {}
  }
  throw new Error("could not start opencode serve");
}

export async function pickModel(providerID, wanted) {
  if (!modelCache.size) {
    const s = await serverFor(process.cwd());
    const r = await fetch(`${s.base}/config/providers`).then((x) => x.json());
    for (const p of r.providers || []) modelCache.set(p.id, Object.keys(p.models || {}));
  }
  const list = modelCache.get(providerID) || [];
  if (!list.length) return null;
  if (list.includes(wanted)) return wanted;
  const w = String(wanted || "").toLowerCase();
  const fuzzy = list.find((m) => w && (m.includes(w.split("-")[0]) || w.includes(m.split("-")[0])));
  return fuzzy || list[0];
}

export async function refreshModelCache(dir) {
  const s = await serverFor(dir);
  const r = await fetch(`${s.base}/config/providers`).then((x) => x.json());
  modelCache.clear();
  for (const p of r.providers || []) modelCache.set(p.id, Object.keys(p.models || {}));
  return Object.fromEntries(modelCache);
}

export async function runOpencodeTurn({ dir, providerID, modelID, prompt, threadId, checkpoint, getSteers, onEvent, getThread, setThread }) {
  const server = await serverFor(dir);
  const emit = (ev) => onEvent({ ...ev, ts: Date.now() });

  let sid = getThread?.()?.ocSession;
  if (!sid) {
    const sr = await fetch(`${server.base}/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: `oea-${threadId}` }) }).then((x) => x.json());
    sid = sr.id;
    if (setThread) setThread({ ocSession: sid });
  }

  const es = await fetch(`${server.base}/event`);
  const reader = es.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const textParts = new Map(); // partId -> {sent, done, id}
  const msgRoles = new Map(); // messageID -> role
  const planIds = new Map(); // sessionID -> our plan id
  const sourceSeen = new Set();
  const usage = { input_tokens: 0, output_tokens: 0, cost: 0 };
  const toolParts = new Map(); // callID -> our command id
  let settled = false;

  const finish = (type, extra) => {
    if (settled) return;
    settled = true;
    emit({ type, ...extra });
  };

  const watchdog = setTimeout(() => finish("turn_error", { message: "opencode turn timed out" }), 180000);

  try {
    const model = await pickModel(providerID, modelID);
    if (!model) throw new Error(`provider "${providerID}" not configured in opencode`);

    emit({ type: "turn_started", prompt, checkpoint: checkpoint || null });

    const msgP = fetch(`${server.base}/session/${sid}/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parts: [{ type: "text", text: prompt }], model: { providerID, modelID: model } }),
    });

    const pump = (async () => {
      while (!settled) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, nl);
          buf = buf.slice(nl + 2);
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          let ev;
          try { ev = JSON.parse(line.slice(5)); } catch { continue; }
          const props = ev.properties || {};
          if (props.sessionID && props.sessionID !== sid) continue;
          if (ev.type === "message.updated") {
            const info = props.info || {};
            if (info.id && info.role) msgRoles.set(info.id, info.role);
            if (info.role === "assistant" && info.tokens) {
              usage.input_tokens += info.tokens.input || 0;
              usage.output_tokens += info.tokens.output || 0;
              usage.cost += info.cost || 0;
            }
            // steer: when assistant message completes, drain queued steers into the session
            if (info.role === "assistant" && info.time?.completed && getSteers) {
              for (const st of getSteers()) {
                emit({ type: "steer", prompt: st });
                fetch(`${server.base}/session/${sid}/message`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ parts: [{ type: "text", text: `[追加指令] ${st}` }], model: { providerID, modelID: model } }) }).catch(() => {});
              }
            }
          } else if (ev.type === "message.part.updated") {
            const part = props.part || {};
            if (part.type === "text" && part.messageID && msgRoles.get(part.messageID) !== "user") {
              const key = part.id || part.messageID;
              const cur = textParts.get(key) || { sent: 0, ourId: `am_${crypto.randomBytes(5).toString("hex")}`, started: false };
              const full = part.text || "";
              if (!cur.started && full) {
                cur.started = true;
                emit({ type: "agent_message", id: cur.ourId, content: "" });
              }
              if (full.length > cur.sent) {
                emit({ type: "agent_message_delta", id: cur.ourId, content: full.slice(cur.sent) });
                cur.sent = full.length;
              }
              if (part.time?.end) {
                emit({ type: "agent_message_done", id: cur.ourId, content: full });
              }
              textParts.set(key, cur);
            } else if (part.type === "tool") {
              const callId = part.callID || part.id;
              const st = part.state || {};
              const inp = st.input || {};

              if (part.tool === "todowrite") {
                const items = (inp.todos || []).map((td) => ({ title: String(td.content || "").slice(0, 120), done: td.status === "completed" }));
                if (items.length) {
                  let pid = planIds.get(sid);
                  if (!pid) { pid = `plan_${crypto.randomBytes(4).toString("hex")}`; planIds.set(sid, pid); emit({ type: "plan", id: pid, items }); }
                  else emit({ type: "plan_update", id: pid, items });
                }
                continue;
              }
              if (part.tool === "task") {
                const tid = `sub_${callId}`;
                if (st.status === "pending" || st.status === "running") emit({ type: "subagent", id: tid, prompt: String(inp.description || "子任务").slice(0, 200), done: false });
                else if (st.status === "completed") emit({ type: "subagent_update", id: tid, done: true });
                continue;
              }
              if (part.tool === "webfetch" || part.tool === "websearch") {
                if (st.status === "running" && !sourceSeen.has(callId)) {
                  sourceSeen.add(callId);
                  const url = String(inp.url || "").slice(0, 300);
                  if (url) emit({ type: "source", url, title: String(inp.title || "").slice(0, 120) });
                }
                continue;
              }

              const ourId = toolParts.get(callId) || `cmd_${crypto.randomBytes(5).toString("hex")}`;
              toolParts.set(callId, ourId);
              const cmd = inp.command || inp.filePath || part.tool;
              if (st.status === "pending") {
                const risk = part.tool === "bash" ? classifyCommandFn(String(cmd || "")) : undefined;
                emit({ type: "command", id: ourId, cmd: String(cmd || part.tool), status: "running", risk });
              } else if (st.status === "completed") {
                const output = String(st.output || st.metadata?.output || "").slice(0, 20000);
                emit({ type: "command_result", id: ourId, code: 0, output, durationMs: st.time ? (st.time.end - st.time.start) / 1000 : undefined, status: "success" });
                if ((part.tool === "edit" || part.tool === "write") && inp.filePath) {
                  const rel = String(inp.filePath).replace(dir + "/", "");
                  const diff = String(st.metadata?.diff || "");
                  const additions = (diff.match(/^\+/gm) || []).length || (part.tool === "write" ? String(inp.content || "").split("\n").length : 0);
                  const deletions = (diff.match(/^-/gm) || []).length;
                  emit({ type: "file_change", path: rel, additions, deletions, patch: (diff || `new file ${rel}\n` + String(inp.content || "").split("\n").map((l) => "+" + l).join("\n")).slice(0, 30000) });
                }
              } else if (st.status === "error") {
                emit({ type: "command_result", id: ourId, code: 1, output: String(st.error || st.metadata?.output || "error").slice(0, 8000), status: "failed" });
              }
            }
          } else if (ev.type === "session.idle") {
            finish("turn_complete", { usage });
          } else if (ev.type === "session.error") {
            finish("turn_error", { message: String(props.error?.data?.message || props.error?.name || "opencode error") });
          }
        }
      }
    })();

    let mr = await msgP;
    if (!mr.ok && mr.status === 404) {
      // server restarted / session lost → recreate once and resend
      const sr = await fetch(`${server.base}/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: `oea-${threadId}` }) }).then((x) => x.json()).catch(() => null);
      if (sr?.id) {
        sid = sr.id;
        if (setThread) setThread({ ocSession: sid });
        mr = await fetch(`${server.base}/session/${sid}/message`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ parts: [{ type: "text", text: prompt }], model: { providerID, modelID: model } }),
        });
      }
    }
    if (!mr.ok) {
      const txt = await mr.text().catch(() => "");
      finish("turn_error", { message: `opencode message failed: ${txt.slice(0, 200)}` });
    }
    await Promise.race([pump, new Promise((r) => setTimeout(r, 500))]);
  } finally {
    clearTimeout(watchdog);
    if (!settled) finish("turn_complete", {});
    try { reader.cancel(); } catch {}
  }
}

export async function abortOpencode(dir, sid) {
  const s = servers.get(dir);
  if (!s || !sid) return false;
  try {
    await fetch(`${s.base}/session/${sid}/abort`, { method: "POST" });
    return true;
  } catch {
    return false;
  }
}
