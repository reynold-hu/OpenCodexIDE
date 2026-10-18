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
import { useMascotMachine } from "../lib/mascotState";
import { Buddy } from "../components/Buddy";
import { IconGear, IconX, IconPlus, IconTrash, IconPencil, IconStop } from "../icons";

type Page = "tasks" | "dispatch" | "team" | "automations" | "cloud";

const BOT_TEMPLATES = [
  { icon: "🌅", name: "每日晨报", every: 1440, prompt: "汇总工作区昨日变更与待办,生成中文晨报" },
  { icon: "🔍", name: "代码巡检", every: 720, prompt: "检查工作区代码:lint/测试/明显 bug,输出巡检报告" },
  { icon: "📊", name: "数据快照", every: 60, prompt: "统计工作区文件与 git 状态,输出数据快照" },
  { icon: "📝", name: "周报草稿", every: 10080, prompt: "回顾本周所有变更与任务,起草中文周报(成果/风险/计划)" },
];

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
  const [scheduleFor, setScheduleFor] = useState("");
  const [page, setPage] = useState<Page>("dispatch");
  const [automations, setAutomations] = useState<any[]>([]);
  const [autoForm, setAutoForm] = useState({ prompt: "", every: "60" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [providers, setProviders] = useState<any[]>([]);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => { document.documentElement.setAttribute("data-app", "grok"); }, []);
  useEffect(() => {
    if (!settings) return;
    const want = settings.theme === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : settings.theme;
    document.documentElement.setAttribute("data-theme", want);
  }, [settings]);

  const refreshAgents = useCallback(() => api.agents().then(setAgents).catch(() => {}), []);
  useEffect(() => {
    Promise.all([api.settings(), api.models(), api.projects(), api.agents(), api.providers()]).then(([s, m, p, ag, pr]) => {
      setSettings(s); setModels(m); setAgents(ag); setProviders(pr);
      if (p[0]) setProject(p[0]); else api.createProject("bots").then(setProject);
    });
  }, []);
  useEffect(() => { if (project) api.threads(project.id, "grok").then(setThreads).catch(() => {}); }, [project?.id, running]);
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
      case "plan": setBlocks((b) => [...b, { kind: "plan", id: ev.id, items: ev.items }]); break;
      case "plan_update": setBlocks((b) => b.map((x) => (x.kind === "plan" && x.id === ev.id ? { ...x, items: ev.items } : x))); break;
      case "command": setBlocks((b) => [...b, { kind: "command", id: ev.id, cmd: ev.cmd, status: ev.status, risk: ev.risk }]); break;
      case "command_output": setBlocks((b) => b.map((x) => (x.kind === "command" && x.id === ev.id ? { ...x, output: ((x as any).output || "") + ev.chunk } : x))); break;
      case "command_result": setBlocks((b) => b.map((x) => (x.kind === "command" && x.id === ev.id ? { ...x, status: ev.status, output: ev.output, code: ev.code, durationMs: ev.durationMs } : x))); break;
      case "command_update": setBlocks((b) => b.map((x) => (x.kind === "command" && x.id === ev.id ? { ...x, status: ev.status, reason: ev.reason } : x))); break;
      case "approval_request": setBlocks((b) => b.map((x) => (x.kind === "command" && x.status === "awaiting_approval" ? { ...x, approvalId: ev.id, expiresAt: ev.expiresAt } : x))); break;
      case "agent_message": setBlocks((b) => [...b, { kind: "agent_message", id: ev.id, text: "", done: false, ts: ev.ts }]); break;
      case "agent_message_delta": setBlocks((b) => b.map((x) => (x.kind === "agent_message" && x.id === ev.id ? { ...x, text: x.text + ev.content } : x))); break;
      case "agent_message_done": setBlocks((b) => b.map((x) => (x.kind === "agent_message" && x.id === ev.id ? { ...x, text: ev.content, done: true } : x))); break;
      case "turn_complete": setRunning(false); setThreads((ts) => ts.map((t) => (t.status === "running" ? { ...t, status: "idle" } : t))); break;
      case "turn_cancelled": setRunning(false); break;
      case "turn_error": setRunning(false); setBlocks((b) => [...b, { kind: "error", message: ev.message }]); break;
      default: break;
    }
  }, []);

  const attachStream = useCallback((t: ThreadMeta) => {
    esRef.current?.close();
    const es = new EventSource(api.streamUrl(t.id));
    esRef.current = es;
    for (const type of ["turn_started", "swarm_started", "swarm_agent", "swarm_done", "plan", "plan_update", "command", "command_output", "command_result", "command_update", "approval_request", "agent_message", "agent_message_delta", "agent_message_done", "turn_complete", "turn_cancelled", "turn_error"]) {
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
    if (scheduleFor && Number(scheduleFor) > 0) {
      await api.schedule(t.id, task, Number(scheduleFor));
      setScheduleFor("");
    }
    setPage("tasks");
  }, [input, project, picked, attachStream, scheduleFor]);

  const openTask = async (t: ThreadMeta) => {
    esRef.current?.close();
    setThread(t); setPage("tasks");
    const full = await api.thread(t.id);
    setBlocks(blocksFromEvents(full.events || []));
    setRunning(full.status === "running");
    attachStream(t);
  };

  const renameTask = async (t: ThreadMeta) => { const v = prompt("重命名任务：", t.title); if (v) { await api.updateThread(t.id, { title: v }); setThreads((ts) => ts.map((x) => (x.id === t.id ? { ...x, title: v } : x))); if (thread?.id === t.id) setThread({ ...thread, title: v }); } };
  const deleteTask = async (id: string) => { await api.deleteThread(id); setThreads((ts) => ts.filter((x) => x.id !== id)); if (thread?.id === id) { esRef.current?.close(); setThread(null); setBlocks([]); setPage("dispatch"); } };

  const awaitingApproval = blocks.some((b) => b.kind === "command" && (b as any).status === "awaiting_approval");
  const machine = useMascotMachine({ hasThread: !!thread || blocks.length > 0, running, awaitingApproval, tokenCount: 0 });
  if (!settings) return <div className="boot"><span className="spinner" /></div>;

  return (
    <div className="grok-root">
      <aside className="gk-side">
        <div className="gk-brand">GROK <span className="gk-bot">BOT</span></div>
        <button className="gk-new" onClick={() => { setThread(null); setBlocks([]); setRunning(false); setPage("dispatch"); }}><IconPlus size={13} /> New task</button>
        <nav className="gk-nav">
          {([["dispatch", "派活"], ["tasks", "任务流"], ["team", "团队"], ["automations", "自动化"], ["cloud", "云端 PC"]] as [Page, string][]).map(([p, label]) => (
            <button key={p} className={page === p ? "on" : ""} onClick={() => setPage(p)}>{label}</button>
          ))}
        </nav>
        <div className="gk-feed-label">最近任务</div>
        <div className="gk-feed">
          {threads.slice(0, 10).map((t) => (
            <div key={t.id} className={`gk-item ${thread?.id === t.id ? "on" : ""}`} onClick={() => openTask(t)}>
              <span className={`status-dot ${t.status === "running" ? "running" : "idle"}`} style={t.status !== "running" ? { background: "var(--faint)" } : undefined} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title || "任务"}</span>
              <button className="cr-del" title="重命名" onClick={(e) => { e.stopPropagation(); renameTask(t); }}><IconPencil size={10} /></button>
              <button className="cr-del" title="删除" onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}><IconTrash size={10} /></button>
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
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <label className="gk-sched">
                  <input type="checkbox" checked={!!scheduleFor} onChange={(e) => setScheduleFor(e.target.checked ? "60" : "")} /> 设为定时任务
                </label>
                {scheduleFor && <input className="gk-sched-min" type="number" min="5" value={scheduleFor} onChange={(e) => setScheduleFor(e.target.value)} title="间隔(分钟)" />}
                {scheduleFor && <span className="gk-sched-unit">分钟一次</span>}
                <span style={{ flex: 1 }} />
                <button className="gk-send" onClick={dispatch} disabled={running || !input.trim()}>{running ? "执行中…" : "Dispatch ⌘↵"}</button>
              </div>
            </div>
          </div>
        )}

        {page === "tasks" && (
          <div className="gk-task-view">
            <div className="gk-tv-head">
              {thread ? <>
                <span className={`status-dot ${running ? "running" : "idle"}`} style={!running ? { background: "var(--faint)" } : undefined} />
                {thread.title || "任务"}
                <button className="icon-btn" title="重命名" onClick={() => renameTask(thread)}><IconPencil size={12} /></button>
                <button className="icon-btn" title="删除" onClick={() => deleteTask(thread.id)}><IconTrash size={12} /></button>
              </> : "选择左侧任务或派个新活"}
            </div>
            <div className="gk-tv-body">
              {blocks.map((b, i) => (
                <div key={i} className="block-enter">
                  {b.kind === "prompt" ? <div className="gk-prompt">▸ {(b as any).text}</div>
                    : <BlockView block={b} onApprove={async (id, d) => { await api.approval(id, d); }} threadId={thread?.id} projectId={project?.id} />}
                </div>
              ))}
              {running && blocks.length === 0 && <div className="thinking-row"><span className="thinking-dots"><i /><i /><i /></span> 协调者工作中…</div>}
            </div>
            {thread && (
              <div className="gk-tv-foot">
                {running && <button className="gk-stop" onClick={() => api.cancel(thread.id)}><IconStop size={11} /> 停止任务</button>}
                <Composer value={input} onChange={setInput} onSend={(v) => { setInput(""); setBlocks((b) => [...b, { kind: "prompt", text: `[团队] ${v}`, ts: Date.now() }]); api.prompt(thread.id, v, true, picked.length ? picked : undefined); }} running={false}
                  model={settings.model} models={models} onModel={async (m) => setSettings(await api.saveSettings({ model: m } as any))}
                  approvalMode={settings.approvalMode} onApprovalMode={async (am) => setSettings(await api.saveSettings({ approvalMode: am } as any))}
                  placeholder="追加指令(团队模式)…" />
              </div>
            )}
          </div>
        )}

        {page === "team" && <div className="gk-page-wrap"><AgentRoster /></div>}

        {page === "automations" && (
          <div className="gk-page">
            <h2>自动化 · Automations</h2>
            <div className="gk-tpl-label">Bot 模板 · 一键创建</div>
            <div className="gk-templates">
              {BOT_TEMPLATES.map((t) => (
                <button key={t.name} className="gk-tpl" onClick={async () => {
                  if (!project) return;
                  const th = await api.createThread(project.id, "grok");
                  await api.updateThread(th.id, { title: `⏰ ${t.name}` });
                  await api.schedule(th.id, t.prompt, t.every);
                  api.automations().then(setAutomations);
                  api.threads(project.id, "grok").then(setThreads);
                }}>
                  <span className="gt-ico">{t.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="gt-name">{t.name}</div>
                    <div className="gt-desc">{t.prompt}</div>
                  </div>
                  <span className="gt-every">每 {t.every} 分</span>
                </button>
              ))}
            </div>
            <div className="gk-auto-form">
              <input placeholder="任务内容(到点自动派给团队)…" value={autoForm.prompt} onChange={(e) => setAutoForm({ ...autoForm, prompt: e.target.value })} />
              <input className="gk-sched-min" type="number" min="5" value={autoForm.every} onChange={(e) => setAutoForm({ ...autoForm, every: e.target.value })} />
              <span className="gk-sched-unit">分钟</span>
              <button className="btn primary" disabled={!autoForm.prompt.trim() || !project} onClick={async () => {
                const t = await api.createThread(project.id, "grok");
                await api.updateThread(t.id, { title: `⏰ ${autoForm.prompt.slice(0, 24)}` });
                await api.schedule(t.id, autoForm.prompt.trim(), Number(autoForm.every) || 60);
                setAutoForm({ prompt: "", every: "60" });
                api.automations().then(setAutomations);
                api.threads(project.id, "grok").then(setThreads);
              }}>创建</button>
            </div>
            {automations.length === 0 && <div className="sp-empty">还没有自动化。</div>}
            <div className="gk-auto-list">
              {automations.map((a) => {
                const mins = Math.max(0, Math.round((a.nextRun - Date.now()) / 60000));
                return (
                  <div key={a.id} className="gk-auto">
                    <button className={`status-dot ${a.enabled === false ? "" : "running"}`} style={a.enabled === false ? { background: "var(--faint)" } : undefined}
                      onClick={async () => { await api.patchSchedule(a.threadId, a.id, { enabled: a.enabled === false }); api.automations().then(setAutomations); }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5 }}>{a.prompt}</div>
                      <div className="rp-sub">{a.threadTitle} · 每 {a.everyMinutes} 分钟 · {a.enabled === false ? "停用" : `${mins} 分钟后运行`}</div>
                    </div>
                    <button className="btn" onClick={() => openTask({ id: a.threadId } as ThreadMeta)}>查看</button>
                    <button className="btn" onClick={async () => { await api.patchSchedule(a.threadId, a.id, { runNow: true }); api.automations().then(setAutomations); }}>运行</button>
                    <button className="btn" onClick={async () => { await api.unschedule(a.threadId, a.id); api.automations().then(setAutomations); }}><IconTrash size={11} /></button>
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

      <Buddy mode="grok" state={machine.state} hidden={(settings as any).buddy === false} />

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
                  {providers.map((p: any) => <option key={p.id} value={p.id}>{p.label}{p.hasKey ? "" : " · 无key"}</option>)}
                </select></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
