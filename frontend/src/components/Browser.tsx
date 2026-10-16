import React, { useEffect, useState } from "react";
import { IconPlus, IconX, IconChevron, IconGlobe, IconFolder, IconTerminal, IconSummary } from "../icons";
import { api } from "../api";

interface Tab {
  id: string;
  url: string | null;
  hist: string[];
  idx: number;
  nonce: number;
}

let tabSeq = 0;
const newTab = (): Tab => ({ id: `t${++tabSeq}`, url: null, hist: [], idx: -1, nonce: 0 });

function looksLikeUrl(q: string) {
  return /^(https?:\/\/|\/|[\w.-]+\.[a-z]{2,}(:\d+)?(\/|$))/i.test(q) || /^(localhost|127\.|192\.168\.|10\.|preview\/|shots\/)/i.test(q);
}

export function Browser({
  initialUrl,
  initialNonce,
  onOpenTool,
  onOpenFile,
}: {
  initialUrl: string | null;
  initialNonce: number;
  onOpenTool: (tab: "files" | "terminal") => void;
  onOpenFile: (path: string) => void;
}) {
  const [tabs, setTabs] = useState<Tab[]>([newTab()]);
  const [activeId, setActiveId] = useState(tabs[0].id);
  const [omni, setOmni] = useState("");
  const [recent, setRecent] = useState<{ kind: "file" | "site"; path: string; url?: string; ts: number; thread: string }[]>([]);

  const active = tabs.find((t) => t.id === activeId) || tabs[0];

  useEffect(() => {
    api.outputs().then(setRecent).catch(() => {});
  }, [initialNonce]);

  useEffect(() => {
    if (initialUrl) navigate(initialUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNonce]);

  function patch(id: string, fn: (t: Tab) => Tab) {
    setTabs((ts) => ts.map((t) => (t.id === id ? fn(t) : t)));
  }

  function navigate(raw: string) {
    let url = raw.trim();
    if (!url) return;
    if (!looksLikeUrl(url)) url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(url)}`;
    else if (!/^https?:\/\//.test(url) && !url.startsWith("/")) url = `http://${url}`;
    patch(active.id, (t) => {
      const hist = [...t.hist.slice(0, t.idx + 1), url];
      return { ...t, url, hist, idx: hist.length - 1, nonce: t.nonce + 1 };
    });
    setOmni(url);
  }

  const go = (delta: number) => {
    patch(active.id, (t) => {
      const ni = t.idx + delta;
      if (ni < 0 || ni >= t.hist.length) return t;
      setOmni(t.hist[ni]);
      return { ...t, idx: ni, url: t.hist[ni], nonce: t.nonce + 1 };
    });
  };
  const reload = () => patch(active.id, (t) => ({ ...t, nonce: t.nonce + 1 }));

  const sites = recent.filter((r) => r.kind === "site").slice(0, 4);

  return (
    <div className="browser">
      <div className="browser-tabbar">
        {tabs.map((t) => (
          <div key={t.id} className={`browser-tab ${t.id === activeId ? "active" : ""}`} onClick={() => { setActiveId(t.id); setOmni(t.url || ""); }}>
            <IconGlobe size={11} style={{ opacity: t.url ? 0.8 : 0.4 }} />
            <span className="bt-title">{t.url ? t.url.replace(/^https?:\/\//, "").slice(0, 24) : "新标签页"}</span>
            {tabs.length > 1 && (
              <button
                className="bt-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setTabs((ts) => {
                    const next = ts.filter((x) => x.id !== t.id);
                    if (t.id === activeId && next[0]) setActiveId(next[0].id);
                    return next.length ? next : [newTab()];
                  });
                }}
              >
                <IconX size={10} />
              </button>
            )}
          </div>
        ))}
        <button className="bt-new" title="新标签页" onClick={() => { const t = newTab(); setTabs((ts) => [...ts, t]); setActiveId(t.id); setOmni(""); }}>
          <IconPlus size={12} />
        </button>
      </div>

      <div className="browser-nav">
        <button className="icon-btn" onClick={() => go(-1)} disabled={active.idx <= 0} style={{ opacity: active.idx <= 0 ? 0.35 : 1 }}><IconChevron size={14} dir="right" style={{ transform: "rotate(180deg)" }} /></button>
        <button className="icon-btn" onClick={() => go(1)} style={{ opacity: active.idx >= active.hist.length - 1 ? 0.35 : 1 }}><IconChevron size={14} dir="right" /></button>
        <button className="icon-btn" onClick={reload}><span style={{ fontSize: 14 }}>⟳</span></button>
        <input
          className="omnibox"
          placeholder="搜索或输入网址"
          value={omni}
          onChange={(e) => setOmni(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && navigate(omni)}
          onFocus={(e) => setTimeout(() => e.target.select(), 0)}
        />
      </div>

      {active.url ? (
        <iframe key={`${active.id}-${active.nonce}`} className="browser-frame" src={active.url} title="preview" sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals" />
      ) : (
        <div className="browser-newtab">
          <div className="nt-section">工具</div>
          <div className="nt-tools">
            <button className="nt-tool" onClick={() => onOpenTool("files")}>
              <IconFolder size={15} /> 文件 <span className="nt-kbd">⌘P</span>
            </button>
            <button className="nt-tool" onClick={() => onOpenTool("terminal")}>
              <IconTerminal size={15} /> 终端 <span className="nt-kbd">^`</span>
            </button>
            <button className="nt-tool" onClick={() => window.dispatchEvent(new CustomEvent("ocx:summary"))}>
              <IconSummary size={15} /> 摘要面板
            </button>
          </div>

          {sites.length > 0 && (
            <>
              <div className="nt-section">推荐</div>
              <div className="nt-recs">
                {sites.map((s, i) => (
                  <button key={i} className="nt-rec" onClick={() => navigate(s.url!)}>
                    <span className="nt-rec-ico"><IconGlobe size={26} /></span>
                    <span className="nt-rec-title">{s.thread.slice(0, 14)}…</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {recent.length > 0 && (
            <>
              <div className="nt-section">最近</div>
              <div className="nt-recent">
                {recent.slice(0, 8).map((r, i) => (
                  <button key={i} className="nt-recent-item" onClick={() => (r.kind === "site" && r.url ? navigate(r.url) : onOpenFile(r.path))}>
                    <span className={`nt-recent-ico ${r.kind}`}>{r.kind === "site" ? <IconGlobe size={15} /> : <IconFolder size={15} />}</span>
                    <span className="nt-recent-name">{r.kind === "site" ? r.url : r.path}</span>
                    <span className="nt-recent-time">{r.ts ? new Date(r.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {recent.length === 0 && <div className="sp-empty" style={{ marginTop: 30 }}>还没有产物 — 让 Codex 创建文件或站点后，会出现在这里。</div>}
        </div>
      )}
    </div>
  );
}
