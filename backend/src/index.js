import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import { load, save, saveNow, resetAll, workspacePath } from "./store.js";
import { runTurn, bus } from "./agent.js";
import { ensureWorkspace, tree, readFileLimited, gitStatus, gitDiff, gitCommitAll, shellExec } from "./workfs.js";
import { PROVIDER_PRESETS, providerRuntime, effectiveProvider, sanitizeSettings, mergeProviderConfig } from "./providers.js";
import { listRemoteModels } from "./llm.js";

const app = express();
const PORT = process.env.PORT || 8787;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const uid = (p) => `${p}_${crypto.randomBytes(6).toString("hex")}`;
const state = load();

function findThread(id) {
  return state.threads.find((t) => t.id === id);
}
function findProject(id) {
  return state.projects.find((p) => p.id === id);
}

// ---------- bootstrap ----------
async function bootstrap() {
  if (state.projects.length === 0) {
    const p = { id: uid("prj"), name: "demo", path: null, createdAt: Date.now() };
    state.projects.push(p);
    await ensureWorkspace(p);
    saveNow();
  } else {
    for (const p of state.projects) await ensureWorkspace(p);
  }
}

// ---------- settings ----------
app.get("/api/settings", (req, res) => res.json(sanitizeSettings(state)));
app.put("/api/settings", (req, res) => {
  const { providers: providersPatch, ...rest } = req.body || {};
  Object.assign(state.settings, rest);
  if (providersPatch) mergeProviderConfig(state, providersPatch);
  save();
  res.json(sanitizeSettings(state));
});
app.post("/api/reset", (req, res) => {
  resetAll();
  res.json({ ok: true });
});

// ---------- providers ----------
app.get("/api/providers", (req, res) => {
  res.json(
    PROVIDER_PRESETS.map((p) => {
      const rt = providerRuntime(state, p.id);
      return {
        id: p.id,
        label: p.label,
        defaultBaseUrl: p.baseUrl,
        baseUrl: rt.baseUrl,
        models: rt.models,
        model: rt.model,
        hasKey: p.id === "simulated" ? true : !!rt.apiKey,
      };
    })
  );
});
app.get("/api/providers/:id/models", async (req, res) => {
  const rt = providerRuntime(state, req.params.id);
  if (!rt.baseUrl || !rt.apiKey) return res.status(400).json({ error: "base URL or API key not configured" });
  try {
    res.json({ models: await listRemoteModels(rt) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ---------- models ----------
app.get("/api/models", (req, res) => {
  const ep = effectiveProvider(state);
  if (ep.id === "simulated") {
    return res.json([
      { id: "gpt-5.1-codex", name: "GPT-5.1-Codex", desc: "Best for coding agents", context: "400K", reasoning: ["low", "medium", "high"] },
      { id: "gpt-5.1-codex-max", name: "GPT-5.1-Codex-Max", desc: "Frontier agentic model", context: "400K", reasoning: ["low", "medium", "high", "xhigh"] },
      { id: "gpt-5-codex", name: "GPT-5-Codex", desc: "Optimized for interactive agentic coding", context: "272K", reasoning: ["low", "medium", "high"] },
      { id: "gpt-5", name: "GPT-5", desc: "Smart, flexible model for everyday tasks", context: "400K", reasoning: ["minimal", "low", "medium", "high"] },
    ]);
  }
  res.json(ep.models.map((m) => ({ id: m, name: m, desc: ep.label, context: "—", reasoning: [] })));
});

// ---------- projects ----------
app.get("/api/projects", (req, res) => {
  res.json(state.projects.map((p) => ({ ...p, path: workspacePath(p) })));
});
app.post("/api/projects", async (req, res) => {
  const name = (req.body?.name || "project").trim().replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 32) || "project";
  const p = { id: uid("prj"), name, path: req.body?.path || null, createdAt: Date.now() };
  state.projects.push(p);
  await ensureWorkspace(p);
  save();
  res.json({ ...p, path: workspacePath(p) });
});
app.delete("/api/projects/:id", (req, res) => {
  const i = state.projects.findIndex((p) => p.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: "not found" });
  state.projects.splice(i, 1);
  for (const t of [...state.threads]) if (t.projectId === req.params.id) state.threads.splice(state.threads.indexOf(t), 1);
  saveNow();
  res.json({ ok: true });
});

// ---------- threads ----------
app.get("/api/threads", (req, res) => {
  const projectId = req.query.projectId;
  let list = state.threads;
  if (projectId) list = list.filter((t) => t.projectId === projectId);
  res.json(list.map(({ events, ...t }) => ({ ...t, messageCount: events.length })));
});
app.get("/api/threads/:id", (req, res) => {
  const t = findThread(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  res.json(t);
});
app.post("/api/threads", (req, res) => {
  const projectId = req.body?.projectId || state.projects[0]?.id;
  if (!projectId) return res.status(400).json({ error: "no project" });
  const t = {
    id: uid("thr"),
    projectId,
    title: req.body?.title || "",
    status: "idle",
    model: state.settings.model,
    approvalMode: state.settings.approvalMode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    events: [],
  };
  state.threads.unshift(t);
  save();
  res.json({ ...t, messageCount: 0, events: undefined });
});
app.patch("/api/threads/:id", (req, res) => {
  const t = findThread(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  if (req.body?.title !== undefined) t.title = String(req.body.title).slice(0, 80);
  if (req.body?.model) t.model = req.body.model;
  if (req.body?.approvalMode) t.approvalMode = req.body.approvalMode;
  t.updatedAt = Date.now();
  save();
  res.json(t);
});
app.delete("/api/threads/:id", (req, res) => {
  const i = state.threads.findIndex((t) => t.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: "not found" });
  state.threads.splice(i, 1);
  saveNow();
  res.json({ ok: true });
});

// ---------- turn streaming ----------
app.post("/api/threads/:id/prompt", (req, res) => {
  const t = findThread(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  const prompt = String(req.body?.prompt || "").trim();
  if (!prompt) return res.status(400).json({ error: "empty prompt" });
  if (t.status === "running") return res.status(409).json({ error: "turn already running" });
  t.updatedAt = Date.now();
  res.json({ ok: true, turnStarted: true });
  runTurn(state, t, prompt)
    .then(() => save())
    .catch((e) => {
      console.error("turn failed", e);
      t.status = "idle";
      bus.broadcast(t.id, { type: "turn_error", message: String(e.message || e) });
      save();
    });
});

app.get("/api/threads/:id/stream", (req, res) => {
  const t = findThread(req.params.id);
  if (!t) return res.status(404).end();
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write(`event: ready\ndata: {"threadId":"${t.id}"}\n\n`);
  bus.subscribe(t.id, res);
  const ping = setInterval(() => res.write(": ping\n\n"), 25000);
  res.on("close", () => clearInterval(ping));
});

app.post("/api/approvals/:id", (req, res) => {
  const decision = req.body?.decision === "approve" ? "approve" : "deny";
  const ok = bus.resolveApproval(req.params.id, decision);
  res.json({ ok });
});

// ---------- workspace fs / git / terminal ----------
function projectDir(req, res) {
  const p = findProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: "project not found" });
    return null;
  }
  return workspacePath(p);
}

app.get("/api/projects/:id/tree", (req, res) => {
  const dir = projectDir(req, res);
  if (!dir) return;
  res.json(tree(dir));
});
app.get("/api/projects/:id/file", (req, res) => {
  const dir = projectDir(req, res);
  if (!dir) return;
  try {
    res.json(readFileLimited(dir, String(req.query.path || "")));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.get("/api/projects/:id/git", async (req, res) => {
  const dir = projectDir(req, res);
  if (!dir) return;
  try {
    const [status, diff] = await Promise.all([gitStatus(dir), gitDiff(dir)]);
    res.json({ status, diff });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post("/api/projects/:id/commit", async (req, res) => {
  const dir = projectDir(req, res);
  if (!dir) return;
  try {
    await gitCommitAll(dir, String(req.body?.message || "OpenCodex changes"));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post("/api/projects/:id/terminal", async (req, res) => {
  const dir = projectDir(req, res);
  if (!dir) return;
  const cmd = String(req.body?.cmd || "").trim();
  if (!cmd) return res.status(400).json({ error: "empty command" });
  const r = await shellExec(dir, cmd, 20000);
  res.json(r);
});

// ---------- health ----------
app.get("/api/health", (req, res) => res.json({ ok: true, name: "OpenCodex IDE", version: "0.1.0" }));

await bootstrap();
app.listen(PORT, () => console.log(`OpenCodex IDE backend on http://localhost:${PORT}`));
