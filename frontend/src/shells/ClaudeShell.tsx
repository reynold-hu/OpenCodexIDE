/* Claude-style product surface: chats + projects + artifacts. Original implementation. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Block, Project, Settings, ThreadMeta } from "../types";
import { blocksFromEvents } from "../lib/blocks";
import { playChime } from "../lib/sound";
import { BlockView } from "../components/Blocks";
import { IconPlus, IconSearch, IconGear, IconX, IconFile, IconGlobe, IconChevron, IconTrash, IconPencil, IconPanel, IconLayers, IconFolder, IconChat, IconStop } from "../icons";
import { ClaudeRayMark } from "../components/RayMark";
import { Mascot } from "../components/Mascot";
import { useMascotMachine } from "../lib/mascotState";
import { Buddy } from "../components/Buddy";
import { BrandMark } from "../components/BrandMark";
import { apiFetch } from "../api";

type Page = "home" | "chat" | "projects" | "artifacts";

const MODES: { id: string; label: string; desc: string; approval: "read-only" | "ask" | "auto" }[] = [
  { id: "chat", label: "Chat", desc: "快速对话,不动文件", approval: "read-only" },
  { id: "think", label: "Think", desc: "深度推理,变更需确认", approval: "ask" },
  { id: "code", label: "Code", desc: "直接执行与写入", approval: "auto" },
];

export default function ClaudeShell() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [models, setModels] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [threads, setThreads] = useState<ThreadMeta[]>([]);
  const [thread, setThread] = useState<ThreadMeta | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [running, setRunning] = useState(false);
  const [queued, setQueued] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [page, setPage] = useState<Page>("home");
  const [mode, setMode] = useState(MODES[2]);
  const [modeOpen, setModeOpen] = useState(false);
  const [artifact, setArtifact] = useState<{ path: string; content: string } | null>(null);
  const [apVersions, setApVersions] = useState<{ hash: string; ts: number; msg: string }[]>([]);
  const [apVer, setApVer] = useState(0);
  const [knowledge, setKnowledge] = useState("");
  const [knowDirty, setKnowDirty] = useState(false);
  const loadKnowledge = useCallback(async (pid: string) => {
    setKnowDirty(false);
    try { const f = await api.file(pid, "AGENTS.md"); setKnowledge(f.content); } catch { setKnowledge(""); }
  }, []);
  const [apTab, setApTab] = useState<"preview" | "code">("preview");
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<any[] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { document.documentElement.setAttribute("data-app", "claude"); }, []);
  useEffect(() => {
    if (!settings) return;
    const want = settings.theme === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : settings.theme;
    document.documentElement.setAttribute("data-theme", want);
  }, [settings]);

  useEffect(() => {
    Promise.all([api.settings(), api.models(), api.projects(), api.providers()]).then(([s, m, p, pr]) => {
      setSettings(s); setModels(m); setProjects(p); setProviders(pr); if (p[0]) setProject(p[0]);
    });
  }, []);
  useEffect(() => { if (project) api.threads(project.id, "claude").then(setThreads).catch(() => {}); }, [project?.id, running]);
  useEffect(() => { api.artifacts("claude").then(setArtifacts).catch(() => {}); }, [running]);

  useEffect(() => {
    if (search.trim().length < 2) { setHits(null); return; }
    const t = setTimeout(() => api.search(search.trim()).then(setHits).catch(() => setHits(null)), 250);
    return () => clearTimeout(t);
  }, [search]);

  const handleEvent = useCallback((ev: any) => {
    switch (ev.type) {
      case "turn_started": setRunning(true); setBlocks((b) => { const l = b[b.length - 1]; if (l && l.kind === "prompt" && l.text === ev.prompt) return [...b.slice(0, -1), { ...l, ts: ev.ts }]; return [...b, { kind: "prompt", text: ev.prompt, ts: ev.ts }]; }); break;
      case "steer": setBlocks((b) => [...b, { kind: "prompt", text: ev.prompt, ts: ev.ts }]); break;
      case "queue_update": setQueued(ev.items || []); break;
      case "plan": setBlocks((b) => [...b, { kind: "plan", id: ev.id, items: ev.items }]); break;
      case "plan_update": setBlocks((b) => b.map((x) => (x.kind === "plan" && x.id === ev.id ? { ...x, items: ev.items } : x))); break;
      case "command": setBlocks((b) => [...b, { kind: "command", id: ev.id, cmd: ev.cmd, status: ev.status, risk: ev.risk }]); break;
      case "command_output": setBlocks((b) => b.map((x) => (x.kind === "command" && x.id === ev.id ? { ...x, output: ((x as any).output || "") + ev.chunk } : x))); break;
      case "command_result": setBlocks((b) => b.map((x) => (x.kind === "command" && x.id === ev.id ? { ...x, status: ev.status, output: ev.output, code: ev.code, durationMs: ev.durationMs } : x))); break;
      case "command_update": setBlocks((b) => b.map((x) => (x.kind === "command" && x.id === ev.id ? { ...x, status: ev.status, reason: ev.reason } : x))); break;
      case "approval_request": setBlocks((b) => b.map((x) => (x.kind === "command" && x.status === "awaiting_approval" ? { ...x, approvalId: ev.id, expiresAt: ev.expiresAt } : x))); break;
      case "file_change": setBlocks((b) => [...b, { kind: "file_change", path: ev.path, additions: ev.additions, deletions: ev.deletions, patch: ev.patch }]); break;
      case "preview_ready": setBlocks((b) => [...b, { kind: "preview", path: ev.path, url: ev.url }]); break;
      case "agent_message": setBlocks((b) => [...b, { kind: "agent_message", id: ev.id, text: "", done: false, ts: ev.ts }]); break;
      case "agent_message_delta": setBlocks((b) => b.map((x) => (x.kind === "agent_message" && x.id === ev.id ? { ...x, text: x.text + ev.content } : x))); break;
      case "agent_message_done": setBlocks((b) => b.map((x) => (x.kind === "agent_message" && x.id === ev.id ? { ...x, text: ev.content, done: true } : x))); break;
      case "turn_complete": setRunning(false); if (settings?.sounds) playChime(); break;
      case "turn_cancelled": setRunning(false); break;
      case "turn_error": setRunning(false); setBlocks((b) => [...b, { kind: "error", message: ev.message }]); break;
      default: break;
    }
  }, [settings?.sounds]);

  const attachStream = useCallback((t: ThreadMeta) => {
    esRef.current?.close();
    const es = new EventSource(api.streamUrl(t.id));
    esRef.current = es;
    for (const type of ["turn_started", "steer", "queue_update", "plan", "plan_update", "command", "command_output", "command_result", "command_update", "approval_request", "file_change", "preview_ready", "agent_message", "agent_message_delta", "agent_message_done", "turn_complete", "turn_cancelled", "turn_error"]) {
      es.addEventListener(type, (e: MessageEvent) => { try { handleEvent(JSON.parse(e.data)); } catch {} });
    }
  }, [handleEvent]);

  const openThread = useCallback(async (t: ThreadMeta) => {
    esRef.current?.close();
    setThread(t); setPage("chat");
    const full = await api.thread(t.id);
    setBlocks(blocksFromEvents(full.events || []));
    setRunning(full.status === "running");
    attachStream(t);
  }, [attachStream]);

  const send = useCallback(async (text: string) => {
    if (!project) return;
    if (running && thread) { setQueued((q) => [...q, text]); await api.prompt(thread.id, text); return; }
    let t = thread;
    if (!t) { t = await api.createThread(project.id, "claude"); setThread(t); setThreads((ts) => [t!, ...ts]); }
    const created = t;
    await openThread(created);
    setInput("");
    setBlocks((b) => [...b, { kind: "prompt", text }]);
    await api.prompt(created.id, text);
  }, [project, thread, running, openThread]);

  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [blocks]);

  const openArtifact = async (path: string) => {
    if (!project) return;
    try {
      const f = await api.file(project.id, path);
      setApTab(path.endsWith(".html") ? "preview" : "code");
      setArtifact({ path, content: f.content });
      let vers: any[] = [];
      try { vers = (await apiFetch(`/api/projects/${project.id}/history?path=${encodeURIComponent(path)}`).then((r) => r.json())).entries || []; } catch {}
      setApVersions(vers); setApVer(0);
    } catch {}
  };
  const gotoVersion = async (i: number) => {
    if (!artifact || !project || !apVersions[i]) return;
    setApVer(i);
    try { const f = await api.file(project.id, artifact.path, undefined, apVersions[i].hash); setArtifact({ ...artifact, content: f.content }); } catch {}
  };

  const startDictation = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR(); rec.lang = navigator.language || "zh-CN"; rec.interimResults = false;
    rec.onresult = (e: any) => { let t = ""; for (const r of e.results) if (r.isFinal) t += r[0].transcript; if (t) setInput((v) => (v ? v + " " : "") + t); };
    rec.onend = () => setListening(false); rec.onerror = () => setListening(false);
    setListening(true); rec.start();
  };

  const renameThread = async (t: ThreadMeta) => { const v = prompt("重命名对话：", t.title); if (v) { await api.updateThread(t.id, { title: v }); setThreads((ts) => ts.map((x) => (x.id === t.id ? { ...x, title: v } : x))); if (thread?.id === t.id) setThread({ ...thread, title: v }); } };
  const removeThread = async (id: string) => { await api.deleteThread(id); setThreads((ts) => ts.filter((x) => x.id !== id)); if (thread?.id === id) { esRef.current?.close(); setThread(null); setBlocks([]); setPage("home"); } };

  const awaitingApproval = blocks.some((b) => b.kind === "command" && (b as any).status === "awaiting_approval");
  const machine = useMascotMachine({ hasThread: !!thread || blocks.length > 0, running, awaitingApproval, tokenCount: 0 });
  if (!settings) return <div className="boot"><span className="spinner" /></div>;
  const shown = hits ? threads.filter((t) => hits.some((h) => h.id === t.id)) : threads.filter((t) => (t.title || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="claude-root">
      <aside className="cl-side">
        <div className="cl-account">
          <span className="cl-avatar">{(settings.account.name || "U")[0].toUpperCase()}</span>
          <span style={{ fontSize: 12.5, flex: 1 }}>{settings.account.name}</span>
          <button className="icon-btn" title="Settings" onClick={() => setSettingsOpen(true)}><IconGear size={13} /></button>
        </div>
        <button className="cl-new" onClick={() => { esRef.current?.close(); setThread(null); setBlocks([]); setInput(""); setPage("home"); }}><IconPlus size={13} /> New chat</button>
        <div className="cl-search"><IconSearch size={12} /><input placeholder="Search chats" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <nav className="cl-nav">
          <button className={page === "chat" || page === "home" ? "on" : ""} onClick={() => setPage(thread ? "chat" : "home")}><IconChat size={13} /> Chats</button>
          <button className={page === "projects" ? "on" : ""} onClick={() => setPage("projects")}><IconFolder size={13} /> Projects</button>
          <button className={page === "artifacts" ? "on" : ""} onClick={() => setPage("artifacts")}><IconLayers size={13} /> Artifacts</button>
        </nav>
        <div className="cl-recents-label">Recents</div>
        <div className="cl-recents">
          {shown.map((t) => (
            <div key={t.id} className={`cl-recent ${thread?.id === t.id && page === "chat" ? "on" : ""}`} onClick={() => openThread(t)}>
              <span className="cr-title">{t.title || "New chat"}</span>
              <button className="cr-del" title="重命名" onClick={(e) => { e.stopPropagation(); renameThread(t); }}><IconPencil size={11} /></button>
              <button className="cr-del" title="删除" onClick={(e) => { e.stopPropagation(); removeThread(t.id); }}><IconTrash size={11} /></button>
            </div>
          ))}
          {hits && hits[0]?.sample?.[0] && <div className="cl-hit">命中内容片段:{hits[0].sample[0]}</div>}
        </div>
        <div className="cl-foot">
          <span className="avatar">{(settings.account.name || "U")[0].toUpperCase()}</span>
          <span style={{ flex: 1, fontSize: 12.5 }}>{settings.account.name}</span>
          <span className="mt-badge">{models.find((m) => m.id === settings.model)?.name || settings.model}</span>
        </div>
      </aside>

      <main className="cl-main">
        {page === "home" && (
          <div className="cl-home">
            <BrandMark product="claude" size={64} fallback={<Mascot mode="claude" state={machine.state} size={64} />} />
            <h1>{new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening"}, {settings.account.name}</h1>
            <div className="cl-input-wrap">
              <textarea className="cl-input" rows={2} placeholder="How can I help you today?" value={input}
                onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); input.trim() && send(input.trim()); } }} />
              <div className="cl-input-bar">
                <div style={{ position: "relative" }}>
                  <button className="cl-explore" onClick={() => setModeOpen(!modeOpen)}>{mode.label} <IconChevron size={10} dir={modeOpen ? "up" : "down"} /></button>
                  {modeOpen && (
                    <div className="tmenu" style={{ top: "calc(100% + 6px)", bottom: "auto" }} onMouseLeave={() => setModeOpen(false)}>
                      {MODES.map((m) => (
                        <button key={m.id} className="tmenu-item" onClick={() => { setMode(m); setModeOpen(false); }}>
                          <span className="tmi-ico">{m.id === mode.id ? "✓" : ""}</span>
                          <span style={{ flex: 1 }}><b>{m.label}</b><div className="mi-desc">{m.desc}</div></span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <span style={{ flex: 1 }} />
                <button className={`cl-mic ${listening ? "rec" : ""}`} title="语音听写" onClick={startDictation}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" /></svg></button>
                <button className="cl-send" onClick={() => input.trim() && send(input.trim())}>↑</button>
              </div>
            </div>
            {artifacts.length > 0 && (
              <div className="cl-recent-cards">
                {artifacts.slice(0, 3).map((a, i) => (
                  <button key={i} className="cl-card" onClick={() => openThread({ id: a.threadId } as ThreadMeta)}>
                    <div className="cc-title">{a.threadTitle}</div>
                    <div className="cc-sub">{a.path}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {page === "chat" && (
          <div className="cl-chat" style={{ display: "flex", width: "100%", minWidth: 0 }}>
            <div className="cl-col">
              <div className="cl-thread" ref={scrollRef}>
                {blocks.map((b, i) => (
                  <div key={i} className="block-enter">
                    {b.kind === "prompt" ? <div className="cl-user">{(b as any).text}</div>
                      : b.kind === "file_change" ? <button className="cl-artifact-pill" onClick={() => openArtifact((b as any).path)}><IconFile size={12} /> {(b as any).path} · +{(b as any).additions} −{(b as any).deletions}</button>
                      : b.kind === "preview" ? <button className="cl-artifact-pill" onClick={() => window.open((b as any).url, "_blank")}><IconGlobe size={12} /> 网页预览 · {(b as any).path}</button>
                      : <div className="cl-assistant"><div style={{ flex: 1, minWidth: 0 }}><BlockView block={b} onApprove={async (id, d) => { await api.approval(id, d); }} threadId={thread?.id} onFeedback={async (id, v) => { await api.feedback(thread!.id, id, v); }} projectId={project?.id} /></div></div>}
                  </div>
                ))}
                {running && <div className="cl-assistant"><ClaudeRayMark size={16} /><span className="thinking-dots"><i /><i /><i /></span></div>}
              </div>
              {queued.length > 0 && <div className="queued-row"><span className="qr-label">插话队列:</span>{queued.map((q, i) => <span key={i} className="qr-chip">{q.slice(0, 24)}…</span>)}</div>}
              <div className="cl-composer">
                <div className="cl-input-wrap">
                  <textarea className="cl-input" rows={1} placeholder={running ? "插话(steer)…不会打断当前任务" : "Message Claude…"} value={input}
                    onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); input.trim() && send(input.trim()); } }} />
                  <div className="cl-input-bar">
                    <span className="cl-style">{mode.label}</span>
                    <span style={{ flex: 1 }} />
                    {running ? <button className="cl-send stop" title="停止" onClick={() => thread && api.cancel(thread.id)}><IconStop size={11} /></button>
                      : <button className="cl-send" onClick={() => input.trim() && send(input.trim())}>↑</button>}
                  </div>
                </div>
              </div>
            </div>
            {artifact && (
              <div className="cl-artifact-panel">
                <div className="ap-head">
                  <IconFile size={13} style={{ color: "var(--accent)" }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: 600, maxWidth: 180 }}>{artifact.path}</span>
                  <span style={{ flex: 1 }} />
                  <div className="ap-tabs">
                    <button className={apTab === "preview" ? "on" : ""} onClick={() => setApTab("preview")}>Preview</button>
                    <button className={apTab === "code" ? "on" : ""} onClick={() => setApTab("code")}>Code</button>
                  </div>
                  <button className="icon-btn" title="复制" onClick={() => navigator.clipboard.writeText(artifact.content)}><IconLayers size={12} /></button>
                  <button className="icon-btn" title="下载" onClick={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([artifact.content])); a.download = artifact.path.split("/").pop() || "artifact"; a.click(); }}><IconChevron size={12} dir="down" /></button>
                  <button className="icon-btn" onClick={() => setArtifact(null)}><IconX size={13} /></button>
                </div>
                {apTab === "preview" && artifact.path.endsWith(".html")
                  ? <iframe className="ap-frame" srcDoc={artifact.content} title="artifact" sandbox="allow-scripts" />
                  : <pre className="ap-doc" style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{artifact.content}</pre>}
              </div>
            )}
          </div>
        )}

        {page === "projects" && (
          <div className="cl-page">
            <h2>Projects</h2>
            {projects.map((p) => <button key={p.id} className={`cl-proj ${project?.id === p.id ? "on" : ""}`} onClick={() => { setProject(p); setPage("projects"); loadKnowledge(p.id); }}>{p.name}<span className="rp-sub">{p.path}</span></button>)}
            <button className="cl-proj new" onClick={async () => { const n = prompt("Project name?"); if (n) { const p = await api.createProject(n); setProjects((ps) => [...ps, p]); setProject(p); } }}>＋ New project</button>
            {project && (
              <div className="cl-knowledge">
                <div className="ck-title">知识 &amp; 指令<span className="ck-sub">AGENTS.md — 每次对话自动注入给 agent</span></div>
                <textarea rows={8} value={knowledge} placeholder={"# 项目约定\n- 语言/框架:\n- 测试命令:\n- 代码风格:"} onChange={(e) => { setKnowledge(e.target.value); setKnowDirty(true); }} />
                <div className="ck-actions">
                  {knowDirty && <span className="ck-dirty">未保存</span>}
                  <button className="btn primary" disabled={!knowDirty} onClick={async () => { if (project) { await api.saveFile(project.id, "AGENTS.md", knowledge); setKnowDirty(false); } }}>保存</button>
                </div>
              </div>
            )}
          </div>
        )}

        {page === "artifacts" && (
          <div className="cl-page">
            <h2>Artifacts</h2>
            {artifacts.length === 0 && <div className="sp-empty">还没有产物。让 Claude 写点东西。</div>}
            <div className="cl-art-grid">
              {artifacts.map((a, i) => (
                <button key={i} className="cl-card" onClick={() => (a.site && a.url ? window.open(a.url, "_blank") : openArtifact(a.path))}>
                  <div className="cc-title">{a.path}</div>
                  <div className="cc-sub">{a.threadTitle} · {new Date(a.ts).toLocaleDateString()}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      <Buddy mode="claude" state={machine.state} hidden={(settings as any).buddy === false} />

      {settingsOpen && (
        <div className="overlay" onMouseDown={() => setSettingsOpen(false)}>
          <div className="modal" style={{ width: 420 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>Settings</h2><button className="icon-btn" onClick={() => setSettingsOpen(false)}><IconX size={15} /></button></div>
            <div className="modal-body">
              <div className="set-row"><div className="sr-label"><div className="sr-title">Appearance</div></div>
                <div className="segmented">{(["light", "dark", "system"] as const).map((t) => <button key={t} className={settings.theme === t ? "on" : ""} onClick={async () => setSettings(await api.saveSettings({ theme: t } as any))}>{t}</button>)}</div></div>
              <div className="set-row"><div className="sr-label"><div className="sr-title">Model</div></div>
                <select className="select-like" value={settings.model} onChange={async (e) => setSettings(await api.saveSettings({ model: e.target.value } as any))}>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
              <div className="set-row"><div className="sr-label"><div className="sr-title">Provider</div><div className="sr-desc">任意 OpenAI-compatible 后端;key 在 Codex 产品或 state.json 配置</div></div>
                <select className="select-like" value={settings.provider} onChange={async (e) => setSettings(await api.saveSettings({ provider: e.target.value } as any))}>{providers.map((p: any) => <option key={p.id} value={p.id}>{p.label}{p.hasKey ? "" : " · 无key"}{p.id === settings.provider && !p.hasKey && p.id !== "simulated" ? " ⚠" : ""}</option>)}</select></div>
                            <div className="set-row"><div className="sr-label"><div className="sr-title">Agent harness</div><div className="sr-desc">opencode serve = 真实 agent 引擎(自动拉起 headless server)</div></div>
                <div className="segmented">
                  <button className={(settings as any).harness !== "opencode" ? "on" : ""} onClick={async () => setSettings(await api.saveSettings({ harness: "builtin" } as any))}>内置</button>
                  <button className={(settings as any).harness === "opencode" ? "on" : ""} onClick={async () => setSettings(await api.saveSettings({ harness: "opencode" } as any))}>opencode</button>
                </div></div>
<div className="set-row"><div className="sr-label"><div className="sr-title">Notification sounds</div></div>
                <button className={`switch ${settings.sounds ? "on" : ""}`} onClick={async () => setSettings(await api.saveSettings({ sounds: !settings.sounds } as any))} /></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}