import React, { useEffect, useRef, useState } from "react";
import type { ApprovalMode, ModelInfo } from "../types";
import { IconCheck, IconChevron, IconSend, IconStop, IconShield, IconBolt, IconFile } from "../icons";
import { api } from "../api";

const SLASH_COMMANDS = [
  { cmd: "/init", desc: "生成 AGENTS.md 项目约定" },
  { cmd: "/status", desc: "查看工作区状态" },
  { cmd: "/model ", desc: "切换模型,如 /model deepseek-chat" },
  { cmd: "/compact", desc: "压缩较早上下文为摘要" },
];

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
  projectId,
  onStop,
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
  projectId?: string;
  onStop?: () => void;
}) {
  const [modelOpen, setModelOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [files, setFiles] = useState<{ name: string; path: string; dir: boolean }[]>([]);
  const [mentionQ, setMentionQ] = useState<string | null>(null);
  const [slashOpen, setSlashOpen] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (projectId) api.tree(projectId).then(setFiles).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (value.startsWith("/")) setSlashOpen(SLASH_COMMANDS.some((c) => c.cmd.startsWith(value.split(" ")[0])));
    else setSlashOpen(false);
    const m = value.match(/@([\w./-]*)$/);
    setMentionQ(m ? m[1].toLowerCase() : null);
  }, [value]);

  const pickMention = (path: string) => {
    onChange(value.replace(/@([\w./-]*)$/, `@${path}`));
    setMentionQ(null);
    ta.current?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
    if (!item || !projectId) return;
    e.preventDefault();
    const file = item.getAsFile();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = String(reader.result || "");
      const name = `uploads/pasted-${Date.now()}.png`;
      await api.upload(projectId, name, b64);
      onChange(`${value ? value + "\n" : ""}参考图片 @${name}\n`);
    };
    reader.readAsDataURL(file);
  };

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

  const attach = (file: File) => {
    if (file.size > 64 * 1024) {
      onChange(`${value}\n[attached file too large: ${file.name}]`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      onChange(`${value ? value + "\n\n" : ""}请结合附件内容工作：\n\n\`\`\`${file.name}\n${text.slice(0, 60000)}\n\`\`\``);
    };
    reader.readAsText(file);
  };

  return (
    <div className="composer">
      <div style={{ position: "relative" }}>
      <textarea
        ref={ta}
        rows={1}
        value={value}
        placeholder={placeholder || "Ask OpenCodex anything…"}
        onChange={(e) => onChange(e.target.value)}
        onPaste={handlePaste}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      {mentionQ !== null && (
        <div className="ac-popup">
          {files.filter((f) => !f.dir && f.path.toLowerCase().includes(mentionQ)).slice(0, 7).map((f) => (
            <button key={f.path} className="ac-item" onMouseDown={(e) => { e.preventDefault(); pickMention(f.path); }}>
              <IconFile size={12} /> <span>{f.path}</span>
            </button>
          ))}
          {files.filter((f) => !f.dir && f.path.toLowerCase().includes(mentionQ)).length === 0 && <div className="ac-empty">无匹配文件</div>}
        </div>
      )}
      {slashOpen && (
        <div className="ac-popup">
          {SLASH_COMMANDS.filter((c) => c.cmd.startsWith(value.split(" ")[0])).map((c) => (
            <button key={c.cmd} className="ac-item" onMouseDown={(e) => { e.preventDefault(); onChange(c.cmd === "/model " ? "/model " : c.cmd + " "); }}>
              <span style={{ fontFamily: "var(--mono)", color: "var(--accent)" }}>{c.cmd}</span>
              <span className="ac-desc">{c.desc}</span>
            </button>
          ))}
        </div>
      )}
      </div>
      <div className="composer-bar">
        <label className="pill" title="Attach text file" style={{ cursor: "pointer" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
          <input
            type="file"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) attach(f);
              e.target.value = "";
            }}
          />
        </label>
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
          <button className="send-btn stop-btn" title="停止" onClick={onStop}>
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
