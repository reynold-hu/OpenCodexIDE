import React, { useState } from "react";
import type { Block } from "../types";
import { Markdown } from "../Markdown";
import { IconCheck, IconChevron, IconShield, IconX, IconFile } from "../icons";

function DiffView({ patch }: { patch: string }) {
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
              <span className={`check ${it.done ? "on" : ""}`}>{it.done ? "✓" : ""}</span>
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

export function FileChangeCard({ block }: { block: Extract<Block, { kind: "file_change" }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card">
      <div className="card-head patch-head" onClick={() => setOpen(!open)}>
        <IconFile size={14} style={{ color: "var(--muted)" }} />
        <span className="ch-label" style={{ fontFamily: "var(--mono)", fontSize: 12.5 }}>{block.path}</span>
        <span className="stat-add">+{block.additions}</span>
        <span className="stat-del">−{block.deletions}</span>
        <IconChevron size={13} dir={open ? "up" : "down"} style={{ color: "var(--faint)" }} />
      </div>
      {open && <DiffView patch={block.patch} />}
    </div>
  );
}

export function BlockView({ block, onApprove }: { block: Block; onApprove?: (id: string, d: "approve" | "deny") => void }) {
  switch (block.kind) {
    case "prompt":
      return <div className="user-row">{block.text}</div>;
    case "agent_message":
      return <Markdown text={block.text} />;
    case "plan":
      return <PlanCard block={block} />;
    case "command":
      return <CommandCard block={block} onApprove={onApprove} />;
    case "file_change":
      return <FileChangeCard block={block} />;
    case "error":
      return <div className="agent-msg" style={{ color: "var(--accent-strong)" }}>{block.message}</div>;
    default:
      return null;
  }
}
