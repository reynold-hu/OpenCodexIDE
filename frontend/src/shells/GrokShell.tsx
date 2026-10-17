/* Grok-Bot-style agent-team surface: roster → dispatch → task feed + automations. Original implementation. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Block, Settings, ThreadMeta } from "../types";
import { blocksFromEvents } from "../lib/blocks";
import { Composer } from "../components/Composer";
import { BlockView } from "../components/Blocks";
import { AgentAvatar } from "../components/AgentAvatar";
import { AgentRoster } from "../components/AgentRoster";
import { CloudPanel } from "../components/CloudPanel";
import { IconGear, IconX, IconPlus } from "../icons";

type Page = "tasks" | "dispatch" | "team" | "automations" | "cloud";

export default function GrokShell() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [models, setModels] = useState<any[]>([]);
  const [project, setProject] = useState<any>(null);
  const [threads, setThreads] = useState<ThreadMeta[]>([]);
  const [thread, setThread] = useState<ThreadMeta | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [running, setRunning] = useState(false);
  const [input, setInput] = useState("");
  const [agents, setAgents] = useState<any[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [page, setPage] = useState<Page>("dispatch");
  const [automations, setAutomations] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => { document.documentElement.setAttribute("data-app", "grok"); }, []);
  useEffect(() => {
    if (!settings) return;
    const want = settings.theme === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : settings.theme;
    document.documentElement.setAttribute("data-theme", want);
  }, [settings]);

  useEffect(() => {
    Promise.all([api.settings(), api.models(), api.projects(), api.agents(), api.providers()]).then(([s, m, p, ag, pr]) => {
      setSettings(s); setModels(m); setAgents(ag); setProviders(pr);
      if (p[0]) setProject(p[0]); else api.createProject("bots").then(setProject);
    });
  }, []);
  useEffect(() => { if (project) api.threads(project.id, "grok").then(setThreads).catch(() => {}); }, [project?.id]);
  useEffect(() => {
    if (page !== "automations") return;
    api.automations().then(setAutomations).catch(() => {});
    const iv = setInterval(() => api.automations().then(setAutomations).catch(() => {}), 5000);
    return () => clearInterval(iv);
  }, [page]);

  const handleEvent = useCallback((ev: any) => {
    switch (ev.type) {
      case "turn_started": setRunning(true); setBlocks((b) => [...b, { kind: "prompt", text: ev.prompt, ts: ev.ts }]); break;
      case "swarm_started": setBlocks((b) => [...b, { kind: "swarm", id: ev.id, task: ev.task, agents: ev.agents, done: false }]); break;
      case "swarm_agent": setBlocks((b) => b.map((x) => x.kind === "swarm" && x.id === ev.id ? { ...x, agents: x.agents.map((a) => a.agentId === ev.agentId ? { ...a, status: ev.status ?? a.status, summary: ev.summary ?? a.summary } : a) } : x)); break;
      case "swarm_done": setBlocks((b) => b.map((x) => x.kind === "swarm" && x.id === ev.id ? { ...x, done: true } : x)); break;
      case "command": setBlocks((b) => [...b, { kind: "command", id: ev.id, cmd: ev.cmd, status: ev.status, risk: ev.risk }]); break;
      case "command_result": setBlocks((b) => b.map((x) => (x.kind === "command" && x.id === ev.id ? { ...x, status: ev.status, output: ev.output, code: ev.code, durationMs: ev.durationMs } : x))); break;
      case "approval_request": setBlocks((b) => b.map((x) => (x.kind === "command" && x.status === "awaiting_approval" ? { ...x, approvalId: ev.id, expiresAt: ev.expiresAt } : x))); break;
      case "agent_message": setBlocks((b) => [...b, { kind: "agent_message", id: ev.id, text: "", done: false, ts: ev.ts }]); break;
      case "agent_message_delta": setBlocks((b) => b.map((x) => (x.kind === "agent_message" && x.id === ev.id ? { ...x, text: x.text + ev.content } : x))); break;
      case "agent_message_done": setBlocks((b) => b.map((x) => (x.kind === "agent_message" && x.id === ev.id ? { ...x, text: ev.content, done: true } : x))); break;
      case "turn_complete": setRunning(false); setThreads((ts) => ts.map((t) => (t.status === "running" ? { ...t, status: "idle" } : t))); break;
      case "turn_error": setRunning(false); setBlocks((b) => [...b, { kind: "error", message: ev.message }]); break;
      default: break;
    }
  }, []);

  const attachStream = useCallback((t: ThreadMeta) => {
    esRef.current?.close();
    const es = new EventSource(api.streamUrl(t.id));
    esRef.current = es;
    for (const type of ["turn_started", "swarm_started", "swarm_agent", "swarm_done", "command", "command_result", "approval_request", "agent_message", "agent_message_delta", "agent_message_done", "turn_complete", "turn_error"]) {
      es.addEventListener(type, (e: MessageEvent) => { try { handleEvent(JSON.parse(e.data)); } catch {} });
    }
  }, [handleEvent]);

  const dispatch = useCallback(async () => {
    const task = input.trim();
    if (!task || !project) return;
    const t = await api.createThread(project.id, "grok");
    setThreads((ts) => [t, ...ts]);
    setThread(t);
    setBlocks([]);
    setInput("");
    attachStream(t);
    await api.prompt(t.id, task, true, picked.length ? picked : undefined);
  }, [input, project, picked, attachStream]);

  const openTask = async (t: ThreadMeta) => {
    esRef.current?.close();
    setThread(t); setPage("tasks");
    const full = await api.thread(t.id);
    setBlocks(blocksFromEvents(full.events || []));
    setRunning(full.status === "running");
    attachStream(t);
  };

  if (!settings) return <div className="boot"><span className="spinner" /></div>;

  return (
    <div className="grok-root">
      <aside className="gk-side">
        <div className="gk-brand">GROK <span className="gk-bot">BOT</span></div>
        <button className="gk-new" onClick={() => { setThread(null); setBlocks([]); setPage("dispatch"); }}><IconPlus size={13} /> New task</button>
        <nav className="gk-nav">
          {([["dispatch", "派活"], ["tasks", "任务流"], ["team", "团队"], ["automations", "自动化"], ["cloud", "云端 PC"]] as [Page, string][]).map(([p, label]) => (
            <button key={p} className={page === p ? "on" : ""} onClick={() => setPage(p)}>{label}</button>
          ))}
        </nav>
        <div className="gk-feed-label">最近任务</div>
        <div className="gk-feed">
          {threads.slice(0, 8).map((t) => (
            <div key={t.id} className={`gk-item ${thread?.id === t.id ? "on" : ""}`} onClick={() => openTask(t)}>
              <span className={`status-dot ${t.status === "running" ? "running" : "idle"}`} style={t.status !== "running" ? { background: "var(--faint)" } : undefined} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title || "任务"}</span>
            </div>
          ))}
        </div>
        <div className="gk-foot">
          <span className="avatar">{(settings.account.name || "U")[0].toUpperCase()}</span>
          <span style={{ flex: 1, fontSize: 12.5 }}>{settings.account.name}</span>
          <button className="icon-btn" onClick={() => setSettingsOpen(true)}><IconGear size={14} /></button>
        </div>
      </aside>

      <main className="gk-main">
        {page === "dispatch" && (
          <div className="gk-dispatch">
            <h1>给团队派个活</h1>
            <div className="gk-picker">
              <div className="gk-picker-label">成员{picked.length ? ` · 已选 ${picked.length}` : " · 不选则由协调者自动分配"}</div>
              <div className="gk-chips">
                {agents.map((a) => (
                  <button key={a.id} className={`gk-chip ${picked.includes(a.id) ? "on" : ""}`} onClick={() => setPicked((p) => p.includes(a.id) ? p.filter((x) => x !== a.id) : [...p, a.id])}>
                    <AgentAvatar color={a.color} shape={a.shape} size={18} /> {a.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="gk-task-box">
              <textarea rows={3} placeholder="任务描述,例如:调研工作区结构,设计并审查一个笔记应用方案…" value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) dispatch(); }} />
              <button className="gk-send" onClick={dispatch} disabled={running || !input.trim()}>{running ? "执行中…" : "Dispatch ⌘↵"}</button>
            </div>
          </div>
        )}

        {page === "tasks" && (
          <div className="gk-task-view">
            <div className="gk-tv-head">{thread ? thread.title || "任务" : "选择左侧任务或派个新活"}</div>
            <div className="gk-tv-body">
              {blocks.map((b, i) => (
                <div key={i} className="block-enter">
                  {b.kind === "prompt" ? <div className="gk-prompt">▸ {(b as any).text}</div>
                    : <BlockView block={b} onApprove={async (id, d) => { await api.approval(id, d); }} threadId={thread?.id} projectId={project?.id} />}
                </div>
              ))}
              {running && blocks[blocks.length - 1]?.kind !== "agent_message" && blocks[blocks.length - 1]?.kind !== "swarm" && (
                <div className="thinking-row"><span className="thinking-dots"><i /><i /><i /></span> 协调者工作中…</div>
              )}
            </div>
            {thread && (
              <div className="gk-tv-foot">
                <Composer value={input} onChange={setInput} onSend={(v) => { api.prompt(thread.id, v, true, picked.length ? picked : undefined); setInput(""); setBlocks((b) => [...b, { kind: "prompt", text: `[团队] ${v}`, ts: Date.now() }]); }} running={running}
                  model={settings.model} models={models} onModel={async (m) => setSettings(await api.saveSettings({ model: m } as any))}
                  approvalMode={settings.approvalMode} onApprovalMode={async (am) => setSettings(await api.saveSettings({ approvalMode: am } as any))} />
              </div>
            )}
          </div>
        )}

        {page === "team" && <div className="gk-page-wrap"><AgentRoster /></div>}

        {page === "automations" && (
          <div className="gk-page">
            <h2>自动化 · Automations</h2>
            {automations.length === 0 && <div className="sp-empty">还没有自动化。派活时在任务描述里用 ⏰,或在 Codex 产品的对话菜单里添加计划任务。</div>}
            <div className="gk-auto-list">
              {automations.map((a) => {
                const mins = Math.max(0, Math.round((a.nextRun - Date.now()) / 60000));
                return (
                  <div key={a.id} className="gk-auto">
                    <button className={`status-dot ${a.enabled === false ? "" : "running"}`} style={a.enabled === false ? { background: "var(--faint)" } : undefined}
                      onClick={async () => { await api.patchSchedule(a.threadId, a.id, { enabled: a.enabled === false }); api.automations().then(setAutomations); }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5 }}>{a.prompt}</div>
                      <div className="rp-sub">{a.threadTitle} · 每 {a.everyMinutes} 分钟 · {a.enabled === false ? "停用" : `${mins} 分钟后`}</div>
                    </div>
                    <button className="btn" onClick={async () => { await api.patchSchedule(a.threadId, a.id, { runNow: true }); api.automations().then(setAutomations); }}>运行</button>
                    <button className="btn" onClick={async () => { await api.unschedule(a.threadId, a.id); api.automations().then(setAutomations); }}>删除</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {page === "cloud" && (
          <div className="gk-page">
            <h2>云端 PC</h2>
            <CloudPanel onOpenTerminal={() => setPage("dispatch")} />
          </div>
        )}
      </main>

      {settingsOpen && (
        <div className="overlay" onMouseDown={() => setSettingsOpen(false)}>
          <div className="modal" style={{ width: 400 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>Settings</h2><button className="icon-btn" onClick={() => setSettingsOpen(false)}><IconX size={15} /></button></div>
            <div className="modal-body">
              <div className="set-row"><div className="sr-label"><div className="sr-title">Theme</div></div>
                <div className="segmented">{(["dark", "light"] as const).map((t) => <button key={t} className={settings.theme === t ? "on" : ""} onClick={async () => setSettings(await api.saveSettings({ theme: t } as any))}>{t}</button>)}</div></div>
              <div className="set-row"><div className="sr-label"><div className="sr-title">Model</div></div>
                <select className="select-like" value={settings.model} onChange={async (e) => setSettings(await api.saveSettings({ model: e.target.value } as any))}>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
              <div className="set-row"><div className="sr-label"><div className="sr-title">Provider</div><div className="sr-desc">建议 xAI Grok;任意 OpenAI-compatible 亦可</div></div>
                <select className="select-like" value={settings.provider} onChange={async (e) => setSettings(await api.saveSettings({ provider: e.target.value } as any))}>
                  {providers.map((p: any) => <option key={p.id} value={p.id}>{p.label}{p.hasKey ? "" : " (无 key)"}</option>)}
                </select></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
