import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { load, save, saveNow, resetAll, workspacePath, DATA_HOME, PRODUCT, PORTS } from "./store.js";
import { runTurn, bus, cancelTurn, enqueueSteer, attachWorktree, detachWorktree, resolveThreadDir, runSwarm } from "./agent.js";
import { BUILTIN_AGENTS } from "./roles.js";
import { ensureWorkspace, tree, readFileLimited, writeFileInWorkspace, gitStatus, gitDiff, gitCommitAll, shellExec, revertPath, writeBinary, gitRestore } from "./workfs.js";
import { PROVIDER_PRESETS, providerRuntime, effectiveProvider, sanitizeSettings, mergeProviderConfig } from "./providers.js";
import { listRemoteModels } from "./llm.js";
import { startProcess, listProcesses, stopProcess, tailLog } from "./procs.js";
import { opencodeAvailable, refreshModelCache } from "./opencode.js";
import { registrationOptions, finishRegistration, authOptions, verifyAssertion, checkToken, revokeToken, issueToken } from "./passkey.js";

import { promisify as _promisify } from "node:util";
const execFilePromise = _promisify(execFile);

const app = express();
const PORT = process.env.PORT || PORTS[PRODUCT];
const SHOTS_DIR = path.join(DATA_HOME, "shots");
fs.mkdirSync(SHOTS_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: "16mb" }));

// passkey lock middleware: when enabled, all /api routes need a session token
app.use((req, res, next) => {
  if (!state.settings.passkey?.enabled) return next();
  if (req.path.startsWith("/api/passkey/") || req.path === "/api/health") return next();
  if (req.path.startsWith("/preview/") || req.path.startsWith("/shots/")) return next();
  const token = String(req.header("x-oea-token") || req.query.token || "");
  if (checkToken(token)) return next();
  return res.status(401).json({ error: "locked", code: "passkey-required" });
});

// product route surface guard: IDE/fs routes belong to codex only
app.use((req, res, next) => {
  const m = req.path.match(/^\/api\/projects\/[^/]+\/([a-z]+)/);
  const seg = m?.[1];
  const isFs = !!seg && ["tree", "git", "terminal", "commit", "processes", "open", "upload", "screenshot", "diff", "branches", "checkout"].includes(seg);
  const isIdeThread = /\/api\/threads\/[^/]+\/(worktree|undo|restore)/.test(req.path) || req.path === "/api/outputs";
  const isStatic = req.path.startsWith("/preview/") || req.path.startsWith("/shots/");
  const fileRead = seg === "file" && req.method === "GET";
  const allowedForChat = ["claude", "muse"].includes(PRODUCT) && (isStatic || fileRead || seg === "file" && req.method === "POST" || seg === "history" && req.method === "GET" || req.path.match(/^\/api\/projects\/[^/]+\/file\?rev=/));
  if ((isFs || isIdeThread || isStatic) && PRODUCT !== "codex" && !allowedForChat) {
    return res.status(404).json({ error: `route not available in ${PRODUCT}` });
  }
  next();
});

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
app.get("/api/projects/:id", (req, res) => {
  const p = findProject(req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  res.json({ ...p, path: workspacePath(p) });
});
app.patch("/api/projects/:id", (req, res) => {
  const p = findProject(req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  if (req.body?.name) p.name = String(req.body.name).trim().replace(/[^a-zA-Z0-9 _\-\u4e00-\u9fff]/g, "").slice(0, 32) || p.name;
  save();
  res.json(p);
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
  let list = state.threads.filter((t) => (t.product || "codex") === PRODUCT);
  if (projectId) list = list.filter((t) => t.projectId === projectId);
  if (!req.query.archived) list = list.filter((t) => !t.archived);
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
    product: PRODUCT,
    dot: req.body?.dot && typeof req.body.dot === "object" ? { color: String(req.body.dot.color || "default").slice(0, 12), compact: !!req.body.dot.compact } : undefined,
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
  if (req.body?.pinned !== undefined) t.pinned = !!req.body.pinned;
  if (req.body?.archived !== undefined) t.archived = !!req.body.archived;
  if (req.body?.dot !== undefined) t.dot = req.body.dot ? { ...(t.dot || {}), ...req.body.dot } : null;
  t.updatedAt = Date.now();
  save();
  res.json(t);
});
app.post("/api/threads/:id/fork", (req, res) => {
  const src = findThread(req.params.id);
  if (!src) return res.status(404).json({ error: "not found" });
  const t = {
    id: uid("thr"),
    projectId: src.projectId,
    title: `Fork · ${src.title || "chat"}`,
    forkOf: src.id,
    status: "idle",
    model: src.model,
    approvalMode: src.approvalMode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    events: structuredClone(src.events),
  };
  state.threads.unshift(t);
  saveNow();
  res.json({ ...t, messageCount: t.events.length, events: undefined });
});
app.post("/api/threads/:id/side", (req, res) => {  const parent = findThread(req.params.id);
  if (!parent) return res.status(404).json({ error: "not found" });
  const t = {
    id: uid("thr"),
    projectId: parent.projectId,
    title: req.body?.title || `Side chat · ${parent.title || "chat"}`,
    sideOf: parent.id,
    status: "idle",
    model: parent.model,
    approvalMode: parent.approvalMode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    events: [],
  };
  state.threads.unshift(t);
  save();
  res.json({ ...t, messageCount: 0 });
});
app.post("/api/threads/:id/undo", (req, res) => {
  const t = findThread(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  const paths = Array.isArray(req.body?.paths) ? req.body.paths : [];
  const project = findProject(t.projectId);
  if (!project) return res.status(400).json({ error: "no project" });
  const dir = workspacePath(project);
  (async () => {
    const results = [];
    for (const rel of paths) {
      try {
        const r = await revertPath(dir, String(rel));
        results.push({ path: rel, result: r });
        for (const ev of t.events) if (ev.type === "file_change" && ev.path === rel) ev.reverted = true;
        if (results.length) {
          const rev = { type: "files_reverted", paths: results.map((x) => x.path), ts: Date.now() };
          t.events.push(rev);
          bus.broadcast(t.id, rev);
        }
      } catch (e) {
        results.push({ path: rel, error: e.message });
      }
    }
    save();
    res.json({ ok: true, results });
  })();
});
app.post("/api/threads/:id/feedback", (req, res) => {
  const t = findThread(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  const ev = t.events.find((e) => e.id === req.body?.eventId);
  if (!ev) return res.status(404).json({ error: "event not found" });
  ev.feedback = req.body.value === "up" || req.body.value === "down" ? req.body.value : null;
  save();
  res.json({ ok: true });
});
app.post("/api/threads/:id/schedule", (req, res) => {
  const t = findThread(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  const prompt = String(req.body?.prompt || "").trim();
  const everyMinutes = Math.max(5, Number(req.body?.everyMinutes) || 60);
  if (!prompt) return res.status(400).json({ error: "empty prompt" });
  t.scheduled = t.scheduled || [];
  const task = { id: uid("task"), prompt, everyMinutes, nextRun: Date.now() + everyMinutes * 60000 };
  t.scheduled.push(task);
  saveNow();
  res.json(task);
});
app.delete("/api/threads/:id/schedule/:taskId", (req, res) => {
  const t = findThread(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  t.scheduled = (t.scheduled || []).filter((s) => s.id !== req.params.taskId);
  saveNow();
  res.json({ ok: true });
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
  if (t.status === "running") {
    enqueueSteer(t.id, prompt);
    return res.json({ ok: true, queued: true });
  }
  t.updatedAt = Date.now();
  res.json({ ok: true, turnStarted: true });
  const useTeam = req.body?.team || String(prompt).trim().startsWith("/team");
  const teamTask = useTeam && String(prompt).trim().startsWith("/team") ? String(prompt).trim().slice(5).trim() : prompt;
  const go = useTeam ? runSwarm(state, t, teamTask, req.body?.agents) : runTurn(state, t, prompt);
  go
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

app.post("/api/threads/:id/restore", (req, res) => {
  const t = findThread(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  const project = findProject(t.projectId);
  if (!project) return res.status(400).json({ error: "no project" });
  const hash = String(req.body?.hash || "");
  (async () => {
    try {
      await gitRestore(workspacePath(project), hash);
      const ev = { type: "restored", hash: hash.slice(0, 8), ts: Date.now() };
      t.events.push(ev);
      bus.broadcast(t.id, ev);
      save();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  })();
});
app.post("/api/threads/:id/revise", (req, res) => {
  const t = findThread(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  if (t.status === "running") return res.status(409).json({ error: "turn running" });
  const ts = Number(req.body?.turnTs);
  const prompt = String(req.body?.prompt || "").trim();
  if (!prompt) return res.status(400).json({ error: "empty prompt" });
  const idx = t.events.findIndex((e) => e.type === "turn_started" && e.ts === ts);
  if (idx === -1) return res.status(404).json({ error: "turn not found" });
  t.events = t.events.slice(0, idx);
  res.json({ ok: true, turnStarted: true });
  const useTeam = req.body?.team || String(prompt).trim().startsWith("/team");
  const teamTask = useTeam && String(prompt).trim().startsWith("/team") ? String(prompt).trim().slice(5).trim() : prompt;
  const go = useTeam ? runSwarm(state, t, teamTask, req.body?.agents) : runTurn(state, t, prompt);
  go
    .then(() => save())
    .catch((e) => {
      t.status = "idle";
      bus.broadcast(t.id, { type: "turn_error", message: String(e.message || e) });
      save();
    });
});
app.post("/api/threads/:id/worktree", async (req, res) => {
  const t = findThread(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  try {
    const wt = await attachWorktree(state, t);
    res.json({ ok: true, worktree: wt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.delete("/api/threads/:id/worktree", async (req, res) => {
  const t = findThread(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  res.json({ ok: await detachWorktree(state, t) });
});
app.post("/api/threads/:id/annotate", (req, res) => {
  const t = findThread(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  const quote = String(req.body?.quote || "").slice(0, 500);
  const note = String(req.body?.note || "").slice(0, 500);
  if (!quote && !note) return res.status(400).json({ error: "empty annotation" });
  t.pendingNotes = t.pendingNotes || [];
  t.pendingNotes.push({ quote, note });
  const ev = { type: "annotation", quote, note, ts: Date.now() };
  t.events.push(ev);
  bus.broadcast(t.id, ev);
  save();
  res.json({ ok: true, pending: t.pendingNotes.length });
});
app.post("/api/threads/:id/retry", (req, res) => {
  const t = findThread(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  if (t.status === "running") return res.status(409).json({ error: "turn running" });
  let lastTs = null, lastPrompt = null;
  for (const e of t.events) if (e.type === "turn_started") { lastTs = e.ts; lastPrompt = e.prompt; }
  if (lastTs === null) return res.status(400).json({ error: "no previous turn" });
  t.events = t.events.slice(0, t.events.findIndex((e) => e.type === "turn_started" && e.ts === lastTs));
  res.json({ ok: true, turnStarted: true });
  runTurn(state, t, lastPrompt)
    .then(() => save())
    .catch((e) => {
      t.status = "idle";
      bus.broadcast(t.id, { type: "turn_error", message: String(e.message || e) });
      save();
    });
});
app.post("/api/threads/:id/worktree/merge", async (req, res) => {
  const t = findThread(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  if (!t.worktree) return res.status(400).json({ error: "no worktree" });
  const project = findProject(t.projectId);
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const ex = promisify(execFile);
    await ex("git", ["add", "-A"], { cwd: t.worktree.path });
    await ex("git", ["commit", "-q", "--allow-empty", "-m", `oc: ${t.title || t.id}`], { cwd: t.worktree.path }).catch(() => {});
    const repoDir = workspacePath(project);
    await ex("git", ["merge", "--no-edit", t.worktree.branch], { cwd: repoDir });
    const ev = { type: "worktree_merged", branch: t.worktree.branch, ts: Date.now() };
    t.events.push(ev);
    bus.broadcast(t.id, ev);
    save();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: (e.stderr || e.message || "").slice(0, 400) });
  }
});
app.post("/api/threads/:id/cancel", (req, res) => {
  const t = findThread(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  const ok = cancelTurn(t.id);
  if (ok) {
    t.status = "idle";
    bus.broadcast(t.id, { type: "turn_cancelled", ts: Date.now() });
    save();
  }
  res.json({ ok });
});

// ---------- full-text search ----------
app.get("/api/search", (req, res) => {
  const q = String(req.query.q || "").toLowerCase().trim();
  if (!q) return res.json([]);
  const hits = [];
  for (const t of state.threads) {
    let score = 0;
    const sample = [];
    for (const ev of t.events) {
      const text = ev.prompt || ev.content || ev.cmd || ev.output || "";
      if (String(text).toLowerCase().includes(q)) {
        score++;
        if (sample.length < 2) sample.push(String(text).slice(0, 120));
      }
    }
    if ((t.title || "").toLowerCase().includes(q)) score += 5;
    if (score) hits.push({ id: t.id, projectId: t.projectId, title: t.title || "New chat", updatedAt: t.updatedAt, score, sample });
  }
  hits.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt);
  res.json(hits.slice(0, 15));
});

// ---------- branches ----------
app.get("/api/projects/:id/git/branches", async (req, res) => {
  const dir = projectDir(req, res);
  if (!dir) return;
  try {
    const { stdout } = await execFilePromise("git", ["branch", "--format=%(refname:short)%09%(HEAD)"], { cwd: dir });
    const branches = stdout.split("\n").filter(Boolean).map((l) => {
      const [name, head] = l.split("\t");
      return { name, current: head === "*" };
    });
    res.json(branches);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post("/api/projects/:id/git/checkout", async (req, res) => {
  const dir = projectDir(req, res);
  if (!dir) return;
  const branch = String(req.body?.branch || "").trim();
  if (!branch || !/^[\w./-]+$/.test(branch)) return res.status(400).json({ error: "bad branch name" });
  try {
    await execFilePromise("git", ["checkout", branch], { cwd: dir });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: (e.stderr || e.message).slice(0, 300) });
  }
});

// ---------- per-file diff & upload ----------
app.get("/api/projects/:id/diff", async (req, res) => {
  const dir = projectDir(req, res);
  if (!dir) return;
  const rel = req.query.path ? String(req.query.path) : null;
  try {
    const args = rel ? ["diff", "HEAD", "--", rel] : ["diff", "HEAD"];
    const { stdout } = await execFilePromise("git", args, { cwd: dir, maxBuffer: 2 * 1024 * 1024 });
    res.json({ diff: stdout });
  } catch (e) {
    res.json({ diff: "", error: e.message });
  }
});
app.post("/api/projects/:id/open", async (req, res) => {
  const dir = projectDir(req, res);
  if (!dir) return;
  const rel = String(req.body?.path || "").replace(/^\/+/, "");
  const mode = req.body?.mode === "reveal" ? "reveal" : "open";
  const { execFile } = await import("node:child_process");
  if (!rel) {
    return execFile("open", [dir], (e) => (e ? res.status(500).json({ error: e.message }) : res.json({ ok: true })));
  }
  const full = path.normalize(path.join(dir, rel));
  if (!full.startsWith(dir) || !fs.existsSync(full)) return res.status(404).json({ error: "not found" });
  const args = mode === "reveal" ? ["-R", full] : [full];
  execFile("open", args, (e) => (e ? res.status(500).json({ error: e.message }) : res.json({ ok: true })));
});
app.post("/api/projects/:id/upload", (req, res) => {
  const dir = projectDir(req, res);
  if (!dir) return;
  const rel = String(req.body?.path || "").replace(/^\/+/, "");
  const b64 = String(req.body?.dataBase64 || "");
  if (!rel || !b64 || b64.length > 8 * 1024 * 1024) return res.status(400).json({ error: "bad upload" });
  try {
    writeBinary(dir, rel, b64.replace(/^data:[^,]+,/, ""));
    res.json({ ok: true, path: rel });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- workspace fs / git / terminal ----------
function projectDir(req, res) {
  const p = findProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: "project not found" });
    return null;
  }
  const rootIdx = Number(req.query.root ?? req.body?.root ?? 0);
  if (rootIdx > 0 && Array.isArray(p.roots) && p.roots[rootIdx - 1]) {
    const rp = p.roots[rootIdx - 1];
    if (fs.existsSync(rp)) return rp;
  }
  const t = findThread(String(req.query.thread || req.body?.thread || ""));
  if (t && t.worktree && fs.existsSync(t.worktree.path)) return t.worktree.path;
  return workspacePath(p);
}

app.get("/api/projects/:id/roots", (req, res) => {
  const p = findProject(req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  res.json([{ index: 0, name: p.name, path: workspacePath(p) }, ...(p.roots || []).map((r, i) => ({ index: i + 1, name: path.basename(r), path: r }))]);
});
app.post("/api/projects/:id/roots", (req, res) => {
  const p = findProject(req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  const rp = String(req.body?.path || "").trim();
  if (!rp || !fs.existsSync(rp) || !fs.statSync(rp).isDirectory()) return res.status(400).json({ error: "folder not found" });
  p.roots = p.roots || [];
  if (!p.roots.includes(rp)) p.roots.push(rp);
  saveNow();
  res.json({ ok: true, roots: p.roots });
});
app.delete("/api/projects/:id/roots", (req, res) => {
  const p = findProject(req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  const rp = String(req.body?.path || req.query.path || "");
  p.roots = (p.roots || []).filter((x) => x !== rp);
  saveNow();
  res.json({ ok: true, roots: p.roots });
});
app.get("/api/projects/:id/tree", (req, res) => {
  const dir = projectDir(req, res);
  if (!dir) return;
  res.json(tree(dir));
});
app.get("/api/projects/:id/file", async (req, res) => {
  const dir = projectDir(req, res);
  if (!dir) return;
  const rel = String(req.query.path || "");
  const rev = String(req.query.rev || "");
  try {
    if (rev) {
      if (!/^[0-9a-f]{7,40}$/.test(rev)) return res.status(400).json({ error: "bad rev" });
      const { stdout } = await execFilePromise("git", ["show", `${rev}:${rel}`], { cwd: dir, maxBuffer: 2 * 1024 * 1024 });
      return res.json({ content: stdout, truncated: false, size: stdout.length });
    }
    res.json(readFileLimited(dir, rel));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.get("/api/projects/:id/history", async (req, res) => {
  const dir = projectDir(req, res);
  if (!dir) return;
  const rel = String(req.query.path || "");
  if (!rel) return res.status(400).json({ error: "path required" });
  try {
    const { stdout } = await execFilePromise("git", ["log", "--format=%H\t%ct\t%s", "--", rel], { cwd: dir });
    const entries = stdout.split("\n").filter(Boolean).map((l) => {
      const [hash, ts, msg] = l.split("\t");
      return { hash, ts: Number(ts) * 1000, msg };
    });
    res.json({ entries });
  } catch (e) {
    res.json({ entries: [], error: e.message });
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
    await gitCommitAll(dir, String(req.body?.message || "OpenEveryAgent changes"));
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
app.post("/api/projects/:id/file", (req, res) => {
  const dir = projectDir(req, res);
  if (!dir) return;
  const rel = String(req.body?.path || "").replace(/^\/+/, "");
  if (!rel) return res.status(400).json({ error: "empty path" });
  try {
    writeFileInWorkspace(dir, rel, String(req.body?.content ?? ""));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- headless preview & screenshots ----------
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8" };

app.get("/preview/:projectId/*", (req, res) => {
  const p = findProject(req.params.projectId);
  if (!p) return res.status(404).send("project not found");
  const tq = findThread(String(req.query.thread || ""));
  const dir = tq && tq.worktree && fs.existsSync(tq.worktree.path) ? tq.worktree.path : workspacePath(p);
  const rel = req.params[0] || "index.html";
  const full = path.normalize(path.join(dir, rel));
  if (!full.startsWith(dir)) return res.status(400).send("bad path");
  if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) return res.status(404).send("file not found");
  res.set("Cache-Control", "no-store");
  res.type(MIME[path.extname(full).toLowerCase()] || "application/octet-stream");
  fs.createReadStream(full).pipe(res);
});

function findChrome() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ];
  return candidates.find((c) => fs.existsSync(c));
}

app.post("/api/projects/:id/screenshot", async (req, res) => {
  const dir = projectDir(req, res);
  if (!dir) return;
  const chrome = findChrome();
  if (!chrome) return res.status(501).json({ error: "no headless browser found (install Google Chrome)" });
  const rel = String(req.body?.path || "index.html").replace(/^\/+/, "");
  const name = `${crypto.randomBytes(6).toString("hex")}.png`;
  const out = path.join(SHOTS_DIR, name);
  const url = `http://127.0.0.1:${PORT}/preview/${req.params.id}/${rel.split("/").map(encodeURIComponent).join("/")}`;
  execFile(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", `--screenshot=${out}`, "--window-size=1280,900", "--virtual-time-budget=4000", url], { timeout: 30000 }, (err) => {
    if (err || !fs.existsSync(out)) return res.status(500).json({ error: err?.message || "screenshot failed" });
    res.json({ url: `/shots/${name}` });
  });
});
app.use("/shots", express.static(SHOTS_DIR));

// ---------- background processes ----------
app.get("/api/projects/:id/processes", (req, res) => {
  if (!projectDir(req, res)) return;
  res.json(listProcesses());
});
app.post("/api/projects/:id/processes", (req, res) => {
  const dir = projectDir(req, res);
  if (!dir) return;
  const cmd = String(req.body?.cmd || "").trim();
  if (!cmd) return res.status(400).json({ error: "empty command" });
  const rec = startProcess(dir, cmd);
  res.json({ id: rec.id, cmd: rec.cmd, pid: rec.pid, startedAt: rec.startedAt, running: true });
});
app.post("/api/projects/:id/processes/:pid/stop", (req, res) => {
  if (!projectDir(req, res)) return;
  res.json({ ok: stopProcess(req.params.pid) });
});
app.get("/api/projects/:id/processes/:pid/log", (req, res) => {
  if (!projectDir(req, res)) return;
  res.json({ log: tailLog(req.params.pid) });
});

// ---------- outputs & sources ----------
app.get("/api/automations", (req, res) => {
  const out = [];
  for (const t of state.threads) for (const task of t.scheduled || []) {
    out.push({ ...task, threadId: t.id, threadTitle: t.title || "chat", projectId: t.projectId });
  }
  out.sort((a, b) => a.nextRun - b.nextRun);
  res.json(out);
});
app.patch("/api/threads/:id/schedule/:taskId", (req, res) => {
  const t = findThread(req.params.id);
  const task = (t?.scheduled || []).find((x) => x.id === req.params.taskId);
  if (!task) return res.status(404).json({ error: "not found" });
  if (req.body?.enabled !== undefined) task.enabled = !!req.body.enabled;
  if (req.body?.runNow) task.nextRun = Date.now();
  saveNow();
  res.json({ ok: true });
});
app.get("/api/agents", (req, res) => res.json([...BUILTIN_AGENTS, ...(state.agents || [])]));
app.post("/api/agents", (req, res) => {
  const a = {
    id: uid("ag"),
    name: String(req.body?.name || "自定义 Agent").slice(0, 24),
    color: /^#[0-9a-fA-F]{6}$/.test(req.body?.color || "") ? req.body.color : "#7c6df2",
    shape: ["hex", "square", "triangle", "circle", "diamond", "round"].includes(req.body?.shape) ? req.body.shape : "round",
    instructions: String(req.body?.instructions || "").slice(0, 600),
    builtin: false,
  };
  if (!a.instructions) return res.status(400).json({ error: "instructions required" });
  state.agents = state.agents || [];
  state.agents.push(a);
  saveNow();
  res.json(a);
});
app.delete("/api/agents/:id", (req, res) => {
  const i = (state.agents || []).findIndex((a) => a.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: "not found (built-ins cannot be deleted)" });
  state.agents.splice(i, 1);
  saveNow();
  res.json({ ok: true });
});
app.get("/api/artifacts", (req, res) => {
  const projectId = req.query.projectId;
  const out = [];
  for (const t of state.threads) {
    if ((t.product || "codex") !== PRODUCT) continue;
    if (projectId && t.projectId !== projectId) continue;
    for (const ev of t.events) {
      if (ev.type === "file_change" && !ev.reverted) out.push({ path: ev.path, ts: ev.ts, threadId: t.id, threadTitle: t.title || "chat", additions: ev.additions, deletions: ev.deletions });
      else if (ev.type === "preview_ready") out.push({ path: ev.path, ts: ev.ts, threadId: t.id, threadTitle: t.title || "chat", url: ev.url, site: true });
    }
  }
  out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  res.json(out.slice(0, 60));
});
app.get("/api/outputs", (req, res) => {
  const out = [];
  for (const t of state.threads) {
    for (const ev of t.events) {
      if (ev.type === "file_change") out.push({ kind: "file", path: ev.path, ts: ev.ts, thread: t.title || "chat", threadId: t.id });
      else if (ev.type === "preview_ready") out.push({ kind: "site", path: ev.path, url: ev.url, ts: ev.ts, thread: t.title || "chat", threadId: t.id });
    }
  }
  out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  res.json(out.slice(0, 20));
});
app.post("/api/threads/:id/source", (req, res) => {
  const t = findThread(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  const url = String(req.body?.url || "").slice(0, 500);
  if (!url) return res.status(400).json({ error: "empty url" });
  const ev = { type: "source", url, title: String(req.body?.title || "").slice(0, 120), ts: Date.now() };
  t.events.push(ev);
  bus.broadcast(t.id, ev);
  save();
  res.json({ ok: true });
});

// ---------- scheduled tasks ----------
setInterval(() => {
  for (const t of state.threads) {
    for (const task of t.scheduled || []) {
      if (t.status === "running") continue;
      if (Date.now() >= task.nextRun) {
        task.lastRun = Date.now();
        task.nextRun = Date.now() + task.everyMinutes * 60000;
        runTurn(state, t, `[scheduled] ${task.prompt}`).then(() => save()).catch(() => {});
      }
    }
  }
}, 20000);

// ---------- health ----------
app.get("/api/health", (req, res) => res.json({ ok: true, name: "Open Every Agent IDE", product: PRODUCT, version: "0.1.0" }));

app.get("/api/passkey/status", (req, res) => {
  const pk = state.settings.passkey || {};
  const token = String(req.header("x-oea-token") || req.query.token || "");
  res.json({ enabled: !!pk.enabled, unlocked: !pk.enabled || checkToken(token) });
});
app.post("/api/passkey/register-begin", (req, res) => {
  if (state.settings.passkey?.enabled) return res.status(409).json({ error: "already enabled" });
  res.json(registrationOptions("OpenEveryAgent"));
});
app.post("/api/passkey/register-finish", (req, res) => {
  const { credId, coseKey } = req.body || {};
  if (!credId || !coseKey) return res.status(400).json({ error: "missing credential" });
  const pk = (state.settings.passkey = state.settings.passkey || {});
  finishRegistration(pk, credId, coseKey);
  pk.enabled = true;
  saveNow();
  res.json({ ok: true, token: issueToken() });
});
app.post("/api/passkey/auth-begin", (req, res) => res.json(authOptions()));
app.post("/api/passkey/auth-finish", (req, res) => {
  const { credId, authData, clientData, signature } = req.body || {};
  const token = verifyAssertion(state.settings.passkey || {}, String(credId || ""), String(authData || ""), String(clientData || ""), String(signature || ""));
  if (!token) return res.status(401).json({ error: "verification failed" });
  res.json({ ok: true, token });
});
app.delete("/api/passkey", (req, res) => {
  const token = String(req.header("x-oea-token") || req.query.token || "");
  if (state.settings.passkey?.enabled && !checkToken(token)) return res.status(401).json({ error: "locked" });
  revokeToken(token);
  state.settings.passkey = { enabled: false };
  saveNow();
  res.json({ ok: true });
});

app.get("/api/harness", async (req, res) => {
  const available = await opencodeAvailable();
  let models = {};
  if (available && state.projects[0]) {
    try { models = await refreshModelCache(workspacePath(state.projects[0])); } catch {}
  }
  res.json({ available, current: state.settings.harness || "builtin", opencodeModels: models });
});

await bootstrap();
app.listen(PORT, () => console.log(`Open Every Agent IDE backend on http://localhost:${PORT}`));
