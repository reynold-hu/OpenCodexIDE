import React, { useEffect, useRef, useState } from "react";
import { IconPencil, IconPin, IconPlus, IconClock, IconCalendar, IconShare, IconCopy, IconExternal, IconArchive, IconChevron, IconBranch, IconRefresh, IconArrowDown, IconFile } from "../icons";

export function ThreadMenu({
  thread,
  onRename,
  onPin,
  onSideChat,
  onContinue,
  onFork,
  onWorktree,
  onRetry,
  onSchedule,
  onShare,
  onCopyTranscript,
  onExport,
  onPrint,
  onOpenWindow,
  onArchive,
}: {
  thread: { id: string; title: string; pinned?: boolean; archived?: boolean };
  onRename: () => void;
  onPin: () => void;
  onSideChat: () => void;
  onContinue: () => void;
  onFork: () => void;
  onWorktree: () => void;
  onRetry: () => void;
  onSchedule: () => void;
  onShare: () => void;
  onCopyTranscript: () => void;
  onExport: () => void;
  onPrint: () => void;
  onOpenWindow: () => void;
  onArchive: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [contOpen, setContOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const Item = ({ icon, label, kbd, onClick, danger }: { icon: React.ReactNode; label: string; kbd?: string; onClick: () => void; danger?: boolean }) => (
    <button
      className="tmenu-item"
      style={danger ? { color: "var(--accent-strong)" } : undefined}
      onClick={() => {
        setOpen(false);
        onClick();
      }}
    >
      <span className="tmi-ico">{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {kbd && <span className="tmi-kbd">{kbd}</span>}
    </button>
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className={`icon-btn ${open ? "active" : ""}`} title="Thread options" onClick={() => setOpen(!open)}>
        <IconChevron size={0} style={{ display: "none" }} />
        <span style={{ letterSpacing: 1, fontWeight: 700 }}>···</span>
      </button>
      {open && (
        <div className="tmenu">
          <Item icon={<IconPencil size={14} />} label="重命名" kbd="⌥⌘R" onClick={onRename} />
          <Item icon={<IconPin size={14} />} label={thread.pinned ? "取消置顶" : "置顶"} kbd="⌥⌘P" onClick={onPin} />
          <div className="menu-sep" />
          <Item icon={<IconPlus size={14} />} label="新建侧边聊天" kbd="⌥S" onClick={onSideChat} />
          <div
            className="tmenu-item"
            onMouseEnter={() => setContOpen(true)}
            onMouseLeave={() => setContOpen(false)}
            style={{ position: "relative" }}
          >
            <span className="tmi-ico"><IconExternal size={14} /></span>
            <span style={{ flex: 1 }}>继续</span>
            <IconChevron size={12} dir="right" />
            {contOpen && (
              <div className="tmenu" style={{ position: "absolute", top: -6, left: "100%", marginLeft: 2 }}>
                <Item icon={<IconClock size={14} />} label="继续上次任务" onClick={onContinue} />
                <Item icon={<IconExternal size={14} />} label="Fork 到新对话" onClick={onFork} />
              </div>
            )}
          </div>
          <Item icon={<IconCalendar size={14} />} label="添加计划任务…" onClick={onSchedule} />
          <Item icon={<IconBranch size={14} />} label="在独立工作树中运行" onClick={onWorktree} />
          <Item icon={<IconRefresh size={14} />} label="重试上一轮" onClick={onRetry} />
          <div className="menu-sep" />
          <Item icon={<IconShare size={14} />} label="分享" onClick={onShare} />
          <Item icon={<IconCopy size={14} />} label="复制对话" onClick={onCopyTranscript} />
          <Item icon={<IconArrowDown size={14} />} label="导出 Markdown" onClick={onExport} />
          <Item icon={<IconFile size={14} />} label="导出 PDF(打印)" onClick={onPrint} />
          <div className="menu-sep" />
          <Item icon={<IconExternal size={14} />} label="在新窗口中打开" onClick={onOpenWindow} />
          <div className="menu-sep" />
          <Item icon={<IconArchive size={14} />} label={thread.archived ? "取消归档" : "归档"} kbd="⇧⌘A" onClick={onArchive} danger={!thread.archived} />
        </div>
      )}
    </div>
  );
}
