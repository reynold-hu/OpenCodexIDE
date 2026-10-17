/* Claude-style product surface: chats + projects + artifacts. Original implementation. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Block, Project, Settings, ThreadMeta } from "../types";
import { blocksFromEvents } from "../lib/blocks";
import { playChime } from "../lib/sound";
import { Composer } from "../components/Composer";
import { BlockView } from "../components/Blocks";
import { Markdown } from "../Markdown";
import { IconPlus, IconSearch, IconGear, IconX, IconFile, IconGlobe, IconChevron, IconTrash, IconPanel, IconLayers, IconFolder, IconChat } from "../icons";
import { ClaudeRayMark } from "../components/RayMark";

type Page = "home" | "chat" | "projects" | "artifacts";

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
  const [input, setInput] = useState("");
  const [page, setPage] = useState<Page>("home");
  const [artifact, setArtifact] = useState<{ path: string; content: string } | null>(null);
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apTab, setApTab] = useState<"preview" | "code">("preview");
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
  useEffect(() => { if (project) api.threads(project.id, "claude").then(setThreads).catch(() => {}); }, [project?.id]);
  useEffect(() => { api.artifacts("claude").then(setArtifacts).catch(() => {}); }, [thread?.id]);

  const handleEvent = useCallback((ev: any) => {
    switch (ev.type) {
      case "turn_started": setRunning(true); setBlocks((b) => { const l = b[b.length - 1]; if (l && l.kind === "prompt" && l.text === ev.prompt) return [...b.slice(0, -1), { ...l, ts: ev.ts }]; return [...b, { kind: "prompt", text: ev.prompt, ts: ev.ts }]; }); break;
      case "command": setBlocks((b) => [...b, { kind: "command", id: ev.id, cmd: ev.cmd, status: ev.status, risk: ev.risk }]); break;
      case "command_output": setBlocks((b) => b.map((x) => (x.kind === "command" && x.id === ev.id ? { ...x, output: ((x as any).output || "") + ev.chunk } : x))); break;
      case "command_result": setBlocks((b) => b.map((x) => (x.kind === "command" && x.id === ev.id ? { ...x, status: ev.status, output: ev.output, code: ev.code, durationMs: ev.durationMs } : x))); break;
      case "approval_request": setBlocks((b) => b.map((x) => (x.kind === "command" && x.status === "awaiting_approval" ? { ...x, approvalId: ev.id, expiresAt: ev.expiresAt } : x))); break;
      case "command_update": setBlocks((b) => b.map((x) => (x.kind === "command" && x.id === ev.id ? { ...x, status: ev.status, reason: ev.reason } : x))); break;
      case "file_change":
        setBlocks((b) => [...b, { kind: "file_change", path: ev.path, additions: ev.additions, deletions: ev.deletions, patch: ev.patch }]);
        break;
      case "preview_ready": setBlocks((b) => [...b, { kind: "preview", path: ev.path, url: ev.url }]); break;
      case "agent_message": setBlocks((b) => [...b, { kind: "agent_message", id: ev.id, text: ev.content || "", done: false, ts: ev.ts }]); break;
      case "agent_message_delta": setBlocks((b) => b.map((x) => (x.kind === "agent_message" && x.id === ev.id ? { ...x, text: x.text + ev.content } : x))); break;
      case "agent_message_done": setBlocks((b) => b.map((x) => (x.kind === "agent_message" && x.id === ev.id ? { ...x, text: ev.content, done: true } : x))); break;
      case "turn_complete": setRunning(false); if (settings?.sounds) playChime(); break;
      case "turn_error": setRunning(false); setBlocks((b) => [...b, { kind: "error", message: ev.message }]); break;
      default: break;
    }
  }, [settings?.sounds]);

  const openThread = useCallback(async (t: ThreadMeta) => {
    esRef.current?.close();
    setThread(t); setPage("chat");
    const full = await api.thread(t.id);
    setBlocks(blocksFromEvents(full.events || []));
    setRunning(full.status === "running");
    const es = new EventSource(api.streamUrl(t.id));
    esRef.current = es;
    for (const type of ["turn_started", "command", "command_output", "command_result", "command_update", "approval_request", "file_change", "preview_ready", "agent_message", "agent_message_delta", "agent_message_done", "turn_complete", "turn_error"]) {
      es.addEventListener(type, (e: MessageEvent) => { try { handleEvent(JSON.parse(e.data)); } catch {} });
    }
  }, [handleEvent]);

  const send = useCallback(async (text: string) => {
    if (!project) return;
    let t = thread;
    if (!t) { t = await api.createThread(project.id, "claude"); setThread(t); setThreads((ts) => [t!, ...ts]); }
    const created = t;
    await openThread(created);
    setInput("");
    setBlocks((b) => [...b, { kind: "prompt", text }]);
    await api.prompt(created.id, text);
  }, [project, thread, openThread]);

  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [blocks]);

  const openArtifact = async (path: string) => {
    if (!project) return;
    try {
      const f = await api.file(project.id, path);
      setArtifact({ path, content: f.content });
    } catch {}
  };

  if (!settings) return <div className="boot"><span className="spinner" /></div>;
  const filtered = threads.filter((t) => (t.title || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="claude-root">
      <aside className="cl-side">
        <div className="cl-account">
          <span className="cl-avatar">{(settings.account.name || "U")[0].toUpperCase()}</span>
          <IconChevron size={11} />
          <span style={{ flex: 1 }} />
          <button className="cl-collapse icon-btn" title="Collapse"><IconPanel size={13} /></button>
        </div>
        <button className="cl-new" onClick={() => { esRef.current?.close(); setThread(null); setBlocks([]); setPage("home"); }}><IconPlus size={13} /> New chat</button>
        <div className="cl-search"><IconSearch size={12} /><input placeholder="Search chats" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <nav className="cl-nav">
          <button className={page === "chat" || page === "home" ? "on" : ""} onClick={() => setPage(thread ? "chat" : "home")}><IconChat size={13} /> Chats</button>
          <button className={page === "projects" ? "on" : ""} onClick={() => setPage("projects")}><IconFolder size={13} /> Projects</button>
          <button className={page === "artifacts" ? "on" : ""} onClick={() => setPage("artifacts")}><IconLayers size={13} /> Artifacts</button>
        </nav>
        <div className="cl-recents-label">Recents</div>
        <div className="cl-recents">
          {filtered.map((t) => (
            <div key={t.id} className={`cl-recent ${thread?.id === t.id ? "on" : ""}`} onClick={() => openThread(t)}>
              <span className="cr-title">{t.title || "New chat"}</span>
              <button className="cr-del" onClick={(e) => { e.stopPropagation(); api.deleteThread(t.id).then(() => setThreads((ts) => ts.filter((x) => x.id !== t.id))); }}><IconTrash size={11} /></button>
            </div>
          ))}
        </div>
        <div className="cl-foot">
          <span className="avatar">{(settings.account.name || "U")[0].toUpperCase()}</span>
          <span style={{ flex: 1, fontSize: 12.5 }}>{settings.account.name}</span>
          <button className="icon-btn" onClick={() => setSettingsOpen(true)}><IconGear size={14} /></button>
        </div>
      </aside>

      <main className="cl-main">
        {page === "home" && (
          <div className="cl-home">
            <h1>{new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening"}, {settings.account.name}</h1>
            <div className="cl-input-wrap">
              <textarea
                className="cl-input"
                rows={2}
                placeholder="How can I help you today?"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); input.trim() && send(input.trim()); } }}
              />
              <div className="cl-input-bar">
                <button className="cl-explore"><IconChevron size={10} dir="up" /> Explore modes</button>
                <span style={{ flex: 1 }} />
                <button className="cl-mic" title="Dictation"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" /></svg></button>
                <button className="cl-send" onClick={() => input.trim() && send(input.trim())}>↑</button>
              </div>
            </div>
            {artifacts.slice(0, 3).length > 0 && (
              <div className="cl-recent-cards">
                {artifacts.slice(0, 3).map((a, i) => (
                  <button key={i} className="cl-card" onClick={() => { api.thread(a.threadId).then((full) => openThread(full as any)); }}>
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
                      : b.kind === "file_change" ? <button className="cl-artifact-pill" onClick={() => openArtifact((b as any).path)}><IconFile size={12} /> {(b as any).path} · 查看产物</button>
                      : b.kind === "preview" ? <button className="cl-artifact-pill" onClick={() => window.open((b as any).url, "_blank")}><IconGlobe size={12} /> 网页预览 · {(b as any).path}</button>
                      : <div className="cl-assistant"><div style={{ flex: 1, minWidth: 0 }}><BlockView block={b} onApprove={async (id, d) => { await api.approval(id, d); }} projectId={project?.id} /></div></div>}
                  </div>
                ))}
                {running && <div className="cl-assistant"><ClaudeRayMark size={18} /><span className="thinking-dots"><i /><i /><i /></span></div>}
              </div>
              <div className="cl-composer">
                <textarea
                  className="cl-input"
                  rows={1}
                  placeholder="Message Claude…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !running) { e.preventDefault(); input.trim() && send(input.trim()); } }}
                />
              </div>
            </div>
            {artifact && (
              <div className="cl-artifact-panel">
                <div className="ap-head">
                  <IconFile size={13} style={{ color: "var(--accent)" }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: 600 }}>{artifact.path}</span>
                  <span style={{ flex: 1 }} />
                  <div className="ap-tabs">
                    <button className={apTab === "preview" ? "on" : ""} onClick={() => setApTab("preview")}>Preview</button>
                    <button className={apTab === "code" ? "on" : ""} onClick={() => setApTab("code")}>Code</button>
                  </div>
                  <span className="ap-ver">1/1</span>
                  <button className="icon-btn" onClick={() => setArtifact(null)}><IconX size={13} /></button>
                </div>
                {apTab === "preview" && artifact.path.endsWith(".html")
                  ? <iframe className="ap-frame" srcDoc={artifact.content} title="artifact" sandbox="allow-scripts" />
                  : <pre className="ap-doc">{artifact.content}</pre>}
              </div>
            )}
          </div>
        )}

        {page === "projects" && (
          <div className="cl-page">
            <h2>Projects</h2>
            {projects.map((p) => <button key={p.id} className="cl-proj" onClick={() => { setProject(p); setPage("home"); }}>{p.name}<span className="rp-sub">{p.path}</span></button>)}
            <button className="cl-proj new" onClick={async () => { const n = prompt("Project name?"); if (n) { const p = await api.createProject(n); setProjects((ps) => [...ps, p]); setProject(p); } }}>＋ New project</button>
          </div>
        )}

        {page === "artifacts" && (
          <div className="cl-page">
            <h2>Artifacts</h2>
            {artifacts.length === 0 && <div className="sp-empty">还没有产物。让 Claude 写点东西。</div>}
            <div className="cl-art-grid">
              {artifacts.map((a, i) => (
                <button key={i} className="cl-card" onClick={() => openArtifact(a.path)}>
                  <div className="cc-title">{a.path}</div>
                  <div className="cc-sub">{a.threadTitle} · +{a.additions} −{a.deletions}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {settingsOpen && (
        <div className="overlay" onMouseDown={() => setSettingsOpen(false)}>
          <div className="modal" style={{ width: 400 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>Settings</h2><button className="icon-btn" onClick={() => setSettingsOpen(false)}><IconX size={15} /></button></div>
            <div className="modal-body">
              <div className="set-row"><div className="sr-label"><div className="sr-title">Appearance</div></div>
                <div className="segmented">{(["dark", "light", "system"] as const).map((t) => <button key={t} className={settings.theme === t ? "on" : ""} onClick={async () => setSettings(await api.saveSettings({ theme: t } as any))}>{t}</button>)}</div></div>
              <div className="set-row"><div className="sr-label"><div className="sr-title">Model</div></div>
                <select className="select-like" value={settings.model} onChange={async (e) => setSettings(await api.saveSettings({ model: e.target.value } as any))}>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
              <div className="set-row"><div className="sr-label"><div className="sr-title">Provider</div><div className="sr-desc">外接任意 OpenAI-compatible 后端</div></div>
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