import React, { useCallback, useEffect, useState } from "react";
import type { Block, ThreadMeta } from "../types";
import { api } from "../api";
import { IconGlobe, IconFile, IconX, IconClock, IconPlus, IconTerminal, IconChevron } from "../icons";

export function SummaryPanel({
  thread,
  blocks,
  projectId,
  refreshToken,
  onClose,
  onJump,
  onOpenPreview,
  onOpenCanvas,
  onAddSource,
}: {
  thread: ThreadMeta;
  blocks: Block[];
  projectId: string;
  refreshToken: number;
  onClose: () => void;
  onJump: (blockIndex: number) => void;
  onOpenPreview: (url: string, path: string) => void;
  onOpenCanvas: (path: string) => void;
  onAddSource: (url: string) => void;
}) {
  const [schedOpen, setSchedOpen] = useState(true);
  const [procs, setProcs] = useState<{ id: string; cmd: string; pid: number; running: boolean }[]>([]);
  const [procCmd, setProcCmd] = useState("");
  const [logFor, setLogFor] = useState<string | null>(null);
  const [logText, setLogText] = useState("");

  const refreshProcs = useCallback(() => {
    api.processes(projectId).then(setProcs).catch(() => {});
  }, [projectId]);
  useEffect(() => {
    refreshProcs();
    const t = setInterval(refreshProcs, 5000);
    return () => clearInterval(t);
  }, [refreshProcs, refreshToken]);

  const lastPlan = [...blocks].reverse().find((b) => b.kind === "plan") as Extract<Block, { kind: "plan" }> | undefined;
  const planIdx = lastPlan ? blocks.findIndex((b) => b === lastPlan) : -1;
  const fileItems = blocks.flatMap((b, i) => (b.kind === "file_change" ? [{ ...b, idx: i }] : b.kind === "file_group" ? b.items.map((it) => ({ ...it, idx: i })) : []));
  const previews = blocks.flatMap((b, i) => (b.kind === "preview" ? [{ ...b, idx: i }] : []));
  const sources = blocks.flatMap((b, i) => (b.kind === "source" ? [{ ...b, idx: i }] : []));
  const subs = blocks.filter((b) => b.kind === "subagent") as Extract<Block, { kind: "subagent" }>[];
  const adds = fileItems.filter((f) => !f.reverted).reduce((s, f) => s + f.additions, 0);
  const dels = fileItems.filter((f) => !f.reverted).reduce((s, f) => s + f.deletions, 0);
  const doneSubs = subs.filter((s) => s.done).length;
  const done = lastPlan ? lastPlan.items.filter((i) => i.done).length : 0;
  const total = lastPlan ? lastPlan.items.length : 0;

  const showLog = async (id: string) => {
    if (logFor === id) return setLogFor(null);
    const r = await api.procLog(projectId, id);
    setLogText(r.log || "(empty)");
    setLogFor(id);
  };

  return (
    <aside className="summary-panel">
      <div className="sp-tabs">
        <span className="sp-tab active" style={{ cursor: "default" }}>摘要</span>
        <span className="grow" />
        <button className="icon-btn" onClick={onClose}><IconX size={14} /></button>
      </div>
      <div className="summary-body">
        {(thread.scheduled || []).length > 0 && (
          <div className="sm-section">
            <div className="sm-title clickable" onClick={() => setSchedOpen(!schedOpen)}>
              <IconChevron size={11} dir={schedOpen ? "up" : "down"} /> 定时任务
            </div>
            {schedOpen && thread.scheduled!.map((s) => (
              <div key={s.id} className="sm-task">
                <IconClock size={12} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.prompt}</span>
                <span className="sm-task-every">每 {s.everyMinutes} 分钟</span>
              </div>
            ))}
          </div>
        )}

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
          <div className="sm-title"><IconPlus size={12} style={{ transform: "rotate(45deg)" }} /> 变更 <span className="stat-add" style={{ marginLeft: "auto" }}>+{adds.toLocaleString()}</span> <span className="stat-del">-{dels.toLocaleString()}</span></div>
          {fileItems.length === 0 && <div className="sm-empty">还没有文件变更</div>}
          {fileItems.slice(-6).map((f, i) => (
            <button key={i} className="sm-file" onClick={() => onJump(f.idx)}>
              <IconFile size={12} style={{ color: "var(--faint)" }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.path}</span>
              <span className="stat-add">+{f.additions}</span>
              <span className="stat-del">−{f.deletions}</span>
            </button>
          ))}
        </div>

        <div className="sm-section">
          <div className="sm-title">输出内容 <span className="sm-add-btn" onClick={() => { const u = prompt("添加来源链接 URL："); if (u) onAddSource(u); }}>+</span></div>
          {previews.length === 0 && fileItems.length === 0 && <div className="sm-empty">创建文件或站点</div>}
          {fileItems.slice(-4).reverse().map((f, i) => (
            <button key={`f${i}`} className="sm-file" onClick={() => onOpenCanvas(f.path)}>
              <IconFile size={13} style={{ color: "var(--green)" }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{f.path}</span>
            </button>
          ))}
          {previews.map((pv, i) => (
            <button key={`p${i}`} className="sm-file" onClick={() => onOpenPreview(pv.url, pv.path)}>
              <IconGlobe size={13} style={{ color: "#4a9eda" }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{pv.path}</span>
            </button>
          ))}
        </div>

        {subs.length > 0 && (
          <div className="sm-section">
            <div className="sm-title">子智能体 <span className="sm-count">{doneSubs} 完成</span></div>
            {subs.slice(-4).map((s, i) => (
              <div key={i} className="sm-sub">
                <span className={`sm-sub-dot ${s.done ? "done" : ""}`} />
                {s.prompt.slice(0, 40)}
              </div>
            ))}
          </div>
        )}

        <div className="sm-section">
          <div className="sm-title">来源 <span className="sm-add-btn" onClick={() => { const u = prompt("添加来源链接 URL："); if (u) onAddSource(u); }}>+</span></div>
          {sources.length === 0 && <div className="sm-empty">Agent 引用的链接会记录在这里</div>}
          {sources.slice(-6).map((s, i) => (
            <a key={i} className="sm-file" href={s.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              <IconGlobe size={12} style={{ color: "var(--faint)", flex: "0 0 auto" }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title || s.url.replace(/^https?:\/\//, "")}</span>
            </a>
          ))}
        </div>

        <div className="sm-section">
          <div className="sm-title">后台进程</div>
          {procs.length === 0 && <div className="sm-empty">无。让 Codex 跑 dev server，或手动启动：</div>}
          {procs.map((p) => (
            <div key={p.id} className="sm-proc">
              <div className="sm-proc-row">
                <IconTerminal size={12} style={{ color: "var(--faint)" }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--mono)", fontSize: 11.5 }}>{p.cmd}</span>
                <span className={`status-dot ${p.running ? "running" : "idle"}`} style={p.running ? {} : { background: "var(--faint)" }} />
                {p.running && <button className="sm-proc-stop" onClick={() => api.stopProcess(projectId, p.id).then(refreshProcs)}>停止</button>}
                <button className="sm-proc-stop" onClick={() => showLog(p.id)}>{logFor === p.id ? "收起" : "日志"}</button>
              </div>
              {logFor === p.id && <pre className="sm-proc-log">{logText}</pre>}
            </div>
          ))}
          <div className="sm-proc-add">
            <input placeholder="npm run dev …" value={procCmd} onChange={(e) => setProcCmd(e.target.value)} onKeyDown={async (e) => {
              if (e.key === "Enter" && procCmd.trim()) {
                await api.startProcess(projectId, procCmd.trim());
                setProcCmd("");
                refreshProcs();
              }
            }} />
          </div>
        </div>
      </div>
    </aside>
  );
}
