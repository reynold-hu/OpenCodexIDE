import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { Project, ThreadMeta } from "../types";
import { IconPlus, IconSearch, IconGear, IconTrash, IconFolder, IconChevron, IconPencil } from "../icons";
import { Dot, dotStateFrom } from "./Dot";

const BRAND_MODES: { id: string; label: string; desc: string }[] = [
  { id: "chatgpt", label: "ChatGPT", desc: "散文式对话,工具细节折叠" },
  { id: "chatgpt_work", label: "ChatGPT Work", desc: "保留计划与产物,隐藏命令" },
  { id: "codex", label: "Codex", desc: "完整任务卡 / 命令 / diff" },
];

function groupLabel(ts: number, now: number) {
  const d = new Date(ts);
  const today = new Date(now);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(today) - startOfDay(d)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 7) return "Previous 7 Days";
  if (days <= 30) return "Previous 30 Days";
  return "Older";
}

export function Sidebar({
  projects,
  currentProject,
  onProject,
  onCreateProject,
  threads,
  currentThreadId,
  onThread,
  onNewChat,
  onDeleteThread,
  onRenameThread,
  onSettings,
  account,
  mode,
  onMode,
  onNewDot,
  running,
  onRenameProject,
  onDeleteProject,
}: {
  projects: Project[];
  currentProject: Project | undefined;
  onProject: (p: Project) => void;
  onCreateProject: () => void;
  threads: ThreadMeta[];
  currentThreadId: string | null;
  onThread: (t: ThreadMeta) => void;
  onNewChat: () => void;
  onDeleteThread: (id: string) => void;
  onRenameThread: (t: ThreadMeta) => void;
  onSettings: () => void;
  account: { name: string; email: string };
  mode: string;
  onMode: (m: string) => void;
  onNewDot: () => void;
  running: boolean;
  onRenameProject: (p: Project) => void;
  onDeleteProject: (p: Project) => void;
}) {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"local" | "cloud">("local");
  const [brandOpen, setBrandOpen] = useState(false);
  const [projOpen, setProjOpen] = useState(false);
  const [hits, setHits] = useState<{ id: string; title: string; sample: string[] }[] | null>(null);

  useEffect(() => {
    if (search.trim().length < 2) { setHits(null); return; }
    const t = setTimeout(() => api.search(search.trim()).then((r) => setHits(r.map((h) => ({ id: h.id, title: h.title, sample: h.sample })))).catch(() => setHits(null)), 250);
    return () => clearTimeout(t);
  }, [search]);

  const filtered = useMemo(() => {
    if (hits) return threads.filter((t) => hits.some((h) => h.id === t.id));
    return threads.filter((t) => t.title.toLowerCase().includes(search.toLowerCase()));
  }, [threads, search, hits]);

  const groups = useMemo(() => {
    const out: { label: string; items: ThreadMeta[] }[] = [];
    const sorted = [...filtered].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt);
    for (const t of sorted) {
      const g = t.pinned ? "置顶" : groupLabel(t.updatedAt, Date.now());
      let last = out[out.length - 1];
      if (!last || last.label !== g) {
        last = { label: g, items: [] };
        out.push(last);
      }
      last.items.push(t);
    }
    return out;
  }, [filtered]);

  return (
    <aside className="sidebar">
      <div className="sb-head">
        <div className="sb-brand-wrap">
          <div className="sb-brand" onClick={() => setBrandOpen(!brandOpen)} role="button" tabIndex={0} title="切换产品表面">
            <img src="/logo.png" alt="" className="brand-logo" />
            <span className="brand-text">
              <span className="name">OpenEveryAgent</span>
              <span className="brand-surface">{BRAND_MODES.find((m) => m.id === mode)?.label || "Codex"}</span>
            </span>
            <IconChevron size={12} dir={brandOpen ? "up" : "down"} style={{ color: "var(--faint)" }} />
            <span className="icon-btn" title="New chat" onClick={(e) => { e.stopPropagation(); onNewChat(); }}>
              <IconPlus size={15} />
            </span>
          </div>
          {brandOpen && (
            <div className="brand-menu" onMouseLeave={() => setBrandOpen(false)}>
              <div className="menu-label">产品表面 · Surface</div>
              {BRAND_MODES.map((m) => (
                <button key={m.id} className="menu-item" onClick={() => { onMode(m.id); setBrandOpen(false); }}>
                  <span className="mi-check">{mode === m.id ? <IconCheck size={14} /> : null}</span>
                  <span className="mi-body">
                    <div className="mi-title">{m.label}</div>
                    <div className="mi-desc">{m.desc}</div>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="dots-row">
          <span className="dots-label">Dots</span>
          <div className="dots-list">
            {threads.slice(0, 7).map((t) => (
              <button key={t.id} className={`dot-btn ${t.id === currentThreadId ? "on" : ""}`} title={t.title || "dot"} onClick={() => onThread(t)}>
                <Dot variant={((t.dot?.color as any) || "default")} size={20} state={dotStateFrom(t, t.status === "running" || running && t.id === currentThreadId, false)} />
              </button>
            ))}
            <button className="dot-add" title="新建 dot(带个性头像的 agent 会话)" onClick={onNewDot}><IconPlus size={12} /></button>
          </div>
        </div>
        <button className="new-chat" onClick={onNewChat}>
          <IconPlus size={14} /> New chat
        </button>
        <div className="sb-search">
          <IconSearch size={13} style={{ color: "var(--faint)" }} />
          <input placeholder="Search chats" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div style={{ position: "relative", padding: "0 10px" }}>
        <div className="project-row" onClick={() => setProjOpen(!projOpen)} style={{ cursor: "pointer" }}>
          <IconFolder size={13} />
          <span className="folder">{currentProject?.name || "No project"}</span>
          <button
            className="add-proj icon-btn"
            style={{ width: 20, height: 20 }}
            title="New project"
            onClick={(e) => {
              e.stopPropagation();
              onCreateProject();
            }}
          >
            <IconPlus size={13} />
          </button>
          <IconChevron size={12} dir={projOpen ? "up" : "down"} />
        </div>
        {projOpen && (
          <div
            className="menu"
            style={{ bottom: "auto", top: "100%", left: 10, right: 10, minWidth: 0 }}
            onMouseLeave={() => setProjOpen(false)}
          >
            {projects.map((p) => (
              <div key={p.id} className="proj-menu-row">
                <button
                  className="menu-item"
                  style={{ flex: 1 }}
                  onClick={() => {
                    onProject(p);
                    setProjOpen(false);
                  }}
                >
                  <span className="mi-check">{p.id === currentProject?.id ? <IconCheck size={14} /> : null}</span>
                  <span className="mi-body">
                    <div className="mi-title">{p.name}</div>
                    <div className="mi-desc" style={{ fontFamily: "var(--mono)" }}>{p.path}</div>
                  </span>
                </button>
                <button className="icon-btn" title="重命名" onClick={() => onRenameProject(p)}><IconPencil size={12} /></button>
                <button className="icon-btn" title="删除" onClick={() => onDeleteProject(p)}><IconTrash size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="scope-tabs">
        <button className={scope === "local" ? "on" : ""} onClick={() => setScope("local")}>本地</button>
        <button className={scope === "cloud" ? "on" : ""} onClick={() => setScope("cloud")}>云端</button>
      </div>
      {scope === "cloud" ? (
        <div className="cloud-scope">
          <div className="cs-title">云端会话</div>
          <div className="cs-sub">真实产品的云端任务跑在远程 VM 上;本地版以工作区模拟,云端分区暂为占位。</div>
          <div className="cs-row"><span className="status-dot" style={{ background: "var(--faint)" }} /><span>cloud-pc — 未连接</span></div>
          <button className="btn" onClick={() => setScope("local")}>回到本地会话</button>
        </div>
      ) : (
      <div className="sb-scroll">
        {groups.map((g) => (
          <React.Fragment key={g.label}>
            <div className="sb-group">{g.label}</div>
            {g.items.map((t) => (
              <div key={t.id} className={`thread-item ${t.id === currentThreadId ? "active" : ""}`} onClick={() => onThread(t)}>
                <span className={`status-dot ${t.status === "running" ? "running" : "idle"}`} />
                <span className="t-title">{t.title || "New chat"}{hits && hits.find((h) => h.id === t.id)?.sample?.[0] ? <span className="t-hit">…{hits.find((h) => h.id === t.id)!.sample[0].slice(0, 24)}</span> : null}</span>
                <button
                  className="t-del"
                  title="重命名"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRenameThread(t);
                  }}
                >
                  <IconPencil size={12} />
                </button>
                <button
                  className="t-del"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteThread(t.id);
                  }}
                >
                  <IconTrash size={13} />
                </button>
              </div>
            ))}
          </React.Fragment>
        ))}
        {filtered.length === 0 && <div className="sp-empty">No chats yet</div>}
      </div>
      )}
    </aside>
  );
}

function IconCheck({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
