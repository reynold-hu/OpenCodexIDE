import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { Project, ThreadMeta } from "../types";
import { IconPlus, IconSearch, IconGear, IconTrash, IconFolder, IconChevron } from "../icons";

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
  onSettings,
  account,
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
  onSettings: () => void;
  account: { name: string; email: string };
}) {
  const [search, setSearch] = useState("");
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
        <div className="sb-brand">
          <span className="name">OpenCodex</span>
          <button className="icon-btn" title="New chat" onClick={onNewChat}>
            <IconPlus size={15} />
          </button>
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
              <button
                key={p.id}
                className="menu-item"
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
            ))}
          </div>
        )}
      </div>

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

      <div className="sb-foot">
        <span className="avatar">{(account.name || "U")[0].toUpperCase()}</span>
        <span className="who">{account.name}</span>
        <button className="icon-btn" title="Settings" onClick={onSettings}>
          <IconGear size={15} />
        </button>
      </div>
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
