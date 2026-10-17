import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type { ApprovalMode, Block, FileChangeItem, ModelInfo, Project, Settings, ThreadMeta, ProviderInfo } from "./types";
import { Sidebar } from "./components/Sidebar";
import { Composer } from "./components/Composer";
import { BlockView } from "./components/Blocks";
import { SidePanel } from "./components/SidePanel";
import { SettingsModal } from "./components/SettingsModal";
import { CommandPalette } from "./components/CommandPalette";
import { NavRail, type RailView } from "./components/NavRail";
import { ThreadMenu } from "./components/ThreadMenu";
import { SummaryPanel } from "./components/SummaryPanel";
import { IconPanel, IconSummary, IconPlus, IconArrowDown } from "./icons";

const CHIPS = [
  "Create a calculator in JavaScript",
  "Build a todo list app in Python",
  "做一个个人资产看板网页",
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
      case "command":
        index.set(ev.id, blocks.length);
        blocks.push({ kind: "command", id: ev.id, cmd: ev.cmd, status: ev.status, reason: ev.reason });
        break;
      case "file_change":
        blocks.push({ kind: "file_change", path: ev.path, additions: ev.additions, deletions: ev.deletions, patch: ev.patch, reverted: ev.reverted });
        break;
      case "preview_ready":
        blocks.push({ kind: "preview", path: ev.path, url: ev.url });
        break;
      case "process":
        blocks.push({ kind: "process", id: ev.id, cmd: ev.cmd, pid: ev.pid });
        break;
      case "source":
        blocks.push({ kind: "source", url: ev.url, title: ev.title });
        break;
      case "subagent":
        blocks.push({ kind: "subagent", id: ev.id, prompt: ev.prompt, done: !!ev.done });
        break;
      case "agent_message":
        index.set(ev.id, blocks.length);
        blocks.push({ kind: "agent_message", id: ev.id, text: ev.content || "", done: !!ev.done, feedback: ev.feedback, ts: ev.ts });
        break;
      default:
        break;
    }
  }
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

function groupBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  let group: FileChangeItem[] = [];
  const flush = () => {
    if (group.length === 1) out.push({ kind: "file_change", ...group[0] });
    else if (group.length > 1) out.push({ kind: "file_group", items: group });
    group = [];
  };
  for (const b of blocks) {
    if (b.kind === "file_change") group.push({ path: b.path, additions: b.additions, deletions: b.deletions, patch: b.patch, reverted: b.reverted });
    else {
      flush();
      out.push(b);
    }
  }
  flush();
  return out;
}

function playChime() {
  try {
    const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctor();
    [660, 880].forEach((f, i) => {
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
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [preview, setPreview] = useState<{ url: string; path: string } | null>(null);
  const [tabRequest, setTabRequest] = useState<{ tab: any; nonce: number }>({ tab: "review", nonce: 0 });
  const [canvasPath, setCanvasPath] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [railView, setRailView] = useState<RailView | "chat">("chat");
  const [allThreads, setAllThreads] = useState<ThreadMeta[]>([]);
  const [atBottom, setAtBottom] = useState(true);
  const [branches, setBranches] = useState<{ name: string; current: boolean }[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
    api.branches(project.id).then(setBranches).catch(() => {});
    api.threads(project.id).then((ts) => {
      setThreads(ts);
      setAllThreads(ts);
    }).catch(() => {});
  }, [project?.id, refreshToken]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }, []);

  const handleEvent = useCallback((ev: any) => {
    switch (ev.type) {
      case "turn_started":
        setRunning(true);
        setBlocks((b) => {
          const last = b[b.length - 1];
          if (last && last.kind === "prompt" && last.text === ev.prompt) return b;
          return [...b, { kind: "prompt", text: ev.prompt }];
        });
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
      case "command_output":
        setBlocks((b) => b.map((x) => (x.kind === "command" && x.id === ev.id ? { ...x, output: ((x as any).output || "") + ev.chunk } : x)));
        break;
      case "command_result":
        setBlocks((b) => b.map((x) => (x.kind === "command" && x.id === ev.id ? { ...x, status: ev.status, output: ev.output, code: ev.code, durationMs: ev.durationMs } : x)));
        break;
      case "turn_cancelled":
        setRunning(false);
        setBlocks((b) => {
          const last = b[b.length - 1];
          if (last && last.kind === "error" && last.message === "任务已停止") return b;
          return [...b, { kind: "error", message: "任务已停止" }];
        });
        break;
      case "file_change":
        setBlocks((b) => [...b, { kind: "file_change", path: ev.path, additions: ev.additions, deletions: ev.deletions, patch: ev.patch }]);
        setRefreshToken((r) => r + 1);
        break;
      case "files_reverted":
        setBlocks((b) => b.map((x) => (x.kind === "file_change" && ev.paths?.includes(x.path) ? { ...x, reverted: true } : x)));
        setRefreshToken((r) => r + 1);
        break;
      case "preview_ready":
        setBlocks((b) => [...b, { kind: "preview", path: ev.path, url: ev.url }]);
        break;
      case "process":
        setBlocks((b) => [...b, { kind: "process", id: ev.id, cmd: ev.cmd, pid: ev.pid }]);
        break;
      case "source":
        setBlocks((b) => [...b, { kind: "source", url: ev.url, title: ev.title }]);
        break;
      case "subagent":
        setBlocks((b) => [...b, { kind: "subagent", id: ev.id, prompt: ev.prompt, done: !!ev.done }]);
        break;
      case "subagent_update":
        setBlocks((b) => b.map((x) => (x.kind === "subagent" && x.id === ev.id ? { ...x, done: true } : x)));
        break;
      case "agent_message":
        setBlocks((b) => [...b, { kind: "agent_message", id: ev.id, text: ev.content || "", done: false, ts: ev.ts }]);
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
        if (document.hidden) {
          const orig = document.title;
          document.title = "✅ 任务完成 · OpenCodex";
          const iv = setInterval(() => { document.title = document.title.startsWith("✅") ? orig : "✅ 任务完成 · OpenCodex"; }, 900);
          const stopFlash = () => { clearInterval(iv); document.title = orig; window.removeEventListener("focus", stopFlash); };
          window.addEventListener("focus", stopFlash);
        }
        if (Notification?.permission === "granted" && document.hidden) {
          try { new Notification("OpenCodex", { body: "任务完成" }); } catch {}
        }
        setThreads((ts) => ts.map((t) => (t.id === thread?.id ? { ...t, status: "idle", updatedAt: Date.now() } : t)));
        break;
      case "turn_error":
        setRunning(false);
        setBlocks((b) => [...b, { kind: "error", message: ev.message }]);
        break;
      default:
        break;
    }
  }, [settings?.sounds, thread?.id]);

  const openThread = useCallback(async (t: ThreadMeta) => {
    esRef.current?.close();
    setThread(t);
    setRailView("chat");
    const full = await api.thread(t.id);
    setBlocks(blocksFromEvents(full.events || []));
    setRunning(full.status === "running");
    const es = new EventSource(api.streamUrl(t.id));
    esRef.current = es;
    for (const type of ["turn_started", "plan", "plan_update", "command", "command_update", "command_result", "command_output", "turn_cancelled", "file_change", "files_reverted", "preview_ready", "process", "source", "subagent", "subagent_update", "agent_message", "agent_message_delta", "agent_message_done", "approval_request", "turn_complete", "turn_error"]) {
      es.addEventListener(type, (e: MessageEvent) => {
        try {
          handleEvent(JSON.parse(e.data));
        } catch {}
      });
    }
  }, [handleEvent]);

  useEffect(() => {
    const h = (e: Event) => {
      const path = (e as CustomEvent).detail?.path as string;
      if (!path || !project) return;
      setPreview({ url: `/preview/${project.id}/${path}`, path });
      setPanelOpen(true);
    };
    window.addEventListener("ocx:preview", h);
    const hs = () => setSummaryOpen((v) => !v);
    window.addEventListener("ocx:summary", hs);
    return () => {
      window.removeEventListener("ocx:preview", h);
      window.removeEventListener("ocx:summary", hs);
    };
  }, [project]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [blocks]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };
  const jumpBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  const jumpTo = (idx: number) => {
    document.getElementById(`blk-${idx}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const newChat = useCallback(() => {
    esRef.current?.close();
    setThread(null);
    setBlocks([]);
    setInput("");
    setRunning(false);
    setRailView("chat");
  }, []);

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
      setInput("");
      setBlocks((b) => [...b, { kind: "prompt", text }]);
      await api.prompt(created.id, text);
    },
    [thread, project, openThread]
  );

  const approve = useCallback(async (id: string, d: "approve" | "deny") => {
    await api.approval(id, d);
  }, []);

  const stopTurn = useCallback(async () => {
    if (!thread) return;
    await api.cancel(thread.id);
  }, [thread]);

  const undoFiles = useCallback(
    async (paths: string[]) => {
      if (!thread) return;
      await api.undo(thread.id, paths);
      showToast(`已撤销 ${paths.length} 个文件的变更`);
    },
    [thread]
  );

  const setFeedback = useCallback(
    async (eventId: string, v: "up" | "down") => {
      if (!thread) return;
      await api.feedback(thread.id, eventId, v);
      setBlocks((b) => b.map((x) => (x.kind === "agent_message" && x.id === eventId ? { ...x, feedback: x.feedback === v ? undefined : v } : x)));
    },
    [thread]
  );

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

  const patchThread = useCallback(
    async (patch: Partial<ThreadMeta>) => {
      if (!thread) return;
      const upd = await api.updateThread(thread.id, patch);
      setThread(upd);
      setThreads((ts) => ts.map((t) => (t.id === upd.id ? { ...t, ...upd } : t)));
    },
    [thread]
  );

  const openSideChat = useCallback(async () => {
    if (!thread) return;
    const side = await api.sideChat(thread.id);
    setThreads((ts) => [side, ...ts]);
    await openThread(side);
    showToast("侧边聊天已创建");
  }, [thread, openThread]);

  const openFork = useCallback(async () => {
    if (!thread) return;
    const forked = await api.forkThread(thread.id);
    setThreads((ts) => [forked, ...ts]);
    await openThread(forked);
    showToast("已 Fork 到新对话");
  }, [thread, openThread]);

  const addSchedule = useCallback(async () => {
    if (!thread) return;
    const p = prompt("计划任务内容（到点自动发给 Codex）：");
    if (!p) return;
    const every = Number(prompt("间隔分钟数？", "60")) || 60;
    await api.schedule(thread.id, p, every);
    setRefreshToken((r) => r + 1);
    showToast(`已添加计划任务，每 ${every} 分钟执行`);
  }, [thread]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        newChat();
      } else if (e.key === "`" && e.ctrlKey) {
        e.preventDefault();
        setPanelOpen(true);
        setTabRequest((r) => ({ tab: "terminal", nonce: r.nonce + 1 }));
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p" && !e.shiftKey) {
        e.preventDefault();
        setPanelOpen(true);
        setTabRequest((r) => ({ tab: "files", nonce: r.nonce + 1 }));
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        if (thread) {
          e.preventDefault();
          openSideChat();
        }
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newChat, thread, openSideChat]);

  const paletteActions = useMemo(
    () => [
      { id: "new", label: "New chat", hint: "⌘N", icon: null as any, run: () => newChat() },
      { id: "side", label: "新建侧边聊天", hint: "⌘S", icon: null as any, run: () => openSideChat() },
      { id: "summary", label: summaryOpen ? "关闭摘要面板" : "打开摘要面板", hint: "", icon: null as any, run: () => setSummaryOpen((v) => !v) },
      { id: "theme", label: `Toggle theme (currently ${settings?.theme || "dark"})`, hint: "", icon: null as any, run: () => saveSettings({ theme: settings?.theme === "dark" ? "light" : "dark" }) },
      { id: "settings", label: "Open settings", hint: "", icon: null as any, run: () => setSettingsOpen(true) },
      { id: "panel", label: panelOpen ? "Close side panel" : "Open side panel", hint: "", icon: null as any, run: () => setPanelOpen((v) => !v) },
      { id: "project", label: "New project", hint: "", icon: null as any, run: () => createProject() },
    ],
    [newChat, openSideChat, summaryOpen, settings, saveSettings, panelOpen, createProject]
  );

  if (!settings) return <div style={{ display: "grid", placeItems: "center", height: "100vh" }}><span className="spinner" /></div>;

  const modelForThread = (thread?.model || settings.model)!;
  const modeForThread = (thread?.approvalMode || settings.approvalMode)!;
  const grouped = groupBlocks(blocks);
  const childChats = thread ? threads.filter((t) => t.sideOf === thread.id) : [];

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
          {thread?.title || (railView !== "chat" ? railView : "OpenCodex IDE")}
          {running ? " — running…" : ""}
        </div>
        <button className="icon-btn" title="摘要面板" onClick={() => setSummaryOpen(!summaryOpen)} style={summaryOpen ? { color: "var(--text)", background: "var(--sel)" } : undefined}>
          <IconSummary size={14} />
        </button>
        <button className="icon-btn" title="Side panel" onClick={() => setPanelOpen(!panelOpen)} style={panelOpen ? { color: "var(--text)" } : undefined}>
          <IconPanel size={14} style={{ transform: "scaleX(-1)" }} />
        </button>
      </div>

      <div className="body-row">
        <NavRail view={railView === "chat" ? "home" : (railView as RailView)} onView={(v) => setRailView(v)} onSettings={() => setSettingsOpen(true)} />

        <Sidebar
          projects={projects}
          currentProject={project ?? undefined}
          onProject={(p) => {
            setProject(p);
            setThread(null);
            setBlocks([]);
            setRailView("chat");
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
            {thread && (
              <ThreadMenu
                thread={thread}
                onRename={async () => {
                  const v = prompt("重命名对话：", thread.title);
                  if (v) patchThread({ title: v });
                }}
                onPin={() => patchThread({ pinned: !thread.pinned })}
                onSideChat={openSideChat}
                onContinue={() => send("继续上次未完成的工作。")}
                onFork={openFork}
                onSchedule={addSchedule}
                onShare={() => {
                  navigator.clipboard.writeText(`${location.origin}${location.pathname}?thread=${thread.id}`);
                  showToast("分享链接已复制");
                }}
                onCopyTranscript={() => {
                  navigator.clipboard.writeText(blocks.filter((b) => b.kind === "prompt" || b.kind === "agent_message").map((b: any) => (b.kind === "prompt" ? `> ${b.text}` : b.text)).join("\n\n"));
                  showToast("对话已复制");
                }}
                onOpenWindow={() => window.open(`${location.origin}${location.pathname}?thread=${thread.id}`, "_blank")}
                onArchive={async () => {
                  await patchThread({ archived: !thread.archived });
                  if (!thread.archived) newChat();
                }}
              />
            )}
            <button className="icon-btn" title="New chat" onClick={newChat}>
              <IconPlus size={14} />
            </button>
            <span className="mt-title">{thread?.title || "New chat"}</span>
            {thread?.pinned && <span className="mt-badge">📌 置顶</span>}
            {branches.length > 0 && (
              <select
                className="mt-badge"
                style={{ cursor: "pointer" }}
                value={branches.find((b) => b.current)?.name || ""}
                onChange={async (e) => {
                  if (!project) return;
                  try {
                    await api.checkout(project.id, e.target.value);
                    setBranches((bs) => bs.map((b) => ({ ...b, current: b.name === e.target.value })));
                    setRefreshToken((r) => r + 1);
                  } catch (err: any) { showToast(`切换失败: ${err?.message}`); }
                }}
              >
                {branches.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            )}
            <span className="mt-badge">{models.find((m) => m.id === modelForThread)?.name || modelForThread}</span>
            {modeForThread !== "auto" && <span className="mt-badge" style={{ color: "var(--accent-strong)" }}>⚠ {modeForThread}</span>}
            {(thread?.scheduled?.length ?? 0) > 0 && <span className="mt-badge">⏰ {thread!.scheduled!.length}</span>}
          </div>

          {childChats.length > 0 && (
            <div className="side-chips">
              <span className="sc-label">侧边聊天：</span>
              {childChats.map((c) => (
                <button key={c.id} className={`sc-chip ${thread?.id === c.id ? "active" : ""}`} onClick={() => openThread(c)}>
                  ↳ {c.title}
                </button>
              ))}
            </div>
          )}
          {thread?.sideOf && (
            <div className="side-chips">
              <button className="sc-chip" onClick={async () => {
                const parent = threads.find((t) => t.id === thread.sideOf) || (await api.thread(thread.sideOf!));
                openThread(parent as ThreadMeta);
              }}>
                ← 返回父对话
              </button>
            </div>
          )}

          {railView === "artifacts" || railView === "history" || railView === "projects" || railView === "agents" || railView === "more" ? (
            <RailPage view={railView} threads={allThreads} onOpenThread={openThread} onCreateProject={createProject} projects={projects} onProject={(p) => { setProject(p); setRailView("chat"); }} />
          ) : !thread && blocks.length === 0 ? (
            <div className="landing">
              <h1>Where should OpenCodex work?</h1>
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
                  placeholder={`Ask ${project?.name || "OpenCodex"} to do something…`}
                  autoFocus
                  projectId={project?.id}
                  onStop={stopTurn}
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
              <div className="thread-scroll" ref={scrollRef} onScroll={onScroll}>
                <div className="thread-inner">
                  {grouped.map((b, i) => (
                    <div key={i} id={`blk-${i}`}>
                      <BlockView
                        block={b}
                        onApprove={approve}
                        onUndoFiles={undoFiles}
                        onViewChanges={() => { setPanelOpen(true); }}
                        onOpenCanvas={setCanvasPath}
                        onOpenPreview={(url, path) => { setPreview({ url, path }); setPanelOpen(true); }}
                        onOpenWindow={(url) => window.open(url, "_blank")}
                        threadId={thread?.id}
                        onFeedback={setFeedback}
                        projectId={project?.id}
                      />
                    </div>
                  ))}
                  {running && blocks[blocks.length - 1]?.kind !== "agent_message" && (
                    <div className="thinking-row">
                      <span className="thinking-dots"><i /><i /><i /></span>
                      Thinking…
                    </div>
                  )}
                </div>
              </div>
              {!atBottom && (
                <button className="scroll-bottom" onClick={jumpBottom} title="回到底部">
                  <IconArrowDown size={16} />
                </button>
              )}
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
                    projectId={project?.id}
                    onStop={stopTurn}
                  />
                  <div className="composer-hint">OpenCodex can make mistakes. Check important info. · ⌘K commands · ⌘S side chat</div>
                </div>
              </div>
            </>
          )}
        </main>

        {summaryOpen && thread && (
          <SummaryPanel
            thread={thread}
            blocks={grouped}
            projectId={project?.id || ""}
            refreshToken={refreshToken}
            onClose={() => setSummaryOpen(false)}
            onJump={(i) => { setRailView("chat"); jumpTo(i); }}
            onOpenPreview={(url, path) => { setPreview({ url, path }); setPanelOpen(true); }}
            onOpenCanvas={(path) => { setCanvasPath(path); setPanelOpen(true); }}
            onAddSource={async (url) => { await api.addSource(thread.id, url); setRefreshToken((r) => r + 1); }}
          />
        )}

        {panelOpen && project && (
          <SidePanel
            project={project}
            onClose={() => setPanelOpen(false)}
            refreshToken={refreshToken}
            preview={preview}
            canvasPath={canvasPath}
            onOpenCanvas={setCanvasPath}
            tabRequest={tabRequest}
            onOpenToolFromBrowser={(t) => setTabRequest((r) => ({ tab: t, nonce: r.nonce + 1 }))}
          />
        )}
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

function RailPage({ view, threads, onOpenThread, onCreateProject, projects, onProject }: {
  view: RailView;
  threads: ThreadMeta[];
  onOpenThread: (t: ThreadMeta) => void;
  onCreateProject: () => void;
  projects: Project[];
  onProject: (p: Project) => void;
}) {
  const [artifacts, setArtifacts] = useState<{ path: string; threadId: string; threadTitle: string; ts: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (view !== "artifacts") return;
    setLoading(true);
    (async () => {
      const out: typeof artifacts = [];
      for (const t of threads) {
        try {
          const full = await api.thread(t.id);
          for (const ev of full.events || []) {
            if (ev.type === "file_change") out.push({ path: ev.path, threadId: t.id, threadTitle: t.title || "chat", ts: ev.ts });
          }
        } catch {}
      }
      out.sort((a, b) => b.ts - a.ts);
      setArtifacts(out);
      setLoading(false);
    })();
  }, [view, threads]);

  return (
    <div className="rail-page">
      <h2>{view === "artifacts" ? "Artifacts · 产物" : view === "history" ? "History · 全部对话" : view === "projects" ? "Projects · 项目" : view === "agents" ? "Agents" : "Apps"}</h2>
      {view === "artifacts" && (
        loading ? <div className="sp-empty">loading…</div> : artifacts.length === 0 ? <div className="sp-empty">还没有产物。让 Codex 写点东西吧。</div> : (
          <div className="rp-list">
            {artifacts.map((a, i) => (
              <button key={i} className="rp-item" onClick={() => { const t = threads.find((x) => x.id === a.threadId); if (t) onOpenThread(t); }}>
                <span style={{ flex: 1, fontFamily: "var(--mono)", fontSize: 13 }}>{a.path}</span>
                <span className="rp-sub">{a.threadTitle} · {new Date(a.ts).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        )
      )}
      {view === "history" && (
        <div className="rp-list">
          {threads.map((t) => (
            <button key={t.id} className="rp-item" onClick={() => onOpenThread(t)}>
              <span style={{ flex: 1 }}>{t.title || "New chat"}{t.archived ? " (archived)" : ""}</span>
              <span className="rp-sub">{new Date(t.updatedAt).toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
      {view === "projects" && (
        <div className="rp-list">
          {projects.map((p) => (
            <button key={p.id} className="rp-item" onClick={() => onProject(p)}>
              <span style={{ flex: 1 }}>{p.name}</span>
              <span className="rp-sub" style={{ fontFamily: "var(--mono)" }}>{p.path}</span>
            </button>
          ))}
          <button className="rp-item" onClick={onCreateProject}>＋ New project</button>
        </div>
      )}
      {view === "agents" && (
        <div className="rp-list">
          <div className="rp-item" style={{ cursor: "default" }}>
            <span style={{ flex: 1 }}>Codex (built-in agent)</span>
            <span className="rp-sub">active · tool-calling loop over your workspace</span>
          </div>
          <div className="rp-item" style={{ cursor: "default", opacity: 0.6 }}>
            <span style={{ flex: 1 }}>More agents</span>
            <span className="rp-sub">roadmap — PRs welcome</span>
          </div>
        </div>
      )}
      {view === "more" && (
        <div className="sp-empty">
          Desktop ports for Windows &amp; macOS are on the roadmap — fork the repo and wrap this UI in Tauri/Electron. See README “Fork it”.
        </div>
      )}
    </div>
  );
}
