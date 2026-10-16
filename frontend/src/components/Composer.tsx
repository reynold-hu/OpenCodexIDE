import React, { useEffect, useRef, useState } from "react";
import type { ApprovalMode, ModelInfo } from "../types";
import { IconCheck, IconChevron, IconSend, IconStop, IconShield, IconBolt } from "../icons";

const APPROVAL_MODES: { id: ApprovalMode; name: string; desc: string }[] = [
  { id: "auto", name: "Auto", desc: "Run commands without asking" },
  { id: "ask", name: "Ask for approvals", desc: "Confirm before mutating commands" },
  { id: "read-only", name: "Read-only", desc: "Deny commands that change files" },
];

function PillMenu({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="menu" ref={ref}>
      {children}
    </div>
  );
}

export function Composer({
  value,
  onChange,
  onSend,
  running,
  model,
  models,
  onModel,
  approvalMode,
  onApprovalMode,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string) => void;
  running: boolean;
  model: string;
  models: ModelInfo[];
  onModel: (id: string) => void;
  approvalMode: ApprovalMode;
  onApprovalMode: (m: ApprovalMode) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [modelOpen, setModelOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) ta.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);

  const modelInfo = models.find((m) => m.id === model);
  const modeInfo = APPROVAL_MODES.find((m) => m.id === approvalMode) || APPROVAL_MODES[0];

  const send = () => {
    const v = value.trim();
    if (!v || running) return;
    onSend(v);
  };

  return (
    <div className="composer">
      <textarea
        ref={ta}
        rows={1}
        value={value}
        placeholder={placeholder || "Ask Codex anything…"}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="composer-bar">
        <div style={{ position: "relative" }}>
          <button className={`pill ${modelOpen ? "active" : ""}`} onClick={() => setModelOpen(!modelOpen)}>
            <IconBolt size={12} />
            {modelInfo?.name || "Model"}
            <IconChevron size={11} dir={modelOpen ? "up" : "down"} />
          </button>
          <PillMenu open={modelOpen} onClose={() => setModelOpen(false)}>
            <div className="menu-label">Model</div>
            {models.map((m) => (
              <button
                key={m.id}
                className="menu-item"
                onClick={() => {
                  onModel(m.id);
                  setModelOpen(false);
                }}
              >
                <span className="mi-check">{m.id === model ? <IconCheck size={14} /> : null}</span>
                <span className="mi-body">
                  <div className="mi-title">{m.name}</div>
                  <div className="mi-desc">{m.desc} · {m.context} context</div>
                </span>
              </button>
            ))}
          </PillMenu>
        </div>

        <div style={{ position: "relative" }}>
          <button className={`pill ${modeOpen ? "active" : ""}`} onClick={() => setModeOpen(!modeOpen)}>
            {modeInfo.id !== "auto" ? <IconShield size={12} className="mode-warn" /> : <IconShield size={12} />}
            <span className={modeInfo.id === "read-only" ? "mode-warn" : ""}>{modeInfo.name}</span>
            <IconChevron size={11} dir={modeOpen ? "up" : "down"} />
          </button>
          <PillMenu open={modeOpen} onClose={() => setModeOpen(false)}>
            <div className="menu-label">Approvals</div>
            {APPROVAL_MODES.map((m) => (
              <button
                key={m.id}
                className="menu-item"
                onClick={() => {
                  onApprovalMode(m.id);
                  setModeOpen(false);
                }}
              >
                <span className="mi-check">{m.id === approvalMode ? <IconCheck size={14} /> : null}</span>
                <span className="mi-body">
                  <div className="mi-title">{m.name}</div>
                  <div className="mi-desc">{m.desc}</div>
                </span>
              </button>
            ))}
          </PillMenu>
        </div>

        <span className="grow" />
        {running ? (
          <button className="send-btn stop-btn" title="Running…">
            <IconStop />
          </button>
        ) : (
          <button className={`send-btn ${value.trim() ? "enabled" : ""}`} onClick={send} title="Send">
            <IconSend />
          </button>
        )}
      </div>
    </div>
  );
}
