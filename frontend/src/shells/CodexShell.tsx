import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { ApprovalMode, Block, FileChangeItem, ModelInfo, Project, Settings, ThreadMeta, ProviderInfo } from "../types";
import { Sidebar } from "../components/Sidebar";
import { blocksFromEvents, groupBlocks } from "../lib/blocks";
import { playChime } from "../lib/sound";
import { Mascot } from "../components/Mascot";
import { useMascotMachine } from "../lib/mascotState";
import { Buddy } from "../components/Buddy";
import { AgentRoster } from "../components/AgentRoster";
import { Composer } from "../components/Composer";
import { BlockView } from "../components/Blocks";
import { SidePanel } from "../components/SidePanel";
import { SettingsModal } from "../components/SettingsModal";
import { CommandPalette } from "../components/CommandPalette";
import { NavRail, type RailView } from "../components/NavRail";
import { ThreadMenu } from "../components/ThreadMenu";
import { SummaryPanel } from "../components/SummaryPanel";
import { IconPanel, IconSummary, IconPlus, IconArrowDown, IconX, IconPin, IconAlert, IconClock, IconCornerUpLeft, IconArrowLeft, IconBranch, IconLink, IconChevron } from "../icons";

export const MODE_STRINGS: Record<string, { title: string; ask: string; chips: string[] }> = {
  codex: { title: "Where should we work?", ask: "Ask the agent anything…", chips: ["Create a calculator in JavaScript", "Build a todo list app in Python", "做一个个人资产看板网页", "List the workspace files", "Write a small HTTP server in Node", "What is the git status?"] },
  claude: { title: "How can I help you today?", ask: "Message Claude…", chips: ["帮我起草一封邮件", "解释这段代码的思路", "写一份项目周报", "头脑风暴产品名称", "润色这篇文章", "总结这份文档"] },
  muse: { title: "What will you make?", ask: "Start creating…", chips: ["生成一个落地页视觉稿", "写一段产品发布文案", "配色方案探索", "起 10 个品牌名", "设计一个 logo 概念", "分镜脚本草稿"] },
  grok: { title: "What should we get done?", ask: "Task Grok Bot…", chips: ["调研竞品并输出对比表", "自动化这批文件的整理", "跑一个定时监控任务", "把这份数据做成报表", "起草并检查 SQL", "总结今天的邮件要点"] },
};

const CHIPS = [
  "Create a calculator in JavaScript",
  "Build a todo list app in Python",
  "做一个个人资产看板网页",
  "List the workspace files",
  "Write a small HTTP server in Node",
  "What is the git status?",
];

export default function CodexShell() {
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
  const [lastUsage, setLastUsage] = useState<{ input_tokens?: number; output_tokens?: number; cost?: number } | null>(null);
  const [branches, setBranches] = useState<{ name: string; current: boolean }[]>([]);
  const [queued, setQueued] = useState<string[]>([]);
  const [teamMode, setTeamMode] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQ, setFindQ] = useState("");
  const [findIdx, setFindIdx] = useState(0);
  const [automations, setAutomations] = useState<any[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const approvalDiffs = useRef<Record<string, string>>({});
  const machineRef = useRef<{ notifyCompleted: () => void; notifyCancelled: () => void; notifyApproved: () => void }>({ notifyCompleted: () => {}, notifyCancelled: () => {}, notifyApproved: () => {} });
  const approvalExpiry = useRef<Record<string, number>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const blocksRef = useRef<Block[]>([]);
  useEffect(() => { blocksRef.current = blocks; }, [blocks]);

  useEffect(() => {
    if (!settings) return;
    const want = settings.theme === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : settings.theme;
    document.documentElement.setAttribute("data-theme", want);
    document.documentElement.setAttribute("data-app", "codex");
  }, [settings]);

  const [detached] = useState(() => new URLSearchParams(location.search).get("detached") === "1");

  useEffect(() => {
    Promise.all([api.settings(), api.models(), api.projects(), api.providers()]).then(([s, m, p, pr]) => {
      setSettings(s);
      setModels(m);
      setProjects(p);
      setProviders(pr);
      if (p[0]) setProject(p[0]);
      const tid = new URLSearchParams(location.search).get("thread");
      if (tid) api.thread(tid).then((full) => openThread(full as any)).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (railView !== "automations") return;
    api.automations().then(setAutomations).catch(() => {});
    const iv = setInterval(() => api.automations().then(setAutomations).catch(() => {}), 5000);
    return () => clearInterval(iv);
  }, [railView]);

  useEffect(() => {
    if (!project) return;
    api.branches(project.id).then(setBranches).catch(() => {});
    api.threads(project.id, "codex").then((ts) => {
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
          if (last && last.kind === "prompt" && last.text === ev.prompt && !last.ts) {
            return [...b.slice(0, -1), { ...last, ts: ev.ts, checkpoint: ev.checkpoint }];
          }
          return [...b, { kind: "prompt", text: ev.prompt, ts: ev.ts, checkpoint: ev.checkpoint }];
        });
        break;
      case "steer":
        setBlocks((b) => [...b, { kind: "prompt", text: ev.prompt, ts: ev.ts }]);
        break;
      case "annotation":
        setBlocks((b) => [...b, { kind: "annotation", quote: ev.quote, note: ev.note }]);
        break;
      case "cloud_pc":
        if (ev.state === "provisioning") setBlocks((b) => [...b, { kind: "cloud_pc", state: ev.state }]);
        else setBlocks((b) => b.map((x) => (x.kind === "cloud_pc" && x.state === "provisioning" ? { ...x, state: ev.state } : x)));
        break;
      case "swarm_agent":
        setBlocks((b) => b.map((x) => x.kind === "swarm" && x.id === ev.id ? { ...x, agents: x.agents.map((a) => a.agentId === ev.agentId ? { ...a, status: ev.status ?? a.status, summary: ev.summary ?? a.summary } : a) } : x));
        break;
      case "swarm_done":
        setBlocks((b) => b.map((x) => x.kind === "swarm" && x.id === ev.id ? { ...x, done: true } : x));
        break;
      case "notes_consumed":
        showToast("批注已随本轮发送");
        break;
      case "worktree":
        setThread((t) => (t ? { ...t, worktree: { path: ev.path, branch: ev.branch } } : t));
        setBlocks((b) => [...b, { kind: "error", message: `已切换到独立工作树 ${ev.branch}` }]);
        break;
      case "worktree_detached":
        setThread((t) => (t ? { ...t, worktree: null } : t));
        break;
      case "restored":
        setBlocks((b) => [...b, { kind: "error", message: `已回退到 checkpoint ${ev.hash}` }]);
        setRefreshToken((r) => r + 1);
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
        if (ev.diffPreview) approvalDiffs.current[ev.id] = ev.diffPreview;
        if (ev.expiresAt) approvalExpiry.current[ev.id] = ev.expiresAt;
        setBlocks((b) => b.map((x) => (x.kind === "command" && x.status === "awaiting_approval" ? { ...x, approvalId: ev.id, expiresAt: ev.expiresAt } : x)));
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
      case "queue_update":
        setQueued(ev.items || []);
        break;
      case "turn_cancelled":
        setRunning(false);
        machineRef.current.notifyCancelled();
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
        if (ev.usage && (ev.usage.input_tokens || ev.usage.output_tokens)) { setLastUsage(ev.usage); setTotalTokens((t) => t + (ev.usage.input_tokens || 0) + (ev.usage.output_tokens || 0)); }
        machineRef.current.notifyCompleted();
        if (settings?.sounds) playChime();
        if (settings?.voice) {
          const last = [...blocksRef.current].reverse().find((b: any) => b.kind === "agent_message") as any;
          if (last?.text) {
            try {
              const u = new SpeechSynthesisUtterance(last.text.replace(/[`#*_\[\]()]/g, "").slice(0, 1200));
              const skin = settings.appMode || "codex";
              const voices = speechSynthesis.getVoices();
              const pick = voices.find((v) => (skin === "grok" ? /en-|Google/ : /zh|Ting|Mei|Sinji/i.test(v.lang + v.name))) || voices[0];
              if (pick) u.voice = pick;
              u.rate = skin === "muse" ? 1.05 : 1;
              speechSynthesis.cancel();
              speechSynthesis.speak(u);
            } catch {}
          }
        }
        if (document.hidden) {
          const orig = document.title;
          document.title = "✅ 任务完成 · OpenEveryAgent";
          const iv = setInterval(() => { document.title = document.title.startsWith("✅") ? orig : "✅ 任务完成 · OpenEveryAgent"; }, 900);
          const stopFlash = () => { clearInterval(iv); document.title = orig; window.removeEventListener("focus", stopFlash); };
          window.addEventListener("focus", stopFlash);
        }
        if (Notification?.permission === "granted" && document.hidden) {
          try { new Notification("OpenEveryAgent", { body: "任务完成" }); } catch {}
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
    for (const type of ["turn_started", "plan", "plan_update", "command", "command_update", "command_result", "command_output", "turn_cancelled", "queue_update", "steer", "restored", "annotation", "worktree", "worktree_detached", "notes_consumed", "cloud_pc", "swarm_started", "swarm_agent", "swarm_done", "file_change", "files_reverted", "preview_ready", "process", "source", "subagent", "subagent_update", "agent_message", "agent_message_delta", "agent_message_done", "approval_request", "turn_complete", "turn_error"]) {
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

  const [selPop, setSelPop] = useState<{ x: number; y: number; text: string } | null>(null);

  const onMouseUpThread = (e: React.MouseEvent) => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() || "";
    if (text.length > 3 && thread && sel && sel.rangeCount) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setSelPop({ x: rect.left + rect.width / 2, y: rect.top - 8, text: text.slice(0, 400) });
    } else {
      setSelPop(null);
    }
  };

  const annotateSelection = async () => {
    if (!selPop || !thread) return;
    const note = prompt("批注(将随下一条消息发给 agent):", "");
    setSelPop(null);
    window.getSelection()?.removeAllRanges();
    if (note === null) return;
    await api.annotate(thread.id, selPop.text, note);
  };

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
        t = await api.createThread(project.id, "codex");
        setThread(t);
        setThreads((ts) => [t!, ...ts]);
        setInput("");
      }
      const created = t;
      if (running) {
        setInput("");
        setQueued((q) => [...q, text]);
        await api.prompt(created.id, text, teamMode && !text.startsWith("/"));
        return;
      }
      await openThread(created);
      setInput("");
      setBlocks((b) => [...b, { kind: "prompt", text }]);
      await api.prompt(created.id, text, teamMode && !text.startsWith("/"));
    },
    [thread, project, openThread]
  );

  const approve = useCallback(async (id: string, d: "approve" | "deny") => {
    await api.approval(id, d);
    if (d === "approve") machineRef.current.notifyApproved();
  }, []);

  const stopTurn = useCallback(async () => {
    if (!thread) return;
    await api.cancel(thread.id);
  }, [thread]);

  const restoreCheckpoint = useCallback(async (hash: string) => {
    if (!thread) return;
    if (!confirm(`回退到该轮开始前的工作区状态?\ncheckpoint ${hash.slice(0, 7)}`)) return;
    await api.restore(thread.id, hash);
  }, [thread]);

  const reviseTurn = useCallback(async (ts: number, newPrompt: string) => {
    if (!thread) return;
    const full = await api.thread(thread.id);
    const idx = full.events.findIndex((e: any) => e.type === "turn_started" && e.ts === ts);
    setBlocks(blocksFromEvents(full.events.slice(0, idx)));
    await api.revise(thread.id, ts, newPrompt);
    setRunning(true);
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
      } else if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setFindOpen(true);
      } else if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
        setSettingsOpen(false);
        setShortcutsOpen(false);
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
  const awaitingApproval = blocks.some((b) => b.kind === "command" && (b as any).status === "awaiting_approval");
  const [totalTokens, setTotalTokens] = useState(0);
  const machine = useMascotMachine({ hasThread: !!thread || blocks.length > 0, running, awaitingApproval, tokenCount: totalTokens });
  machineRef.current = { notifyCompleted: machine.notifyCompleted, notifyCancelled: machine.notifyCancelled, notifyApproved: machine.notifyApproved };
  const grouped = groupBlocks(blocks);
  const approxTokens = lastUsage ? (lastUsage.input_tokens || 0) + (lastUsage.output_tokens || 0) : Math.round(blocks.reduce((sum: number, b: any) => sum + (b.kind === "prompt" || b.kind === "agent_message" ? String(b.text || "").length : 0), 0) / 3);
  const childChats = thread ? threads.filter((t) => t.sideOf === thread.id) : [];

  return (
    <div className={`shell ${detached ? "detached" : ""}`}>
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
          {thread?.title || (railView !== "chat" ? railView : "Open Every Agent IDE")}
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
                onWorktree={async () => {
                  if (!thread || thread.worktree) return;
                  await api.attachWorktree(thread.id);
                  const full = await api.thread(thread.id);
                  setThread(full);
                  showToast("已创建独立工作树,本轮起所有变更互不影响主线");
                }}
                onRetry={async () => {
                  if (!thread) return;
                  await api.retry(thread.id);
                  setRunning(true);
                }}
                onSchedule={addSchedule}
                onShare={() => {
                  navigator.clipboard.writeText(`${location.origin}${location.pathname}?thread=${thread.id}`);
                  showToast("分享链接已复制");
                }}
                onCopyTranscript={() => {
                  navigator.clipboard.writeText(blocks.filter((b) => b.kind === "prompt" || b.kind === "agent_message").map((b: any) => (b.kind === "prompt" ? `> ${b.text}` : b.text)).join("\n\n"));
                  showToast("对话已复制");
                }}
                onOpenWindow={() => window.open(`${location.origin}${location.pathname}?thread=${thread.id}&detached=1`, "_blank")}
                onPrint={() => { window.print(); }}
                onExport={() => {
                  const md = blocks.map((b: any) => b.kind === "prompt" ? `## ${b.text}\n` : b.kind === "agent_message" ? `${b.text}\n\n---\n` : "").filter(Boolean).join("\n");
                  const blob = new Blob([`# ${thread.title || "chat"}\n\n${md}`], { type: "text/markdown" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `${(thread.title || "chat").replace(/[^\w\u4e00-\u9fff-]/g, "_")}.md`;
                  a.click();
                  showToast("已导出 Markdown");
                }}
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
            {thread?.pinned && <span className="mt-badge mt-badge-icon"><IconPin size={11} /> 置顶</span>}
            {thread?.worktree && (
              <span className="mt-badge wt-chip" title={thread.worktree.path}>
                <IconBranch size={11} /> {thread.worktree.branch.replace(/^oc\//, "")}
                <button className="wt-merge" onClick={async () => {
                  const r = await api.mergeWorktree(thread.id);
                  showToast(r.ok ? "工作树变更已合并回主线" : `合并失败: ${r.error}`);
                }}>合并</button>
                <button className="wt-detach" onClick={async () => {
                  await api.detachWorktree(thread.id);
                  setThread({ ...thread, worktree: null });
                }}>✕</button>
              </span>
            )}
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
            {(settings.harness as any) === "opencode" && <span className="mt-badge mt-badge-icon" style={{ color: "var(--green)" }}>⚙ opencode harness</span>}
            {modeForThread !== "auto" && <span className="mt-badge" style={{ color: "var(--accent-strong)" }}><IconAlert size={11} /> {modeForThread}</span>}
            {(thread?.scheduled?.length ?? 0) > 0 && <span className="mt-badge mt-badge-icon"><IconClock size={11} /> {thread!.scheduled!.length}</span>}
            {(settings.appMode === "grok" || settings.appMode === "muse") && (
              <button className="mt-badge cloud-chip" onClick={() => { setPanelOpen(true); setTabRequest((r) => ({ tab: "cloud", nonce: r.nonce + 1 })); }}>
                ☁ 云端 PC
              </button>
            )}
          </div>

          {childChats.length > 0 && (
            <div className="side-chips">
              <span className="sc-label">侧边聊天：</span>
              {childChats.map((c) => (
                <button key={c.id} className={`sc-chip ${thread?.id === c.id ? "active" : ""}`} onClick={() => openThread(c)}>
                  <IconCornerUpLeft size={11} /> {c.title}
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
                <IconArrowLeft size={11} /> 返回父对话
              </button>
            </div>
          )}

          {railView === "automations" ? (
            <div className="rail-page">
              <h2>Automations · 自动化中心</h2>
              {automations.length === 0 && <div className="sp-empty">还没有自动化。在对话菜单里"添加计划任务"，Grok-Bot 风格的定时任务会出现在这里。</div>}
              <div className="rp-list">
                {automations.map((a) => {
                  const mins = Math.max(0, Math.round((a.nextRun - Date.now()) / 60000));
                  return (
                    <div key={a.id} className="auto-row">
                      <button className={`status-dot ${a.enabled === false ? "idle" : "running"}`} style={a.enabled === false ? { background: "var(--faint)" } : undefined}
                        onClick={async () => { await api.patchSchedule(a.threadId, a.id, { enabled: a.enabled === false }); api.automations().then(setAutomations); }} title="启用/停用" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13 }}>{a.prompt}</div>
                        <div className="rp-sub">对话:{a.threadTitle} · 每 {a.everyMinutes} 分钟 · {a.enabled === false ? "已停用" : `${mins} 分钟后运行`}</div>
                      </div>
                      <button className="btn" onClick={async () => { await api.patchSchedule(a.threadId, a.id, { runNow: true }); api.automations().then(setAutomations); }}>立即运行</button>
                      <button className="btn" onClick={async () => { await api.unschedule(a.threadId, a.id); api.automations().then(setAutomations); }}>删除</button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : railView === "agents" ? (
            <AgentRoster />
          ) : railView === "artifacts" || railView === "history" || railView === "projects" || railView === "more" ? (
            <RailPage view={railView} threads={allThreads} onOpenThread={openThread} onCreateProject={createProject} projects={projects} onProject={(p) => { setProject(p); setRailView("chat"); }} />
          ) : !thread && blocks.length === 0 ? (
            <div className="landing">
              <Mascot mode="codex" state={machine.state} size={92} level={machine.level} />
              <h1>{(MODE_STRINGS[settings.appMode || "codex"] || MODE_STRINGS.codex).title}</h1>
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
                  placeholder={(MODE_STRINGS[settings.appMode || "codex"] || MODE_STRINGS.codex).ask}
                  autoFocus
                  projectId={project?.id}
                  onStop={stopTurn}
                  reasoning={settings.reasoning}
                  onReasoning={(r) => saveSettings({ reasoning: r } as any)}
                  teamMode={teamMode}
                  onTeamMode={setTeamMode}
                />
                <div className="composer-hint">OpenEveryAgent can make mistakes. Check important info.</div>
              </div>
              <div className="chips">
                {(MODE_STRINGS[settings.appMode || "codex"] || MODE_STRINGS.codex).chips.map((c) => (
                  <button key={c} className="chip" onClick={() => send(c)}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {findOpen && (
                <div className="find-bar">
                  <input
                    autoFocus
                    placeholder="在对话中查找…"
                    value={findQ}
                    onChange={(e) => { setFindQ(e.target.value); setFindIdx(0); }}
                    onKeyDown={(e) => { if (e.key === "Enter") setFindIdx((i) => i + (e.shiftKey ? -1 : 1)); if (e.key === "Escape") setFindOpen(false); }}
                  />
                  <button className="icon-btn" onClick={() => setFindIdx((i) => i - 1)}><IconChevron size={13} dir="up" /></button>
                  <button className="icon-btn" onClick={() => setFindIdx((i) => i + 1)}><IconChevron size={13} dir="down" /></button>
                  <button className="icon-btn" onClick={() => setFindOpen(false)}><IconX size={13} /></button>
                </div>
              )}
              <div className="thread-scroll" ref={scrollRef} onScroll={onScroll} onMouseUp={onMouseUpThread}>
                <div className="thread-inner" data-find={findQ || undefined}>
                  {grouped.map((b, i) => (
                    <div key={i} id={`blk-${i}`} className="block-enter">
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
                        onRevise={reviseTurn}
                        onRestore={restoreCheckpoint}
                        diffPreview={(b as any).approvalId ? approvalDiffs.current[(b as any).approvalId] : undefined}
                        blockIndex={i}
                      />
                    </div>
                  ))}
                  {running && blocks[blocks.length - 1]?.kind !== "agent_message" && (
                    <div className="thinking-row">
                      <Mascot mode="codex" state="working" size={22} />
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
              {selPop && (
                <button className="sel-annotate" style={{ left: selPop.x, top: selPop.y }} onMouseDown={(e) => e.preventDefault()} onClick={annotateSelection}>
                  <IconLink size={11} /> 批注
                </button>
              )}
              {queued.length > 0 && (
                <div className="queued-row">
                  <span className="qr-label">插话队列:</span>
                  {queued.map((q, i) => <span key={i} className="qr-chip">{q.slice(0, 30)}{q.length > 30 ? "…" : ""}</span>)}
                </div>
              )}
              {!running && thread && blocks.length > 0 && (
                <div className="followups">
                  {["跑一下测试看看有没有问题", "把这批变更提交", "继续完善并补充说明文档"].map((f) => (
                    <button key={f} className="chip" onClick={() => send(f)}>{f}</button>
                  ))}
                </div>
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
                    reasoning={settings.reasoning}
                    onReasoning={(r) => saveSettings({ reasoning: r } as any)}
                    teamMode={teamMode}
                    onTeamMode={setTeamMode}
                  />
                  <div className="composer-hint">
                    <span>OpenEveryAgent can make mistakes. Check important info. · ⌘K commands · ⌘S side chat</span>
                    {approxTokens > 0 && <span className="usage-chip" title={lastUsage ? "opencode 真实用量" : "上下文估算 token(/compact 可压缩)"}>{lastUsage ? "" : "≈"}{(approxTokens / 1000).toFixed(1)}k tok{lastUsage?.cost ? ` · $${lastUsage.cost.toFixed(4)}` : ""}</span>}
                  </div>
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
            threadId={thread?.id}
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
            if (!confirm("Reset all OpenEveryAgent data?")) return;
            await fetch("/api/reset", { method: "POST" });
            location.reload();
          }}
        />
      )}

      {paletteOpen && (
        <CommandPalette threads={threads} onOpenThread={openThread} actions={paletteActions} onClose={() => setPaletteOpen(false)} />
      )}

      {shortcutsOpen && (
        <div className="overlay" onMouseDown={() => setShortcutsOpen(false)} style={{ alignItems: "flex-start", paddingTop: "12vh" }}>
          <div className="modal" style={{ width: 420 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>键盘快捷键</h2><button className="icon-btn" onClick={() => setShortcutsOpen(false)}><IconX size={15} /></button></div>
            <div className="modal-body">
              {[["⌘K", "命令面板"], ["⌘N", "新对话"], ["⌘S", "新建侧边聊天"], ["⌘P", "文件面板"], ["^`", "终端面板"], ["⌥⌘R", "重命名(菜单)"], ["⌘/", "本帮助"], ["Enter", "发送 / 运行中插话"], ["Shift+Enter", "换行"], ["Esc", "关闭弹层"]].map(([k, d]) => (
                <div key={k} className="set-row" style={{ padding: "8px 2px" }}>
                  <span className="sr-label sr-title" style={{ fontWeight: 400, fontSize: 13 }}>{d}</span>
                  <span className="pi-kbd" style={{ fontSize: 12 }}>{k}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <Buddy mode="codex" state={machine.state} level={machine.level} hidden={(settings as any).buddy === false} />
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
          <button className="rp-item" onClick={onCreateProject}><IconPlus size={13} /> New project</button>
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
