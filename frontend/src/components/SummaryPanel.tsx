import React from "react";
import type { Block, ThreadMeta } from "../types";
import { IconGlobe, IconFile, IconCheck, IconClock, IconX } from "../icons";

export function SummaryPanel({
  thread,
  blocks,
  onClose,
  onJump,
  onOpenPreview,
  onRemoveSchedule,
}: {
  thread: ThreadMeta;
  blocks: Block[];
  onClose: () => void;
  onJump: (blockIndex: number) => void;
  onOpenPreview: (url: string, path: string) => void;
  onRemoveSchedule: (taskId: string) => void;
}) {
  const lastPlan = [...blocks].reverse().find((b) => b.kind === "plan") as Extract<Block, { kind: "plan" }> | undefined;
  const planIdx = lastPlan ? blocks.findIndex((b) => b === lastPlan) : -1;
  const files = blocks.flatMap((b, i) => (b.kind === "file_change" ? [{ ...b, idx: i }] : b.kind === "file_group" ? b.items.map((it) => ({ ...it, idx: i })) : []));
  const previews = blocks.flatMap((b, i) => (b.kind === "preview" ? [{ ...b, idx: i }] : []));
  const commands = blocks.filter((b) => b.kind === "command").length;
  const done = lastPlan ? lastPlan.items.filter((i) => i.done).length : 0;
  const total = lastPlan ? lastPlan.items.length : 0;
  const lastMsg = [...blocks].reverse().find((b) => b.kind === "agent_message") as Extract<Block, { kind: "agent_message" }> | undefined;
  const msgIdx = lastMsg ? blocks.findIndex((b) => b === lastMsg) : -1;

  return (
    <aside className="summary-panel">
      <div className="sp-tabs">
        <span className="sp-tab active" style={{ cursor: "default" }}>摘要</span>
        <span className="grow" />
        <button className="icon-btn" onClick={onClose}><IconX size={14} /></button>
      </div>
      <div className="summary-body">
        <div className="sm-section">
          <div className="sm-title">任务进度 {lastPlan && <span className="sm-count">{done}/{total}</span>}</div>
          {lastPlan ? (
            <>
              <div className="sm-progress"><i style={{ width: total ? `${(done / total) * 100}%` : "0%" }} /></div>
              {lastPlan.items.map((it, i) => (
                <div key={i} className={`plan-item ${it.done ? "done" : ""}`} style={{ padding: "3px 0" }}>
                  <span className={`check ${it.done ? "on" : ""}`}>{it.done ? "✓" : ""}</span>
                  {it.title}
                </div>
              ))}
              <button className="sm-jump" onClick={() => onJump(planIdx)}>定位到计划 ↗</button>
            </>
          ) : (
            <div className="sm-empty">本轮还没有计划</div>
          )}
        </div>

        <div className="sm-section">
          <div className="sm-title">变更文件 <span className="sm-count">{files.length}</span></div>
          {files.length === 0 && <div className="sm-empty">还没有文件变更</div>}
          {files.slice(-8).map((f, i) => (
            <button key={i} className="sm-file" onClick={() => onJump(f.idx)}>
              <IconFile size={12} style={{ color: "var(--faint)" }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.path}</span>
              <span className="stat-add">+{f.additions}</span>
              <span className="stat-del">−{f.deletions}</span>
            </button>
          ))}
        </div>

        <div className="sm-section">
          <div className="sm-title">网页预览</div>
          {previews.length === 0 && <div className="sm-empty">生成网页后在这里出现</div>}
          {previews.map((pv, i) => (
            <button key={i} className="sm-preview" onClick={() => onOpenPreview(pv.url, pv.path)}>
              <IconGlobe size={14} style={{ color: "#4a9eda" }} />
              {pv.path}
            </button>
          ))}
        </div>

        <div className="sm-section">
          <div className="sm-title">执行记录 <span className="sm-count">{commands} 条命令</span></div>
        </div>

        {(thread.scheduled || []).length > 0 && (
          <div className="sm-section">
            <div className="sm-title">计划任务</div>
            {thread.scheduled!.map((s) => (
              <div key={s.id} className="sm-task">
                <IconClock size={12} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.prompt}</span>
                <span className="sm-task-every">{s.everyMinutes}min</span>
                <button className="icon-btn" style={{ width: 18, height: 18 }} onClick={() => onRemoveSchedule(s.id)}><IconX size={11} /></button>
              </div>
            ))}
          </div>
        )}

        {lastMsg && (
          <div className="sm-section">
            <div className="sm-title">最新回复</div>
            <div className="sm-lastmsg" onClick={() => onJump(msgIdx)}>{lastMsg.text.slice(0, 160)}{lastMsg.text.length > 160 ? "…" : ""}</div>
          </div>
        )}
      </div>
    </aside>
  );
}
