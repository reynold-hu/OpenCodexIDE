import { spawn } from "node:child_process";
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

export async function runOpencodeTurn({ dir, providerID, modelID, prompt, threadId, sessionKey, onEvent, getThread, setThread }) {
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

    emit({ type: "turn_started", prompt });

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
              const ourId = toolParts.get(callId) || `cmd_${crypto.randomBytes(5).toString("hex")}`;
              toolParts.set(callId, ourId);
              const st = part.state || {};
              const cmd = st.input?.command || st.input?.filePath || part.tool;
              if (st.status === "pending") {
                emit({ type: "command", id: ourId, cmd: String(cmd || part.tool), status: "running" });
              } else if (st.status === "completed") {
                const output = String(st.output || st.metadata?.output || "").slice(0, 20000);
                emit({ type: "command_result", id: ourId, code: 0, output, durationMs: st.time ? (st.time.end - st.time.start) / 1000 : undefined, status: "success" });
                if ((part.tool === "edit" || part.tool === "write") && st.input?.filePath) {
                  emit({ type: "file_change", path: String(st.input.filePath).replace(dir + "/", ""), additions: 0, deletions: 0, patch: String(st.metadata?.diff || st.input?.content || "").slice(0, 30000) });
                }
              } else if (st.status === "error") {
                emit({ type: "command_result", id: ourId, code: 1, output: String(st.error || st.metadata?.output || "error").slice(0, 8000), status: "failed" });
              }
            }
          } else if (ev.type === "session.idle") {
            finish("turn_complete", {});
          } else if (ev.type === "session.error") {
            finish("turn_error", { message: String(props.error?.data?.message || props.error?.name || "opencode error") });
          }
        }
      }
    })();

    const mr = await msgP;
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
