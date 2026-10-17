/* Muse-style creative studio surface: brief → creations gallery + voice embodiment. Original implementation. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Block, Settings, ThreadMeta } from "../types";
import { blocksFromEvents } from "../lib/blocks";
import { playChime } from "../lib/sound";
import { Mascot } from "../components/Mascot";
import { CloudPanel } from "../components/CloudPanel";
import { IconGear, IconX } from "../icons";

type Page = "create" | "boards" | "gallery" | "voice" | "cloud";

const KINDS = [
  { id: "网页", hint: "做一个落地页" },
  { id: "看板", hint: "做一个数据看板网页" },
  { id: "文案", hint: "写一段产品发布文案" },
  { id: "方案", hint: "起 10 个品牌名并给方案" },
];

export default function MuseShell() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [project, setProject] = useState<any>(null);
  const [threads, setThreads] = useState<ThreadMeta[]>([]);
  const [thread, setThread] = useState<ThreadMeta | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [running, setRunning] = useState(false);
  const [input, setInput] = useState("");
  const [kind, setKind] = useState("网页");
  const [page, setPage] = useState<Page>("create");
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => { document.documentElement.setAttribute("data-app", "muse"); }, []);
  useEffect(() => {
    if (!settings) return;
    const want = settings.theme === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : settings.theme;
    document.documentElement.setAttribute("data-theme", want);
  }, [settings]);

  useEffect(() => {
    Promise.all([api.settings(), api.projects()]).then(([s, p]) => {
      setSettings(s); setVoiceOn(!!s.voice);
      if (p[0]) setProject(p[0]);
      else api.createProject("studio").then(setProject);
    });
    api.artifacts("muse").then(setArtifacts).catch(() => {});
  }, []);
  useEffect(() => { if (project) api.threads(project.id, "muse").then(setThreads).catch(() => {}); }, [project?.id]);

  const handleEvent = useCallback((ev: any) => {
    switch (ev.type) {
      case "turn_started": setRunning(true); setBlocks((b) => [...b, { kind: "prompt", text: ev.prompt, ts: ev.ts }]); break;
      case "file_change": setBlocks((b) => [...b, { kind: "file_change", path: ev.path, additions: ev.additions, deletions: ev.deletions, patch: ev.patch }]); api.artifacts("muse").then(setArtifacts).catch(() => {}); break;
      case "preview_ready": setBlocks((b) => [...b, { kind: "preview", path: ev.path, url: ev.url }]); api.artifacts("muse").then(setArtifacts).catch(() => {}); break;
      case "agent_message": setBlocks((b) => [...b, { kind: "agent_message", id: ev.id, text: "", done: false, ts: ev.ts }]); break;
      case "agent_message_delta": setBlocks((b) => b.map((x) => (x.kind === "agent_message" && x.id === ev.id ? { ...x, text: x.text + ev.content } : x))); break;
      case "agent_message_done":
        setBlocks((b) => b.map((x) => (x.kind === "agent_message" && x.id === ev.id ? { ...x, text: ev.content, done: true } : x)));
        if (voiceOn) { try { const u = new SpeechSynthesisUtterance(ev.content.replace(/[`#*_]/g, "").slice(0, 800)); u.rate = 1.05; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch {} }
        break;
      case "turn_complete": setRunning(false); if (settings?.sounds) playChime(); break;
      case "turn_error": setRunning(false); setBlocks((b) => [...b, { kind: "error", message: ev.message }]); break;
      default: break;
    }
  }, [voiceOn, settings?.sounds]);

  const attachStream = useCallback((t: ThreadMeta) => {
    esRef.current?.close();
    const es = new EventSource(api.streamUrl(t.id));
    esRef.current = es;
    for (const type of ["turn_started", "file_change", "preview_ready", "agent_message", "agent_message_delta", "agent_message_done", "turn_complete", "turn_error"]) {
      es.addEventListener(type, (e: MessageEvent) => { try { handleEvent(JSON.parse(e.data)); } catch {} });
    }
  }, [handleEvent]);

  const create = useCallback(async () => {
    const brief = input.trim();
    if (!brief || !project) return;
    let t = thread;
    if (!t) { t = await api.createThread(project.id, "muse"); setThread(t); setThreads((ts) => [t!, ...ts]); }
    setBlocks((b) => [...b, { kind: "prompt", text: `${kind} · ${brief}` }]);
    setInput("");
    attachStream(t);
    await api.prompt(t.id, `${kind}需求:${brief}`);
  }, [input, project, thread, kind, attachStream]);

  const openBoard = async (t: ThreadMeta) => {
    esRef.current?.close();
    setThread(t); setPage("create");
    const full = await api.thread(t.id);
    setBlocks(blocksFromEvents(full.events || []));
    setRunning(full.status === "running");
    attachStream(t);
  };

  if (!settings) return <div className="boot"><span className="spinner" /></div>;

  return (
    <div className="muse-root">
      <nav className="muse-rail">
        {([["create", "✦", "Create"], ["boards", "▦", "Boards"], ["gallery", "◫", "Gallery"], ["voice", "♪", "Voice"], ["cloud", "☁", "Cloud PC"]] as [Page, string, string][]).map(([p, ic, label]) => (
          <button key={p} className={`mr-btn ${page === p ? "on" : ""}`} title={label} onClick={() => setPage(p)}>{ic}</button>
        ))}
        <span style={{ flex: 1 }} />
        <button className="mr-btn" title="Settings" onClick={() => setSettingsOpen(true)}><IconGear size={15} /></button>
      </nav>

      <main className="muse-main">
        {page === "create" && (
          <div className="muse-create">
            <Mascot mode="muse" state={running ? "working" : "idle"} size={84} />
            <h1>What will you make?</h1>
            <div className="muse-kinds">
              {KINDS.map((k) => <button key={k.id} className={`mk ${kind === k.id ? "on" : ""}`} onClick={() => setKind(k.id)}>{k.id}</button>)}
            </div>
            <div className="muse-brief">
              <textarea rows={2} placeholder={`Brief · ${KINDS.find((k) => k.id === kind)?.hint}…`} value={input}
                onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); create(); } }} />
              <button className="muse-go" onClick={create} disabled={running}>{running ? "创作中…" : "创造 ↗"}</button>
            </div>
            {blocks.length > 0 && (
              <div className="muse-stream">
                {blocks.map((b, i) => {
                  if (b.kind === "prompt") return <div key={i} className="ms-brief">✦ {(b as any).text}</div>;
                  if (b.kind === "preview") return <button key={i} className="ms-creation" onClick={() => setDetail(b)}><span className="msc-globe">◍</span>{(b as any).path}<span className="msc-open">展开 →</span></button>;
                  if (b.kind === "file_change") return <div key={i} className="ms-file">▤ {(b as any).path} <span className="stat-add">+{(b as any).additions}</span> <span className="stat-del">−{(b as any).deletions}</span></div>;
                  if (b.kind === "agent_message") return <div key={i} className="ms-note">{(b as any).text}</div>;
                  return null;
                })}
              </div>
            )}
          </div>
        )}

        {page === "boards" && (
          <div className="muse-page">
            <h2>Boards</h2>
            {threads.length === 0 && <div className="sp-empty">还没有创作板。</div>}
            <div className="board-grid">
              {threads.map((t) => (
                <button key={t.id} className="board-card" onClick={() => openBoard(t)}>
                  <div className="bc-title">{t.title || "New board"}</div>
                  <div className="bc-sub">{t.messageCount} events · {new Date(t.updatedAt).toLocaleDateString()}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {page === "gallery" && (
          <div className="muse-page">
            <h2>Gallery · 作品墙</h2>
            {artifacts.length === 0 && <div className="sp-empty">创作完成后,网页与文件会挂在这里。</div>}
            <div className="gallery-grid">
              {artifacts.map((a, i) => (
                <button key={i} className="g-card" onClick={() => (a.site ? setDetail({ url: a.url, path: a.path }) : openBoard({ id: a.threadId } as any))}>
                  {a.site && a.url ? <iframe className="g-thumb" src={a.url} title={a.path} sandbox="" loading="lazy" /> : <div className="g-file">▤</div>}
                  <div className="g-name">{a.path}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {page === "voice" && (
          <div className="muse-page muse-voice-page">
            <Mascot mode="muse" state={running ? "working" : voiceOn ? "ready" : "idle"} size={120} />
            <h2>Voice embodiment</h2>
            <div className="mv-note">开启后,每次创作完成,小家伙会用语音把结果读给你听(浏览器 Web Speech)。</div>
            <button className={`mv-toggle ${voiceOn ? "on" : ""}`} onClick={async () => { const v = !voiceOn; setVoiceOn(v); await api.saveSettings({ voice: v } as any); }}>
              {voiceOn ? "♪ 语音已开启" : "开启语音"}
            </button>
            {voiceOn && <button className="mv-test" onClick={() => { try { speechSynthesis.speak(new SpeechSynthesisUtterance("嗨,我是你的创作伙伴。")); } catch {} }}>试听</button>}
          </div>
        )}

        {page === "cloud" && (
          <div className="muse-page">
            <h2>云端 PC</h2>
            <CloudPanel onOpenTerminal={() => setPage("create")} />
          </div>
        )}
      </main>

      {detail && (
        <div className="overlay" onMouseDown={() => setDetail(null)}>
          <div className="modal muse-detail" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>{detail.path}</h2><button className="icon-btn" onClick={() => setDetail(null)}><IconX size={15} /></button></div>
            {detail.url && <iframe className="md-frame" src={detail.url} title="creation" sandbox="allow-scripts allow-same-origin" />}
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="overlay" onMouseDown={() => setSettingsOpen(false)}>
          <div className="modal" style={{ width: 380 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>Settings</h2><button className="icon-btn" onClick={() => setSettingsOpen(false)}><IconX size={15} /></button></div>
            <div className="modal-body">
              <div className="set-row"><div className="sr-label"><div className="sr-title">Theme</div></div>
                <div className="segmented">{(["dark", "light"] as const).map((t) => <button key={t} className={settings.theme === t ? "on" : ""} onClick={async () => setSettings(await api.saveSettings({ theme: t } as any))}>{t}</button>)}</div></div>
              <div className="set-row"><div className="sr-label"><div className="sr-title">Provider</div><div className="sr-desc">在 Codex 产品或 ~/.open-every-agent/*/state.json 配置 key</div></div></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
