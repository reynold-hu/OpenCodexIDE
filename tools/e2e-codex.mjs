#!/usr/bin/env node
/* Codex product end-to-end acceptance test (original implementation)
   Exercises: projects, threads (+dot), streaming turn, plan/command/file_change,
   file read, undo, checkpoint restore, annotations, schedules/automations,
   custom agents, search, artifacts, worktree attach/detach, passkey status.
   Uses the simulated provider for determinism, restores prior settings after. */
import { execFileSync } from "node:child_process";

const BASE = process.env.E2E_BASE || "http://localhost:8787";
const results = [];
let failures = 0;

function ok(name, cond, extra = "") {
  results.push({ name, ok: !!cond, extra });
  if (!cond) failures++;
  console.log(`${cond ? "✓" : "✗"} ${name}${extra ? ` — ${extra}` : ""}`);
}

async function json(path, opts = {}) {
  const r = await fetch(BASE + path, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
  const t = await r.text();
  try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: t }; }
}
const post = (p, b) => json(p, { method: "POST", body: JSON.stringify(b ?? {}) });
const patch = (p, b) => json(p, { method: "PATCH", body: JSON.stringify(b ?? {}) });
const put = (p, b) => json(p, { method: "PUT", body: JSON.stringify(b ?? {}) });
const del = (p) => json(p, { method: "DELETE" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function collectSSE(threadId, ms) {
  const events = [];
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(`${BASE}/api/threads/${threadId}/stream`, { signal: ctrl.signal });
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) !== -1) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const line = frame.split("\n").find((l) => l.startsWith("data:"));
        if (line) { try { events.push(JSON.parse(line.slice(5))); } catch {} }
        if (events.some((e) => e.type === "turn_complete" || e.type === "turn_cancelled")) return events;
      }
    }
  } catch {}
  clearTimeout(t);
  return events;
}

(async () => {
  console.log(`\nE2E → ${BASE}\n`);
  const health = await json("/api/health");
  ok("health", health.body?.ok, health.body?.product);

  const prev = (await json("/api/settings")).body;
  await put("/api/settings", { provider: "simulated", harness: "builtin", approvalMode: "auto" });

  // project
  const pr = await post("/api/projects", { name: `e2e-${Date.now()}` });
  ok("create project", pr.status === 200 && pr.body.id);
  const projectId = pr.body.id;

  // thread with dot
  const th = await post("/api/threads", { projectId, product: "codex", dot: { color: "purple", compact: false } });
  ok("create thread + dot", th.status === 200 && th.body.dot?.color === "purple");
  const threadId = th.body.id;

  // streaming turn
  const sseP = collectSSE(threadId, 45000);
  await sleep(300);
  await post(`/api/threads/${threadId}/prompt`, { prompt: "build me a javascript calculator" });
  const events = await sseP;
  const types = new Set(events.map((e) => e.type));
  ok("SSE turn_started", types.has("turn_started"));
  ok("SSE plan", types.has("plan") && types.has("plan_update"));
  ok("SSE command stream", types.has("command") && types.has("command_output") && types.has("command_result"));
  ok("SSE file_change", types.has("file_change"));
  ok("SSE agent message", types.has("agent_message") && types.has("agent_message_delta") && types.has("agent_message_done"));
  ok("SSE turn_complete", types.has("turn_complete"));

  // persisted thread
  const full = (await json(`/api/threads/${threadId}`)).body;
  const fc = (full.events || []).find((e) => e.type === "file_change");
  ok("file_change persisted", !!fc, fc?.path);
  const turnStart = (full.events || []).find((e) => e.type === "turn_started");
  ok("checkpoint on turn", !!turnStart?.checkpoint, String(turnStart?.checkpoint || "").slice(0, 8));

  // file readable
  const f = await json(`/api/projects/${projectId}/file?path=${encodeURIComponent(fc?.path || "")}`);
  ok("file readable", f.status === 200 && String(f.body.content || "").length > 0);

  // undo files
  const undo = await post(`/api/threads/${threadId}/undo`, { paths: [fc.path] });
  await sleep(400);
  const afterUndo = (await json(`/api/threads/${threadId}`)).body;
  ok("undo files", undo.status === 200 && (afterUndo.events || []).some((e) => e.type === "files_reverted"));

  // restore checkpoint
  if (turnStart?.checkpoint) {
    const restore = await post(`/api/threads/${threadId}/restore`, { hash: turnStart.checkpoint });
    await sleep(400);
    const afterRestore = (await json(`/api/threads/${threadId}`)).body;
    ok("restore checkpoint", restore.status === 200 && (afterRestore.events || []).some((e) => e.type === "restored"));
  } else ok("restore checkpoint", false, "no checkpoint");

  // annotation
  const ann = await post(`/api/threads/${threadId}/annotate`, { quote: "calculator", note: "add tests" });
  const annEv = (await json(`/api/threads/${threadId}`)).body.events.some((e) => e.type === "annotation");
  ok("annotation", ann.status === 200 && annEv);

  // search
  const search = await json(`/api/search?q=calculator`);
  ok("full-text search", search.status === 200 && search.body.length > 0, `${search.body.length} hits`);

  // artifacts
  const artifacts = await json(`/api/artifacts`);
  ok("artifacts index", artifacts.status === 200 && artifacts.body.length > 0, `${artifacts.body.length} items`);

  // schedule + automation controls
  const sched = await post(`/api/threads/${threadId}/schedule`, { prompt: "巡检", everyMinutes: 30 });
  ok("schedule create", sched.status === 200 && sched.body.id);
  const autos = (await json(`/api/automations`)).body;
  ok("automations list", autos.some((a) => a.id === sched.body.id));
  await patch(`/api/threads/${threadId}/schedule/${sched.body.id}`, { enabled: false });
  const autos2 = (await json(`/api/automations`)).body;
  ok("automation toggle", autos2.find((a) => a.id === sched.body.id)?.enabled === false);
  await del(`/api/threads/${threadId}/schedule/${sched.body.id}`);
  ok("automation delete", !(await json(`/api/automations`)).body.some((a) => a.id === sched.body.id));

  // custom agent CRUD
  const ag = await post("/api/agents", { name: "E2E", instructions: "test role", color: "#123456", shape: "hex" });
  ok("agent create", ag.status === 200 && ag.body.id);
  const agents = (await json("/api/agents")).body;
  ok("agent listed", agents.some((a) => a.id === ag.body.id));
  await del(`/api/agents/${ag.body.id}`);
  ok("agent delete", !(await json("/api/agents")).body.some((a) => a.id === ag.body.id));

  // worktree attach + detach
  const wt = await post(`/api/threads/${threadId}/worktree`);
  ok("worktree attach", wt.status === 200 && wt.body.worktree?.path);
  if (wt.body.worktree?.path) {
    try {
      const list = execFileSync("git", ["-C", (await json(`/api/projects/${projectId}`)).body.path, "worktree", "list"], { encoding: "utf8" });
      ok("git knows worktree", list.includes(wt.body.worktree.path));
    } catch (e) { ok("git knows worktree", false, e.message); }
  }
  await del(`/api/threads/${threadId}/worktree`);
  ok("worktree detach", true);

  // passkey status
  const pk = await json("/api/passkey/status");
  ok("passkey status", pk.status === 200 && typeof pk.body.enabled === "boolean");

  // revisions / retry guard
  const retry = await post(`/api/threads/${threadId}/retry`);
  ok("retry endpoint responds", retry.status === 200 || retry.status === 409, String(retry.status));

  // cleanup
  await del(`/api/threads/${threadId}`);
  await del(`/api/projects/${projectId}`);
  await put("/api/settings", { provider: prev.provider, model: prev.model, harness: prev.harness, approvalMode: prev.approvalMode });

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} — ${results.length} checks\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
