import React, { useState } from "react";
import type { Block, FileChangeItem } from "../types";
import { Markdown } from "../Markdown";
import { IconCheck, IconChevron, IconShield, IconX, IconFile, IconGlobe, IconUndo, IconCopy, IconThumbUp, IconThumbDown, IconSpeaker, IconExternal, IconCalendar, IconPencil, IconProcess } from "../icons";

export function DiffView({ patch }: { patch: string }) {
  const lines = patch.split("\n");
  return (
    <pre className="diff">
      {lines.map((l, i) => {
        let cls = "ctx";
        if (l.startsWith("+++") || l.startsWith("---") || l.startsWith("diff ") || l.startsWith("new file")) cls = "file";
        else if (l.startsWith("@@")) cls = "hunk";
        else if (l.startsWith("+")) cls = "add";
        else if (l.startsWith("-")) cls = "del";
        return (
          <span key={i} className={cls}>
            {l || " "}
            {"\n"}
          </span>
        );
      })}
    </pre>
  );
}

export function PlanCard({ block }: { block: Extract<Block, { kind: "plan" }> }) {
  const [open, setOpen] = useState(true);
  const done = block.items.filter((i) => i.done).length;
  return (
    <div className="card">
      <div className="card-head" onClick={() => setOpen(!open)}>
        <IconCheck size={14} style={{ color: done === block.items.length && done > 0 ? "var(--green)" : "var(--faint)" }} />
        <span className="ch-label">Plan</span>
        <span className="ch-meta">{done}/{block.items.length}</span>
        <IconChevron size={13} dir={open ? "up" : "down"} style={{ color: "var(--faint)" }} />
      </div>
      {open && (
        <div className="plan-list">
          {block.items.map((it, i) => (
            <div key={i} className={`plan-item ${it.done ? "done" : ""}`}>
              <span className={`check ${it.done ? "on" : ""}`}>{it.done ? <IconCheck size={9} /> : null}</span>
              {it.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CommandCard({ block, onApprove }: { block: Extract<Block, { kind: "command" }>; onApprove?: (id: string, d: "approve" | "deny") => void }) {
  const [open, setOpen] = useState(true);
  const awaiting = block.status === "awaiting_approval";
  return (
    <div className="card cmd-card">
      <div className="cmd-line" onClick={() => (block.output ? setOpen(!open) : undefined)} style={{ cursor: block.output ? "pointer" : "default" }}>
        {block.status === "running" && <span className="spinner" />}
        {block.status === "success" && <span className="status-ico ok"><IconCheck size={13} /></span>}
        {block.status === "failed" && <span className="status-ico fail"><IconX size={13} /></span>}
        {block.status === "denied" && <span className="status-ico fail"><IconShield size={12} /></span>}
        {awaiting && <span className="status-ico wait"><IconShield size={13} /></span>}
        <span className="dollar">$</span>
        <span className="cmd-text">{block.cmd}</span>
        {block.durationMs !== undefined && <span className="ch-meta">{(block.durationMs / 1000).toFixed(1)}s</span>}
        {block.output ? <IconChevron size={12} dir={open ? "up" : "down"} style={{ color: "var(--faint)" }} /> : null}
      </div>
      {awaiting && onApprove && (
        <div className="approve-row">
          <button className="btn-allow" onClick={() => onApprove(block.approvalId || block.id, "approve")}>Allow</button>
          <button className="btn-deny" onClick={() => onApprove(block.approvalId || block.id, "deny")}>Deny</button>
        </div>
      )}
      {block.status === "denied" && <div className="cmd-out">[{block.reason || "denied"}]</div>}
      {open && block.output && <pre className="cmd-out">{block.output}</pre>}
    </div>
  );
}

export function FileGroupCard({
  items,
  onUndo,
  onViewChanges,
  onOpenCanvas,
}: {
  items: FileChangeItem[];
  onUndo?: (paths: string[]) => void;
  onViewChanges?: () => void;
  onOpenCanvas?: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const adds = items.reduce((s, i) => s + i.additions, 0);
  const dels = items.reduce((s, i) => s + i.deletions, 0);
  const reverted = items.every((i) => i.reverted);
  const visible = expanded ? items : items.slice(0, 3);
  return (
    <div className="card">
      <div className="fcard-head">
        <span className="fcard-ico"><IconFile size={15} /></span>
        <div className="fcard-title">
          <div className="fcard-label">{reverted ? "已撤销变更" : `已编辑 ${items.length} 个文件`}</div>
          {!reverted && <div className="fcard-stat"><span className="stat-add">+{adds}</span> <span className="stat-del">-{dels}</span></div>}
        </div>
        <span style={{ flex: 1 }} />
        {!reverted && onUndo && (
          <button className="fcard-btn" onClick={() => onUndo(items.map((i) => i.path))}>
            撤销 <IconUndo size={13} />
          </button>
        )}
        {onViewChanges && (
          <button className="fcard-btn primary" onClick={onViewChanges}>查看变更</button>
        )}
      </div>
      <div className="fcard-files">
        {visible.map((f, i) => (
          <div key={i} className="fcard-file" onClick={() => !f.reverted && onOpenCanvas?.(f.path)}>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: f.reverted ? "line-through" : undefined }}>{f.path}</span>
            <span className="stat-add">+{f.additions}</span>
            <span className="stat-del">-{f.deletions}</span>
          </div>
        ))}
        {items.length > 3 && (
          <button className="fcard-more" onClick={() => setExpanded(!expanded)}>
            {expanded ? "收起" : `再显示 ${items.length - 3} 个文件`} <IconChevron size={12} dir={expanded ? "up" : "down"} />
          </button>
        )}
      </div>
    </div>
  );
}

export function PreviewCard({ url, path, onOpenPreview, onOpenWindow }: { url: string; path: string; onOpenPreview: (url: string, path: string) => void; onOpenWindow: (url: string) => void }) {
  const [menu, setMenu] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [shooting, setShooting] = useState(false);
  const shoot = async () => {
    setShooting(true);
    try {
      const r = await fetch(`/api/projects/${(window as any).__ocxProjectId || ""}/screenshot`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path }) });
      const j = await r.json();
      if (j.url) setShot(j.url);
      else alert(j.error || "截图失败");
    } catch (e: any) {
      alert(String(e?.message || e));
    }
    setShooting(false);
  };
  return (
    <div className="card preview-card">
      <div className="fcard-head">
        <span className="fcard-ico globe"><IconGlobe size={16} /></span>
        <div className="fcard-title">
          <div className="fcard-label">网页预览</div>
          <div className="fcard-sub">网站 · {path}</div>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ position: "relative" }}>
          <button className="fcard-btn" onClick={() => setMenu(!menu)}>打开方式 <IconChevron size={11} dir={menu ? "up" : "down"} /></button>
          {menu && (
            <div className="tmenu open-left" onMouseLeave={() => setMenu(false)}>
              <button className="tmenu-item" onClick={() => { setMenu(false); onOpenPreview(url, path); }}><span className="tmi-ico"><IconGlobe size={13} /></span>在预览面板打开</button>
              <button className="tmenu-item" onClick={() => { setMenu(false); onOpenWindow(url); }}><span className="tmi-ico"><IconExternal size={13} /></span>在新窗口打开</button>
              <button className="tmenu-item" onClick={() => { setMenu(false); shoot(); }}>{shooting ? "截图中…" : "无头浏览器截图"}<span className="tmi-ico"><IconCalendar size={13} /></span></button>
            </div>
          )}
        </div>
      </div>
      {shot && <img className="preview-shot" src={shot} alt="screenshot" onClick={() => onOpenWindow(shot)} />}
    </div>
  );
}

export function MessageFooter({ block, threadId, onFeedback }: { block: Extract<Block, { kind: "agent_message" }>; threadId: string; onFeedback: (eventId: string, v: "up" | "down") => void }) {
  const speak = () => {
    try {
      const u = new SpeechSynthesisUtterance(block.text.slice(0, 2000));
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch {}
  };
  return (
    <div className="msg-footer">
      <button className="mf-btn" title="复制" onClick={() => navigator.clipboard.writeText(block.text)}><IconCopy size={13} /></button>
      <button className="mf-btn" title="朗读" onClick={speak}><IconSpeaker size={13} /></button>
      <button className={`mf-btn ${block.feedback === "up" ? "on" : ""}`} title="赞" onClick={() => onFeedback(block.id, "up")}><IconThumbUp size={13} /></button>
      <button className={`mf-btn ${block.feedback === "down" ? "on" : ""}`} title="踩" onClick={() => onFeedback(block.id, "down")}><IconThumbDown size={13} /></button>
    </div>
  );
}

export function ProcessCard({ block, projectId }: { block: Extract<Block, { kind: "process" }>; projectId: string }) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState("");
  const [stopped, setStopped] = useState(false);
  const toggle = async () => {
    if (!open && !log) {
      try {
        const r = await fetch(`/api/projects/${projectId}/processes/${block.id}/log`).then((x) => x.json());
        setLog(r.log || "(empty)");
      } catch {
        setLog("(unavailable)");
      }
    }
    setOpen(!open);
  };
  return (
    <div className="card cmd-card">
      <div className="cmd-line">
        <span className={`status-dot ${stopped ? "idle" : "running"}`} style={stopped ? { background: "var(--faint)" } : undefined} />
        <span className="dollar"><IconProcess size={12} /></span>
        <span className="cmd-text">{block.cmd}</span>
        <span className="ch-meta">pid {block.pid}</span>
        {!stopped && (
          <button
            className="fcard-btn"
            style={{ padding: "2px 8px" }}
            onClick={async () => {
              await fetch(`/api/projects/${projectId}/processes/${block.id}/stop`, { method: "POST" });
              setStopped(true);
            }}
          >
            停止
          </button>
        )}
        <button className="fcard-btn" style={{ padding: "2px 8px" }} onClick={toggle}>{open ? "收起" : "日志"}</button>
      </div>
      {open && <pre className="cmd-out">{log}</pre>}
    </div>
  );
}

export function UserBubble({ block, onRevise, onRestore }: { block: Extract<Block, { kind: "prompt" }>; onRevise?: (ts: number, newPrompt: string) => void; onRestore?: (hash: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(block.text);
  if (editing) {
    return (
      <div className="user-row user-edit">
        <textarea value={draft} rows={2} onChange={(e) => setDraft(e.target.value)} autoFocus />
        <div className="ue-actions">
          <button className="btn primary" onClick={() => { setEditing(false); if (draft.trim() && block.ts) onRevise?.(block.ts, draft.trim()); }}>保存并重跑</button>
          <button className="btn" onClick={() => { setEditing(false); setDraft(block.text); }}>取消</button>
        </div>
      </div>
    );
  }
  return (
    <div className="user-wrap">
      <div className="user-row">{block.text}</div>
      <div className="user-actions">
        {block.ts && onRevise && (
          <button className="ua-btn" title="编辑并重跑" onClick={() => setEditing(true)}><IconPencil size={11} /></button>
        )}
        {block.checkpoint && onRestore && (
          <button className="ua-btn" title={`回退到此轮之前 (${block.checkpoint.slice(0, 7)})`} onClick={() => onRestore(block.checkpoint!)}><IconUndo size={11} /></button>
        )}
      </div>
    </div>
  );
}

export function BlockView({
  block,
  onRevise,
  onRestore,
  onApprove,
  onUndoFiles,
  onViewChanges,
  onOpenCanvas,
  onOpenPreview,
  onOpenWindow,
  threadId,
  onFeedback,
  projectId,
}: {
  block: Block;
  onApprove?: (id: string, d: "approve" | "deny") => void;
  onUndoFiles?: (paths: string[]) => void;
  onViewChanges?: () => void;
  onOpenCanvas?: (path: string) => void;
  onOpenPreview?: (url: string, path: string) => void;
  onOpenWindow?: (url: string) => void;
  threadId?: string;
  onFeedback?: (eventId: string, v: "up" | "down") => void;
  projectId?: string;
  onRevise?: (ts: number, newPrompt: string) => void;
  onRestore?: (hash: string) => void;
}) {
  switch (block.kind) {
    case "prompt":
      return <UserBubble block={block} onRevise={onRevise} onRestore={onRestore} />;
    case "agent_message":
      return (
        <div style={{ width: "100%" }}>
          <Markdown text={block.text} />
          {block.done && threadId && onFeedback && <MessageFooter block={block} threadId={threadId} onFeedback={onFeedback} />}
        </div>
      );
    case "plan":
      return <PlanCard block={block} />;
    case "command":
      return <CommandCard block={block} onApprove={onApprove} />;
    case "file_change":
      return <FileGroupCard items={[block]} onUndo={onUndoFiles} onViewChanges={onViewChanges} onOpenCanvas={onOpenCanvas} />;
    case "file_group":
      return <FileGroupCard items={block.items} onUndo={onUndoFiles} onViewChanges={onViewChanges} onOpenCanvas={onOpenCanvas} />;
    case "preview":
      return <PreviewCard url={block.url} path={block.path} onOpenPreview={onOpenPreview || (() => {})} onOpenWindow={onOpenWindow || (() => window.open(block.url))} />;
    case "process":
      return projectId ? <ProcessCard block={block} projectId={projectId} /> : null;
    case "source":
    case "subagent":
      return null;
    case "error":
      return <div className="agent-msg" style={{ color: "var(--accent-strong)" }}>{block.message}</div>;
    default:
      return null;
  }
}
