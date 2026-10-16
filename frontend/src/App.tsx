import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type { ApprovalMode, Block, ModelInfo, Project, Settings, ThreadMeta, ProviderInfo } from "./types";
import { Sidebar } from "./components/Sidebar";
import { Composer } from "./components/Composer";
import { BlockView } from "./components/Blocks";
import { SidePanel } from "./components/SidePanel";
import { SettingsModal } from "./components/SettingsModal";
import { CommandPalette } from "./components/CommandPalette";
import { IconPanel, IconChevron } from "./icons";

const CHIPS = [
  "Create a calculator in JavaScript",
  "Build a todo list app in Python",
  "List the workspace files",
  "Write a small HTTP server in Node",
  "What is the git status?",
];

function blocksFromEvents(events: any[]): Block[] {
  const blocks: Block[] = [];
  const index = new Map<string, number>();
  for (const ev of events) {
    switch (ev.type) {
      case "turn_started":
        blocks.push({ kind: "prompt", text: ev.prompt });
        break;
      case "plan":
        index.set(ev.id, blocks.length);
        blocks.push({ kind: "plan", id: ev.id, items: ev.items });
        break;
      case "command": {
        index.set(ev.id, blocks.length);
        blocks.push({ kind: "command", id: ev.id, cmd: ev.cmd, status: ev.status, reason: ev.reason });
        break;
      }
      case "file_change":
        blocks.push({ kind: "file_change", path: ev.path, additions: ev.additions, deletions: ev.deletions, patch: ev.patch });
        break;
      case "agent_message":
        index.set(ev.id, blocks.length);
        blocks.push({ kind: "agent_message", id: ev.id, text: ev.content || "", done: !!ev.done });
        break;
      default:
        break;
    }
  }
  // second pass for updates (commands / plans / messages) in stored events
  for (const ev of events) {
    if (ev.type === "command_result") {
      const i = index.get(ev.id);
      if (i !== undefined && blocks[i].kind === "command") {
        Object.assign(blocks[i] as any, { status: ev.status, output: ev.output, code: ev.code, durationMs: ev.durationMs });
      }
    }
  }
  return blocks;
}

function playChime() {
  try {
    const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctor();
    const notes = [660, 880];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.3);
    });
  } catch {}
}

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [threads, setThreads] = useState<ThreadMeta[]>([]);
  const [thread, setThread] = useState<ThreadMeta | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [running, setRunning] = useState(false);
  const [input, setInput] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const esRef = useRef<EventSource | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // theme
  useEffect(() => {
    if (!settings) return;
    const want = settings.theme === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : settings.theme;
    document.documentElement.setAttribute("data-theme", want);
  }, [settings]);

  useEffect(() => {
    Promise.all([api.settings(), api.models(), api.projects(), api.providers()]).then(([s, m, p, pr]) => {
      setSettings(s);
      setModels(m);
      setProjects(p);
      setProviders(pr);
      if (p[0]) setProject(p[0]);
    });
  }, []);

  // re-resolve model list when provider changes
  useEffect(() => {
    if (!settings) return;
    api.models().then(async (m) => {
      setModels(m);
      if (m.length && !m.find((x) => x.id === settings.model)) {
        const s = await api.saveSettings({ model: m[0].id });
        setSettings(s);
      }
    });
  }, [settings?.provider]);

  useEffect(() => {
    if (!project) return;
    api.threads(project.id).then(setThreads).catch(() => {});
  }, [project?.id]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }, []);

  // load thread + SSE
  const openThread = useCallback(async (t: ThreadMeta) => {
    esRef.current?.close();
    setThread(t);
    const full = await api.thread(t.id);
    setBlocks(blocksFromEvents(full.events || []));
    setRunning(full.status === "running");
    const es = new EventSource(api.streamUrl(t.id));
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        handleEvent(JSON.parse(e.data));
      } catch {}
    };
    for (const type of ["turn_started", "plan", "plan_update", "command", "command_update", "command_result", "file_change", "agent_message", "agent_message_delta", "agent_message_done", "approval_request", "turn_complete", "turn_error"]) {
      es.addEventListener(type, (e: MessageEvent) => {
        try {
          handleEvent(JSON.parse(e.data));
        } catch {}
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const handleEvent = (ev: any) => {
    switch (ev.type) {
      case "turn_started":
        setRunning(true);
        setBlocks((b) => [...b, { kind: "prompt", text: ev.prompt }]);
        break;
      case "plan":
        setBlocks((b) => [...b, { kind: "plan", id: ev.id, items: ev.items }]);
        break;
      case "plan_update":
        setBlocks((b) => b.map((x) => (x.kind === "plan" && x.id === ev.id ? { ...x, items: ev.items } : x)));
        break;
      case "command":
        setBlocks((b) => [...b, { kind: "command", id: ev.id, cmd: ev.cmd, status: ev.status }]);
        break;
      case "approval_request":
        setBlocks((b) => b.map((x) => (x.kind === "command" && x.status === "awaiting_approval" ? { ...x, approvalId: ev.id } : x)));
        break;
      case "command_update":
        setBlocks((b) => b.map((x) => (x.kind === "command" && x.id === ev.id ? { ...x, status: ev.status, reason: ev.reason } : x)));
        break;
      case "command_result":
        setBlocks((b) => b.map((x) => (x.kind === "command" && x.id === ev.id ? { ...x, status: ev.status, output: ev.output, code: ev.code, durationMs: ev.durationMs } : x)));
        break;
      case "file_change":
        setBlocks((b) => [...b, { kind: "file_change", path: ev.path, additions: ev.additions, deletions: ev.deletions, patch: ev.patch }]);
        setRefreshToken((r) => r + 1);
        break;
      case "agent_message":
        setBlocks((b) => [...b, { kind: "agent_message", id: ev.id, text: ev.content || "", done: false }]);
        break;
      case "agent_message_delta":
        setBlocks((b) => b.map((x) => (x.kind === "agent_message" && x.id === ev.id ? { ...x, text: x.text + ev.content } : x)));
        break;
      case "agent_message_done":
        setBlocks((b) => b.map((x) => (x.kind === "agent_message" && x.id === ev.id ? { ...x, text: ev.content, done: true } : x)));
        break;
      case "turn_complete":
        setRunning(false);
        setRefreshToken((r) => r + 1);
        if (settings?.sounds) playChime();
        setThreads((ts) => ts.map((t) => (t.id === thread?.id ? { ...t, status: "idle", updatedAt: Date.now(), title: t.title || "chat" } : t)));
        break;
      case "turn_error":
        setRunning(false);
        setBlocks((b) => [...b, { kind: "error", message: ev.message }]);
        break;
      default:
        break;
    }
  };

  // auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [blocks]);

  const newChat = useCallback(async () => {
    if (!project) return;
    esRef.current?.close();
    setThread(null);
    setBlocks([]);
    setInput("");
    setRunning(false);
  }, [project?.id]);

  const send = useCallback(
    async (text: string) => {
      if (!project) {
        showToast("Create a project first");
        return;
      }
      let t = thread;
      if (!t) {
        t = await api.createThread(project.id);
        setThread(t);
        setThreads((ts) => [t!, ...ts]);
        setInput("");
      }
      const created = t;
      await openThread(created);
      setBlocks((b) => [...b]);
      setInput("");
      await api.prompt(created.id, text);
    },
    [thread, project, openThread]
  );

  const approve = useCallback(async (id: string, d: "approve" | "deny") => {
    await api.approval(id, d);
  }, []);

  const saveSettings = useCallback(
    async (patch: Partial<Settings>) => {
      if (!settings) return;
      const s = await api.saveSettings(patch);
      setSettings(s);
      api.providers().then(setProviders).catch(() => {});
    },
    [settings]
  );

  const setThreadModel = useCallback(
    async (m: string) => {
      if (!settings) return;
      saveSettings({ model: m });
      if (thread) {
        const upd = await api.updateThread(thread.id, { model: m });
        setThread(upd);
      }
    },
    [thread, settings, saveSettings]
  );

  const setThreadMode = useCallback(
    async (m: ApprovalMode) => {
      if (!settings) return;
      saveSettings({ approvalMode: m });
      if (thread) {
        const upd = await api.updateThread(thread.id, { approvalMode: m });
        setThread(upd);
      }
    },
    [thread, settings, saveSettings]
  );

  const createProject = useCallback(async () => {
    const name = prompt("New project name?");
    if (!name) return;
    const p = await api.createProject(name);
    setProjects((ps) => [...ps, p]);
    setProject(p);
    showToast(`Project "${p.name}" created`);
  }, []);

  const deleteThread = useCallback(
    async (id: string) => {
      await api.deleteThread(id);
      setThreads((ts) => ts.filter((t) => t.id !== id));
      if (thread?.id === id) {
        esRef.current?.close();
        setThread(null);
        setBlocks([]);
      }
    },
    [thread]
  );

  // shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        newChat();
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newChat]);

  const paletteActions = useMemo(
    () => [
      { id: "new", label: "New chat", hint: "⌘N", icon: null as any, run: () => newChat() },
      { id: "theme", label: `Toggle theme (currently ${settings?.theme || "dark"})`, hint: "", icon: null as any, run: () => saveSettings({ theme: settings?.theme === "dark" ? "light" : "dark" }) },
      { id: "settings", label: "Open settings", hint: "", icon: null as any, run: () => setSettingsOpen(true) },
      { id: "panel", label: panelOpen ? "Close side panel" : "Open side panel", hint: "", icon: null as any, run: () => setPanelOpen((v) => !v) },
      { id: "project", label: "New project", hint: "", icon: null as any, run: () => createProject() },
    ],
    [newChat, settings, saveSettings, panelOpen, createProject]
  );

  if (!settings) return <div style={{ display: "grid", placeItems: "center", height: "100vh" }}><span className="spinner" /></div>;

  const modelForThread = (thread?.model || settings.model)!;
  const modeForThread = (thread?.approvalMode || settings.approvalMode)!;

  return (
    <div className="shell">
      <div className="titlebar">
        <div className="traffic">
          <span className="r" />
          <span className="y" />
          <span className="g" />
        </div>
        <button className="icon-btn" title="Toggle sidebar" onClick={() => (document.querySelector(".sidebar") as HTMLElement)?.classList.toggle("collapsed")}>
          <IconPanel size={14} />
        </button>
        <div className="app-title">
          {thread?.title || (thread ? "New chat" : "OpenCodex IDE")}
          {running ? " — running…" : ""}
        </div>
        <button className="icon-btn" title="Side panel" onClick={() => setPanelOpen(!panelOpen)} style={panelOpen ? { color: "var(--text)" } : undefined}>
          <IconPanel size={14} style={{ transform: "scaleX(-1)" }} />
        </button>
      </div>

      <div className="body-row">
        <Sidebar
          projects={projects}
          currentProject={project ?? undefined}
          onProject={(p) => {
            setProject(p);
            setThread(null);
            setBlocks([]);
          }}
          onCreateProject={createProject}
          threads={threads}
          currentThreadId={thread?.id || null}
          onThread={openThread}
          onNewChat={newChat}
          onDeleteThread={deleteThread}
          onSettings={() => setSettingsOpen(true)}
          account={settings.account}
        />

        <main className="main">
          <div className="main-top">
            <button className="icon-btn" title="New chat" onClick={newChat}>
              <IconChevron size={14} dir="right" style={{ transform: "rotate(90deg)" }} />
            </button>
            <span className="mt-title">{thread?.title || "New chat"}</span>
            <span className="mt-badge">{models.find((m) => m.id === modelForThread)?.name || modelForThread}</span>
            {modeForThread !== "auto" && <span className="mt-badge" style={{ color: "var(--accent-strong)" }}>⚠ {modeForThread}</span>}
          </div>

          {!thread && blocks.length === 0 ? (
            <div className="landing">
              <div className="big-logo">OC</div>
              <h1>Where should Codex work?</h1>
              <div style={{ width: "100%", maxWidth: 680 }}>
                <Composer
                  value={input}
                  onChange={setInput}
                  onSend={send}
                  running={running}
                  model={modelForThread}
                  models={models}
                  onModel={setThreadModel}
                  approvalMode={modeForThread}
                  onApprovalMode={setThreadMode}
                  placeholder={`Ask ${project?.name || "Codex"} to do something…`}
                  autoFocus
                />
                <div className="composer-hint">OpenCodex can make mistakes. Check important info.</div>
              </div>
              <div className="chips">
                {CHIPS.map((c) => (
                  <button key={c} className="chip" onClick={() => send(c)}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="thread-scroll" ref={scrollRef}>
                <div className="thread-inner">
                  {blocks.map((b, i) =>
                    b.kind === "prompt" ? (
                      <React.Fragment key={i}>
                        <BlockView block={b} />
                      </React.Fragment>
                    ) : (
                      <div className="agent-col" key={i}>
                        <BlockView block={b} onApprove={approve} />
                      </div>
                    )
                  )}
                  {running && blocks[blocks.length - 1]?.kind !== "agent_message" && (
                    <div className="thinking-row">
                      <span className="thinking-dots"><i /><i /><i /></span>
                      Thinking…
                    </div>
                  )}
                </div>
              </div>
              <div className="composer-wrap">
                <div className="composer-inner">
                  <Composer
                    value={input}
                    onChange={setInput}
                    onSend={send}
                    running={running}
                    model={modelForThread}
                    models={models}
                    onModel={setThreadModel}
                    approvalMode={modeForThread}
                    onApprovalMode={setThreadMode}
                  />
                  <div className="composer-hint">OpenCodex can make mistakes. Check important info. · ⌘K for commands</div>
                </div>
              </div>
            </>
          )}
        </main>

        {panelOpen && project && <SidePanel project={project} onClose={() => setPanelOpen(false)} refreshToken={refreshToken} />}
      </div>

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          models={models}
          providers={providers}
          onChange={saveSettings}
          onClose={() => setSettingsOpen(false)}
          onReset={async () => {
            if (!confirm("Reset all OpenCodex data?")) return;
            await fetch("/api/reset", { method: "POST" });
            location.reload();
          }}
        />
      )}

      {paletteOpen && (
        <CommandPalette threads={threads} onOpenThread={openThread} actions={paletteActions} onClose={() => setPaletteOpen(false)} />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
