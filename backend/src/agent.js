import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { shellExec, writeFileInWorkspace, gitStatus, tree, readFileLimited, ensureWorkspace } from "./workfs.js";
import { workspacePath, save } from "./store.js";
import { chatStream, AGENT_TOOLS } from "./llm.js";
import { effectiveProvider, isRealProvider } from "./providers.js";
import { startProcess } from "./procs.js";

const execFileAsync = promisify(execFile);

const READ_ONLY_CMDS = /^(ls|pwd|whoami|date|echo|cat|head|tail|wc|which|node --version|python3? --version|git (status|log|diff|show|branch)|du|find)\b/;

function uid(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class TurnBus {
  constructor() {
    this.subs = new Map();
    this.pendingApprovals = new Map();
  }

  subscribe(threadId, res) {
    if (!this.subs.has(threadId)) this.subs.set(threadId, new Set());
    this.subs.get(threadId).add(res);
    const remove = () => this.subs.get(threadId)?.delete(res);
    res.on("close", remove);
    return remove;
  }

  broadcast(threadId, event) {
    const set = this.subs.get(threadId);
    if (!set) return;
    const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const res of set) {
      try {
        res.write(payload);
      } catch {}
    }
  }

  requestApproval(threadId, command, cwd) {
    const id = uid("appr");
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingApprovals.delete(id);
        resolve({ decision: "timeout" });
      }, 120000);
      this.pendingApprovals.set(id, { threadId, command, resolve: (decision) => { clearTimeout(timer); this.pendingApprovals.delete(id); resolve({ decision }); } });
      this.broadcast(threadId, { type: "approval_request", id, command, cwd, ts: Date.now() });
    });
  }

  resolveApproval(id, decision) {
    const p = this.pendingApprovals.get(id);
    if (!p) return false;
    p.resolve(decision);
    return true;
  }
}

export const bus = new TurnBus();

const activeTurns = new Map(); // threadId -> { aborted, child, llmAbort }

export function cancelTurn(threadId) {
  const t = activeTurns.get(threadId);
  if (!t) return false;
  t.aborted = true;
  try { t.llmAbort?.abort(); } catch {}
  try {
    t.child?.kill("SIGTERM");
    setTimeout(() => { try { t.child?.kill("SIGKILL"); } catch {} }, 1500);
  } catch {}
  return true;
}

function pushEvent(state, thread, event) {
  thread.events.push(event);
  bus.broadcast(thread.id, event);
}

async function runCommand(state, thread, cmd, opts = {}) {
  const dir = workspacePath(threadProject(state, thread));
  const id = uid("cmd");
  const settings = state.settings;
  const mode = thread.approvalMode || settings.approvalMode;
  const mutating = opts.mutating !== false && !READ_ONLY_CMDS.test(cmd.trim());

  if (mode === "read-only" && mutating) {
    pushEvent(state, thread, { type: "command", id, cmd, status: "denied", reason: "read-only mode", ts: Date.now() });
    return { skipped: true, reason: "read-only mode" };
  }
  if (mode === "ask" && mutating) {
    pushEvent(state, thread, { type: "command", id, cmd, status: "awaiting_approval", ts: Date.now() });
    const { decision } = await bus.requestApproval(thread.id, cmd, dir);
    const ev = thread.events.find((e) => e.type === "command" && e.id === id);
    if (decision !== "approve") {
      if (ev) Object.assign(ev, { status: "denied", reason: decision === "timeout" ? "no response" : "denied by user" });
      bus.broadcast(thread.id, { type: "command_update", id, status: ev.status, reason: ev.reason });
      return { skipped: true, reason: ev.reason };
    }
    if (ev) Object.assign(ev, { status: "running" });
    bus.broadcast(thread.id, { type: "command_update", id, status: "running" });
  } else {
    pushEvent(state, thread, { type: "command", id, cmd, status: "running", ts: Date.now() });
  }
  const t0 = Date.now();
  const turn = activeTurns.get(thread.id);
  const ctl = turn || {};
  const { code, stdout, stderr } = await shellExec(dir, cmd, 15000, (chunk) => {
    bus.broadcast(thread.id, { type: "command_output", id, chunk: String(chunk).slice(0, 4000) });
  }, ctl);
  if (turn?.aborted) {
    pushEvent(state, thread, { type: "command_result", id, code: 130, output: ((stdout || "") + "\n[cancelled]").slice(0, 20000), durationMs: Date.now() - t0, status: "failed", ts: Date.now() });
    return { skipped: true, reason: "cancelled" };
  }
  const dur = Date.now() - t0;
  const merged = (stdout + (stderr ? (stdout ? "\n" : "") + stderr : "")).slice(0, 20000);
  pushEvent(state, thread, { type: "command_result", id, code, output: merged, durationMs: dur, status: code === 0 ? "success" : "failed", ts: Date.now() });
  return { skipped: false, code, output: merged };
}

async function streamMessage(state, thread, text, kind = "agent_message") {
  const id = uid(kind);
  pushEvent(state, thread, { type: kind, id, content: "", done: false, ts: Date.now() });
  const chunkSize = 14;
  for (let i = 0; i < text.length; i += chunkSize) {
    if (activeTurns.get(thread.id)?.aborted) break;
    await sleep(18);
    bus.broadcast(thread.id, { type: `${kind}_delta`, id, content: text.slice(i, i + chunkSize) });
  }
  const ev = thread.events.find((e) => e.id === id);
  if (ev) {
    ev.content = text;
    ev.done = true;
  }
  bus.broadcast(thread.id, { type: `${kind}_done`, id, content: text });
}

function threadProject(state, thread) {
  return state.projects.find((p) => p.id === thread.projectId) || state.projects[0];
}

async function emitFileChange(state, thread, dir, relPath, content) {
  const result = writeFileInWorkspace(dir, relPath, content);
  const { stdout } = await execFileAsync("git", ["diff", "--no-color"], { cwd: dir, maxBuffer: 2 * 1024 * 1024 }).catch(() => ({ stdout: "" }));
  let patch = stdout;
  if (result.existed === false) {
    const u = await execFileAsync("git", ["diff", "--no-color", "--cached", "--", relPath], { cwd: dir }).catch(() => null);
    patch = u?.stdout || `new file ${relPath}\n${content.split("\n").map((l) => "+" + l).join("\n")}`;
  }
  const additions = patch.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).length;
  const deletions = patch.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---")).length;
  pushEvent(state, thread, { type: "file_change", path: relPath, additions, deletions, patch: patch.slice(0, 30000), ts: Date.now() });
}

function detectTask(prompt) {
  const p = prompt.toLowerCase();
  const fileMatch = prompt.match(/([A-Za-z0-9_./-]+\.[a-zA-Z0-9]{1,6})/);
  if (/\b(create|write|add|make|implement|build|fix|update|change|edit|refactor)\b/.test(p) || /(做|创建|写|生成|实现|构建|新建|添加|修改|修复|开发)/.test(prompt)) return "create";
  if (/\b(list|show)\b.*\b(files?|content|directory|dir)\b|^ls\b|what files/i.test(p) || /(列出|查看).*(文件|目录)/.test(prompt)) return "list";
  if (/\b(git status|git log|branch)\b/.test(p) || /git\s*(状态|日志)/.test(p)) return "git";
  if ((/\b(read|open|show)\b/.test(p) || /(读取|打开|看看)/.test(prompt)) && fileMatch) return "read";
  return "inspect";
}

function genCodeForPrompt(prompt) {
  const p = prompt.toLowerCase();
  if (p.includes("calculator")) {
    return {
      file: "calculator.js",
      content: `// calculator.js — generated by OpenCodex
function calc(a, op, b) {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": return b === 0 ? "Error: division by zero" : a / b;
    default: throw new Error("unknown operator " + op);
  }
}

if (process.argv[1].endsWith("calculator.js")) {
  const [a, op, b] = process.argv.slice(2);
  console.log(calc(Number(a), op, Number(b)));
}

module.exports = { calc };
`,
      summary: "I added `calculator.js` implementing `calc(a, op, b)` with support for `+ - * /`, guarding division by zero, and a small CLI entry point (`node calculator.js 8 '*' 7`).",
    };
  }
  if (p.includes("todo") || p.includes("task")) {
    return {
      file: "todo.py",
      content: `# todo.py — generated by OpenCodex
import json, sys, pathlib

STORE = pathlib.Path(__file__).with_name("todos.json")


def load():
    if STORE.exists():
        return json.loads(STORE.read_text())
    return []


def save(items):
    STORE.write_text(json.dumps(items, indent=2))


def add(title):
    items = load()
    items.append({"title": title, "done": False})
    save(items)
    print(f"added: {title}")


def done(idx):
    items = load()
    items[int(idx) - 1]["done"] = True
    save(items)
    print(f"completed: {items[int(idx) - 1]['title']}")


def show():
    for i, it in enumerate(load(), 1):
        mark = "x" if it["done"] else " "
        print(f"[{mark}] {i}. {it['title']}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "show"
    if cmd == "add":
        add(" ".join(sys.argv[2:]))
    elif cmd == "done":
        done(sys.argv[2])
    else:
        show()
`,
      summary: "I created `todo.py`, a tiny CLI todo list (`python3 todo.py add \"...\"`, `python3 todo.py done 1`, `python3 todo.py show`) backed by a local `todos.json` file.",
    };
  }
  if (/\b(readme|docs?|document)\b/.test(p)) {
    const title = prompt.replace(/[^A-Za-z0-9 ]/g, "").trim().slice(0, 40) || "Project Notes";
    return {
      file: "docs/NOTES.md",
      content: `# ${title || "Project Notes"}

Generated by OpenCodex IDE.

## Overview
This document was produced from your prompt:

> ${prompt.trim()}

## Next steps
- Review the draft below and refine wording.
- Add usage examples for your audience.
`,
      summary: "I drafted `docs/NOTES.md` from your prompt. You can refine it — ask me to expand any section.",
    };
  }
  if (/\b(dashboard|website|site|landing|html|visuali[sz]|chart)\b/.test(p) || /(看板|网页|页面|可视化|图表|仪表盘)/.test(prompt)) {
    return {
      file: "site/index.html",
      preview: true,
      content: `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>个人看板 · OpenCodex</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: -apple-system, "PingFang SC", sans-serif; background: #f6f6f4; color: #2d2d2b; padding: 32px; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .sub { color: #939391; font-size: 13px; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 24px; }
  .card { background: #fff; border: 1px solid #e8e8e4; border-radius: 14px; padding: 16px; }
  .card .k { font-size: 12px; color: #939391; }
  .card .v { font-size: 24px; font-weight: 700; margin-top: 6px; }
  .card .d { font-size: 12px; margin-top: 4px; color: #00a844; }
  .card .d.neg { color: #e04a2f; }
  ul.list { background: #fff; border: 1px solid #e8e8e4; border-radius: 14px; padding: 16px 16px 16px 34px; }
  ul.list li { margin: 6px 0; font-size: 14px; }
  .bar { height: 8px; border-radius: 4px; background: #eee; margin-top: 10px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: linear-gradient(90deg, #cc7d5e, #ff5f38); }
</style>
</head>
<body>
  <h1>个人看板</h1>
  <div class="sub">由 OpenCodex IDE 生成 · <span id="date"></span></div>
  <div class="grid">
    <div class="card"><div class="k">总资产</div><div class="v">¥128,450</div><div class="d">+2.1% 本月</div></div>
    <div class="card"><div class="k">月度基线</div><div class="v">¥11,000</div><div class="d">无变化</div></div>
    <div class="card"><div class="k">待办</div><div class="v">3 / 7</div><div class="d neg">-2 较上周</div><div class="bar"><i style="width:43%"></i></div></div>
    <div class="card"><div class="k">习惯打卡</div><div class="v">12 天</div><div class="d">连续中</div><div class="bar"><i style="width:80%"></i></div></div>
  </div>
  <ul class="list">
    <li>10 号信用卡账单已核对</li>
    <li>25 号花呗还款计划保持不变</li>
    <li>账户快照与图标风格已统一</li>
    <li>日期、还款周期和 ¥11,000 月度基线都没有变化</li>
  </ul>
  <script>document.getElementById("date").textContent = new Date().toLocaleDateString("zh-CN");</script>
</body>
</html>
`,
      summary: "新版已验证：网页看板已生成，要点如下：\n\n- 10 号账单与 25 号还款计划保持不变\n- 两行账户快照使用统一的图标风格与尺寸\n- 日期、还款周期和 ¥11,000 月度基线都没有变化\n\n[查看预览](preview:site/index.html)。",
    };
  }
  if (/\b(server|api|http)\b/.test(p)) {
    return {
      file: "server.js",
      content: `// server.js — generated by OpenCodex
const http = require("http");

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Hello from OpenCodex workspace\\n");
});

const port = process.env.PORT || 3456;
server.listen(port, () => console.log("listening on", port));
`,
      summary: "I created `server.js`, a minimal HTTP server with a `/health` endpoint (`node server.js`, then `curl localhost:3456/health`).",
    };
  }
  const slug = (prompt.toLowerCase().match(/[a-z0-9]+/g) || ["scratch", "note"]).slice(0, 4).join("-");
  return {
    file: `notes/${slug}.md`,
    content: `# ${slug}\n\nTask: ${prompt.trim()}\n\n## Plan\n- Inspect the current workspace.\n- Draft an implementation sketch.\n- Iterate with follow-up prompts.\n\n## Draft\n\n_(Generated by OpenCodex — refine me with a follow-up prompt.)_\n`,
    summary: "I captured the request as `notes/${slug}.md` with a starter plan. Tell me what to implement first and I'll scaffold the code.",
  };
}

async function gateFileChange(state, thread, dir, relPath, content) {
  const mode = thread.approvalMode || state.settings.approvalMode;
  if (mode === "read-only") {
    pushEvent(state, thread, { type: "file_change_denied", path: relPath, reason: "read-only mode", ts: Date.now() });
    return false;
  }
  if (mode === "ask") {
    const id = uid("cmd");
    pushEvent(state, thread, { type: "command", id, cmd: `apply changes: ${relPath}`, status: "awaiting_approval", ts: Date.now() });
    const { decision } = await bus.requestApproval(thread.id, `Apply changes to ${relPath}`, dir);
    const ev = thread.events.find((e) => e.type === "command" && e.id === id);
    if (decision !== "approve") {
      if (ev) Object.assign(ev, { status: "denied", reason: decision === "timeout" ? "no response" : "denied by user" });
      bus.broadcast(thread.id, { type: "command_update", id, status: ev.status, reason: ev.reason });
      return false;
    }
    if (ev) Object.assign(ev, { status: "running" });
    bus.broadcast(thread.id, { type: "command_update", id, status: "running" });
  }
  await emitFileChange(state, thread, dir, relPath, content);
  return true;
}

function transcriptFromEvents(events, limit = 20) {
  const msgs = [];
  let cur = null;
  for (const ev of events) {
    if (ev.type === "turn_started") cur = { role: "user", content: ev.prompt };
    else if (ev.type === "agent_message" && ev.done && cur) {
      msgs.push(cur);
      msgs.push({ role: "assistant", content: ev.content });
      cur = null;
    } else if (ev.type === "command_result" && msgs.length) {
      const last = msgs[msgs.length - 1];
      const cmdEv = events.find((e) => e.type === "command" && e.id === ev.id);
      const line = `[ran: ${cmdEv?.cmd || "?"} → exit ${ev.code}]`;
      if (last.role === "assistant") last.content = `${last.content}\n${line}`.slice(-4000);
    }
  }
  return msgs.slice(-limit).map((m) => ({ ...m, content: String(m.content || "").slice(0, 6000) }));
}

const REAL_SYSTEM_PROMPT = (dir, projectName, model) => `You are OpenCodex, the autonomous coding agent of OpenCodex IDE — a self-hosted web IDE that fuses the Codex-style agentic UX with opencode-style bring-your-own-provider design. You are NOT "Codex" and NOT an official OpenAI product; if asked about your identity, describe yourself as OpenCodex, this IDE's built-in agent.
Workspace root: ${dir} (project "${projectName}"). All file paths are relative to it. Commands run with bash in that directory.
Model: ${model}.
Rules:
- Start non-trivial tasks with the update_plan tool, and keep it updated as steps finish.
- Use read_file / run_command to inspect before editing. Use write_file to create or fully rewrite files (showing the diff is automatic).
- Keep shell commands short and non-interactive. Never print secrets.
- For dev servers or anything long-running use run_background, never block run_command with "&" style servers.
- When you consult or mention an external website/repo/doc, record it with add_source so the user sees it in 来源.
- For broad exploration ("what is this repo", research across many files), delegate to run_subagent to keep your context lean.
- When done, reply with a concise markdown summary of what you changed and how to verify it.
- Do not wrap your final answer in code fences.`;

const SUB_SYSTEM_PROMPT = (dir) => `You are a research subagent of OpenCodex IDE. Workspace: ${dir}.
Inspect with read-only tools (run_command for ls/cat/git log, read_file). Do not modify files.
Finish with a concise factual summary (max 300 words) of what you found.`;

async function runSubAgent(provider, dir, task) {
  const subTools = AGENT_TOOLS.filter((t) => ["run_command", "read_file"].includes(t.function.name));
  const messages = [
    { role: "system", content: SUB_SYSTEM_PROMPT(dir) },
    { role: "user", content: task },
  ];
  for (let i = 0; i < 3; i++) {
    const r = await chatStream({ baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model, messages, tools: subTools });
    messages.push({
      role: "assistant",
      content: r.content || null,
      ...(r.toolCalls.length
        ? { tool_calls: r.toolCalls.map((t, j) => ({ id: t.id || `sub${i}_${j}`, type: "function", function: { name: t.name, arguments: t.args } })) }
        : {}),
    });
    if (!r.toolCalls.length) return r.content || "(no summary)";
    for (const tc of r.toolCalls) {
      let args = {};
      try {
        args = JSON.parse(tc.args || "{}");
      } catch {}
      let out;
      if (tc.name === "run_command") {
        const r2 = await shellExec(dir, String(args.command || "ls").slice(0, 500), 15000);
        out = `exit ${r2.code}\n${(r2.stdout + r2.stderr).slice(0, 8000)}`;
      } else {
        try {
          out = readFileLimited(dir, String(args.path || "")).content.slice(0, 12000);
        } catch (e) {
          out = `error: ${e.message}`;
        }
      }
      messages.push({ role: "tool", tool_call_id: tc.id || "", name: tc.name, content: out });
    }
  }
  return "(subagent reached step limit)";
}

async function streamLLMAgentMessage(state, thread) {
  const id = uid("agent_message");
  let created = false;
  let full = "";
  const ensure = () => {
    if (created) return;
    created = true;
    pushEvent(state, thread, { type: "agent_message", id, content: "", done: false, ts: Date.now() });
  };
  return {
    id,
    onDelta: (t) => {
      ensure();
      full += t;
      bus.broadcast(thread.id, { type: "agent_message_delta", id, content: t });
    },
    finish: (finalText) => {
      if (!created && !finalText) return;
      ensure();
      full = finalText || full;
      const ev = thread.events.find((e) => e.id === id);
      if (ev) {
        ev.content = full;
        ev.done = true;
      }
      bus.broadcast(thread.id, { type: "agent_message_done", id, content: full });
    },
  };
}

async function runTurnReal(state, thread, prompt, provider, dirIn, displayPrompt) {
  const project = threadProject(state, thread);
  const dir = dirIn || workspacePath(project);
  thread.status = "running";
  pushEvent(state, thread, { type: "turn_started", prompt: displayPrompt || prompt, ts: Date.now() });
  await sleep(150);

  let planId = null;
  const history = transcriptFromEvents(thread.events.slice(0, -1));
  const messages = [
    { role: "system", content: REAL_SYSTEM_PROMPT(dir, project.name, provider.model) },
    ...(thread.compactNote ? [{ role: "system", content: thread.compactNote }] : []),
    ...history,
    { role: "user", content: prompt },
  ];

  const runTool = async (tc) => {
    let args = {};
    try {
      args = JSON.parse(tc.args || "{}");
    } catch {
      return `invalid tool arguments json: ${tc.args?.slice(0, 200)}`;
    }
    switch (tc.name) {
      case "update_plan": {
        const items = (args.items || []).map((t) => ({ title: String(t).slice(0, 120), done: false }));
        if (planId) {
          const ev = thread.events.find((e) => e.id === planId);
          if (ev) {
            ev.items = items;
            bus.broadcast(thread.id, { type: "plan_update", id: planId, items });
            return "plan updated";
          }
        }
        planId = uid("plan");
        pushEvent(state, thread, { type: "plan", id: planId, items, ts: Date.now() });
        return "plan published";
      }
      case "run_command": {
        const cmd = String(args.command || "").slice(0, 2000);
        if (!cmd) return "empty command";
        const r = await runCommand(state, thread, cmd);
        if (r.skipped) return `command not run: ${r.reason}`;
        return `exit ${r.code}\n${r.output.slice(0, 12000)}`;
      }
      case "write_file": {
        const rel = String(args.path || "").replace(/^\/+/, "").slice(0, 300);
        if (!rel) return "empty path";
        const ok = await gateFileChange(state, thread, dir, rel, String(args.content ?? ""));
        return ok ? `applied ${rel}` : `change to ${rel} was denied`;
      }
      case "read_file": {
        const rel = String(args.path || "").replace(/^\/+/, "").slice(0, 300);
        try {
          const f = readFileLimited(dir, rel);
          return f.truncated ? `[file too large: ${f.size} bytes]` : f.content.slice(0, 16000);
        } catch (e) {
          return `read error: ${e.message}`;
        }
      }
      case "run_background": {
        const cmd = String(args.command || "").slice(0, 1000);
        if (!cmd) return "empty command";
        const rec = startProcess(dir, cmd);
        pushEvent(state, thread, { type: "process", id: rec.id, cmd: rec.cmd, pid: rec.pid, ts: Date.now() });
        return `background process started (id ${rec.id}, pid ${rec.pid})`;
      }
      case "add_source": {
        const url = String(args.url || "").slice(0, 500);
        if (!url) return "empty url";
        pushEvent(state, thread, { type: "source", url, title: String(args.title || "").slice(0, 120), ts: Date.now() });
        return "source recorded";
      }
      case "run_subagent": {
        const task = String(args.prompt || "").slice(0, 2000);
        if (!task) return "empty task";
        const id = uid("sub");
        pushEvent(state, thread, { type: "subagent", id, prompt: task.slice(0, 200), done: false, ts: Date.now() });
        let summary;
        try {
          summary = await runSubAgent(provider, dir, task);
        } catch (e) {
          summary = `subagent failed: ${e.message}`;
        }
        const ev = thread.events.find((e) => e.id === id);
        if (ev) ev.done = true;
        bus.broadcast(thread.id, { type: "subagent_update", id, done: true });
        return String(summary).slice(0, 4000);
      }
      default:
        return `unknown tool ${tc.name}`;
    }
  };

  for (let step = 0; step < 15; step++) {
    const turn = activeTurns.get(thread.id);
    if (turn?.aborted) {
      thread.status = "idle";
      save();
      return;
    }
    const msg = await streamLLMAgentMessage(state, thread);
    let result;
    try {
      const llmAbort = new AbortController();
      if (turn) turn.llmAbort = llmAbort;
      result = await chatStream(
        { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model, messages, tools: AGENT_TOOLS },
        msg.onDelta,
        llmAbort.signal
      );
    } catch (e) {
      if (e.name === "AbortError" || activeTurns.get(thread.id)?.aborted) {
        msg.finish("");
        thread.status = "idle";
        save();
        return;
      }
      msg.finish(`⚠️ ${e.message}`);
      bus.broadcast(thread.id, { type: "turn_error", message: e.message });
      thread.status = "idle";
      save();
      return;
    }
    const text = result.content || "";
    msg.finish(result.content || "");
    messages.push({
      role: "assistant",
      content: result.content || null,
      ...(result.toolCalls.length
        ? { tool_calls: result.toolCalls.map((t, i) => ({ id: t.id || `call_${i}`, type: "function", function: { name: t.name, arguments: t.args } })) }
        : {}),
    });
    if (!result.toolCalls.length) break;
    for (const tc of result.toolCalls) {
      const out = await runTool(tc);
      messages.push({ role: "tool", tool_call_id: tc.id || "", name: tc.name, content: String(out).slice(0, 16000) });
    }
    if (text || result.toolCalls.length) save();
  }

  thread.status = "idle";
  if (!thread.title) thread.title = prompt.trim().slice(0, 42) || "New chat";
  pushEvent(state, thread, { type: "turn_complete", usage: {}, ts: Date.now() });
  save();
}


async function expandMentions(dir, prompt) {
  const mentions = [...prompt.matchAll(/@([A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,8})/g)].map((m) => m[1]);
  if (!mentions.length) return prompt;
  let extra = "";
  for (const rel of mentions.slice(0, 6)) {
    try {
      const f = readFileLimited(dir, rel);
      if (!f.truncated) extra += `\n\n[context @${rel}]\n\`\`\`\n${f.content.slice(0, 8000)}\n\`\`\``;
      else extra += `\n\n[context @${rel}: file too large (${f.size} bytes)]`;
    } catch {
      extra += `\n\n[context @${rel}: not found]`;
    }
  }
  return prompt + extra;
}

async function runSlashCommand(state, thread, dir, prompt) {
  const [cmd, ...rest] = prompt.trim().split(/\s+/);
  const name = cmd.toLowerCase();
  if (name === "/status") {
    pushEvent(state, thread, { type: "turn_started", prompt, ts: Date.now() });
    const changes = await gitStatus(dir);
    const files = tree(dir, ".", 2).filter((f) => !f.dir).length;
    await streamMessage(state, thread, `**工作区状态**\n\n- 文件数:${files}\n- 未提交变更:${changes.length ? changes.map((c) => `\`${c.file}\``).join(", ") : "无"}\n- 模型:${thread.model || state.settings.model} · 审批:${thread.approvalMode || state.settings.approvalMode}`);
    pushEvent(state, thread, { type: "turn_complete", ts: Date.now() });
    return true;
  }
  if (name === "/model" && rest[0]) {
    pushEvent(state, thread, { type: "turn_started", prompt, ts: Date.now() });
    thread.model = rest[0];
    await streamMessage(state, thread, `已切换模型为 \`${rest[0]}\`。`);
    pushEvent(state, thread, { type: "turn_complete", ts: Date.now() });
    return true;
  }
  if (name === "/init") {
    pushEvent(state, thread, { type: "turn_started", prompt, ts: Date.now() });
    const existing = tree(dir, ".", 1).some((f) => f.name === "AGENTS.md");
    if (existing) {
      await streamMessage(state, thread, "`AGENTS.md` 已存在,未覆盖。");
    } else {
      await gateFileChange(state, thread, dir, "AGENTS.md", `# ${thread.title || "Project"}\n\n## Conventions\n- 语言/框架:\n- 测试命令:\n- 代码风格:\n\n## Notes\n\n(由 OpenCodex /init 生成,请补充)\n`);
      await streamMessage(state, thread, "已创建 `AGENTS.md` 骨架,填入项目约定后 agent 会遵守它们。");
    }
    pushEvent(state, thread, { type: "turn_complete", ts: Date.now() });
    return true;
  }
  if (name === "/compact") {
    pushEvent(state, thread, { type: "turn_started", prompt, ts: Date.now() });
    const msgs = transcriptFromEvents(thread.events.slice(0, -1), 40);
    const digest = msgs.map((m) => `${m.role}: ${String(m.content).slice(0, 200)}`).join("\n").slice(0, 3000);
    thread.compactNote = `Earlier conversation summary:\n${digest}`;
    await streamMessage(state, thread, "已压缩上下文:较早对话将以内置摘要形式携带,后续请求更省 token。");
    pushEvent(state, thread, { type: "turn_complete", ts: Date.now() });
    return true;
  }
  return false;
}

export async function runTurn(state, thread, prompt) {
  const provider = effectiveProvider(state);
  const project = threadProject(state, thread);
  if (!project) throw new Error("no project");
  const dir = await ensureWorkspaceExists(state, project);

  activeTurns.set(thread.id, { aborted: false, child: null, llmAbort: null });
  try {
    if (prompt.trim().startsWith("/")) {
      const handled = await runSlashCommand(state, thread, dir, prompt);
      if (handled) return;
    }
    const expanded = await expandMentions(dir, prompt);
    if (isRealProvider(provider)) {
      return await runTurnReal(state, thread, expanded, provider, dir, prompt);
    }
    if (provider.id !== "simulated") {
      thread.status = "running";
      pushEvent(state, thread, { type: "turn_started", prompt, ts: Date.now() });
      pushEvent(state, thread, { type: "turn_error", message: `Provider "${provider.label}" selected but API key or base URL is missing — configure it in Settings.`, ts: Date.now() });
      thread.status = "idle";
      return;
    }
    return await runSimulatedTurn(state, thread, expanded, dir, prompt);
  } finally {
    activeTurns.delete(thread.id);
  }
}

async function runSimulatedTurn(state, thread, prompt, dir, displayPrompt) {
  const task = detectTask(prompt);
  const planId = uid("plan");

  thread.status = "running";
  pushEvent(state, thread, { type: "turn_started", prompt: displayPrompt || prompt, ts: Date.now() });
  await sleep(220);

  const plans = {
    list: ["List the workspace files", "Summarize the project layout"],
    git: ["Run git status", "Report branch and pending changes"],
    read: ["Locate the requested file", "Read its contents", "Summarize findings"],
    create: ["Inspect the workspace", `Implement: ${prompt.slice(0, 48)}`, "Apply the change and show the diff", "Verify the result"],
    inspect: ["Inspect the workspace", "Analyze the request", "Draft a response"],
  }[task];

  pushEvent(state, thread, { type: "plan", id: planId, items: plans.map((t) => ({ title: t, done: false })), ts: Date.now() });
  await sleep(300);

  const setPlan = (idx, done) => {
    const ev = thread.events.find((e) => e.id === planId);
    ev.items[idx].done = done;
    bus.broadcast(thread.id, { type: "plan_update", id: planId, items: ev.items });
  };

  if (task === "list") {
    setPlan(0, true);
    await runCommand(state, thread, "ls -la");
    setPlan(0, true);
    const entries = fs.readdirSync(dir).filter((f) => !f.startsWith("."));
    setPlan(1, true);
    await streamMessage(state, thread, `This workspace has ${entries.length} top-level item(s): ${entries.map((e) => `\`${e}\``).join(", ")}. Want me to dig into any of them?`);
  } else if (task === "git") {
    setPlan(0, true);
    await runCommand(state, thread, "git status --short && git branch --show-current");
    setPlan(1, true);
    const changes = await gitStatus(dir);
    await streamMessage(state, thread, changes.length ? `There ${changes.length === 1 ? "is" : "are"} ${changes.length} uncommitted change(s): ${changes.map((c) => `\`${c.file}\``).join(", ")}. I can stage and commit them for you.` : "The working tree is clean — nothing pending. Current branch looks good.");
  } else if (task === "read") {
    const file = prompt.match(/[A-Za-z0-9_./-]+\.[a-zA-Z0-9]{1,6}/)?.[0] || "README.md";
    setPlan(0, true);
    const r = await runCommand(state, thread, `cat ${JSON.stringify(file)}`);
    setPlan(1, true);
    const out = (r.output || "").trim();
    setPlan(2, true);
    await streamMessage(state, thread, out ? `Here's \`${file}\`:\n\n\`\`\`\n${out.slice(0, 1200)}\n\`\`\`\n\nAnything you'd like me to change in it?` : `\`${file}\` looks empty or missing in this workspace.`);
  } else if (task === "create") {
    setPlan(0, true);
    await runCommand(state, thread, "ls");
    const subId = uid("sub");
    pushEvent(state, thread, { type: "subagent", id: subId, prompt: `调研任务:${prompt.slice(0, 60)}`, done: true, ts: Date.now() });
    setPlan(1, true);
    await sleep(400);
    const gen = genCodeForPrompt(prompt);
    const applied = await gateFileChange(state, thread, dir, gen.file, gen.content);
    setPlan(2, true);
    setPlan(3, true);
    if (applied && gen.preview) {
      const project = threadProject(state, thread);
      pushEvent(state, thread, { type: "preview_ready", path: gen.file, url: `/preview/${project.id}/${gen.file}`, ts: Date.now() });
    }
    const verifyCmd = gen.file.endsWith(".js") ? `node --check ${gen.file} && echo OK` : gen.file.endsWith(".py") ? `python3 -m py_compile ${gen.file} && echo OK` : `head -20 ${gen.file}`;
    if (applied) {
      await runCommand(state, thread, verifyCmd, { mutating: false });
    }
    await streamMessage(state, thread, applied ? gen.summary : `You declined the change to \`${gen.file}\`. Tell me what to adjust and I'll retry.`);
  } else {
    setPlan(0, true);
    await runCommand(state, thread, "ls && git status --short");
    setPlan(1, true);
    await sleep(350);
    const gen = genCodeForPrompt(prompt);
    const applied2 = await gateFileChange(state, thread, dir, gen.file, gen.content);
    setPlan(2, true);
    if (applied2 && gen.preview) {
      const project = threadProject(state, thread);
      pushEvent(state, thread, { type: "preview_ready", path: gen.file, url: `/preview/${project.id}/${gen.file}`, ts: Date.now() });
    }
    await streamMessage(state, thread, applied2 ? gen.summary : `You declined the change to \`${gen.file}\`. Tell me what to adjust and I'll retry.`);
  }

  if (activeTurns.get(thread.id)?.aborted) {
    thread.status = "idle";
    return;
  }
  thread.status = "idle";
  if (!thread.title) {
    thread.title = prompt.trim().slice(0, 42) || "New chat";
  }
  pushEvent(state, thread, { type: "turn_complete", usage: { input_tokens: prompt.length / 3 | 0, output_tokens: 64 + Math.random() * 200 | 0 }, ts: Date.now() });
}

async function ensureWorkspaceExists(state, project) {
  return ensureWorkspace(project);
}
