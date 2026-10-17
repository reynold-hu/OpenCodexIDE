import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Project } from "../types";
import { IconX, IconFile, IconFolder, IconChevron } from "../icons";
import { Browser } from "./Browser";

type Tab = "review" | "files" | "terminal" | "browser" | "canvas";

export function SidePanel({
  project,
  onClose,
  refreshToken,
  preview,
  canvasPath,
  onOpenCanvas,
  tabRequest,
  onOpenToolFromBrowser,
}: {
  project: Project;
  onClose: () => void;
  refreshToken: number;
  preview: { url: string; path: string } | null;
  canvasPath: string | null;
  onOpenCanvas: (p: string | null) => void;
  tabRequest: { tab: Tab; nonce: number };
  onOpenToolFromBrowser: (tab: "files" | "terminal") => void;
}) {
  const [tab, setTab] = useState<Tab>("review");
  const [browserNonce, setBrowserNonce] = useState(0);
  const [canvas, setCanvas] = useState<{ path: string; content: string } | null>(null);
  const [saved, setSaved] = useState("");
  const [previewKey, setPreviewKey] = useState(0);
  (window as any).__ocxProjectId = project.id;

  useEffect(() => {
    if (preview) {
      setTab("browser");
      setBrowserNonce((n) => n + 1);
    }
  }, [preview]);

  useEffect(() => {
    if (tabRequest.nonce) setTab(tabRequest.tab);
  }, [tabRequest.nonce]);
  useEffect(() => {
    if (canvasPath) {
      setTab("canvas");
      api.file(project.id, canvasPath).then((f) => setCanvas({ path: canvasPath, content: f.content })).catch(() => {});
    }
  }, [canvasPath, project.id]);
  const [changes, setChanges] = useState<{ file: string; kind: string }[]>([]);
  const [diff, setDiff] = useState("");
  const [treeFiles, setTreeFiles] = useState<{ name: string; path: string; dir: boolean }[]>([]);
  const [fileContent, setFileContent] = useState<{ path: string; content: string } | null>(null);
  const [termHistory, setTermHistory] = useState<{ cmd: string; out: string; code: number }[]>([]);
  const [termInput, setTermInput] = useState("");
  const [commitMsg, setCommitMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [diffFile, setDiffFile] = useState<string | null>(null);

  const refreshGit = useCallback(async () => {
    try {
      const r = await api.git(project.id);
      setChanges(r.status);
      setDiff(r.diff);
    } catch {}
  }, [project.id]);

  const refreshTree = useCallback(async () => {
    try {
      setTreeFiles(await api.tree(project.id));
    } catch {}
  }, [project.id]);

  useEffect(() => {
    if (tab === "review") refreshGit();
    if (tab === "files") refreshTree();
  }, [tab, refreshToken, refreshGit, refreshTree, project.id]);

  const runTerminal = async () => {
    const cmd = termInput.trim();
    if (!cmd || busy) return;
    setBusy(true);
    setTermInput("");
    try {
      const r = await api.terminal(project.id, cmd);
      setTermHistory((h) => [...h, { cmd, out: (r.stdout + (r.stderr ? `\n${r.stderr}` : "")).trim(), code: r.code }]);
    } catch (e: any) {
      setTermHistory((h) => [...h, { cmd, out: String(e?.message || e), code: 1 }]);
    }
    setBusy(false);
  };

  const openFile = async (p: string) => {
    try {
      const f = await api.file(project.id, p);
      setFileContent({ path: p, content: f.truncated ? `[file too large: ${f.size} bytes]` : f.content });
    } catch (e: any) {
      setFileContent({ path: p, content: `Error: ${e?.message}` });
    }
  };

  return (
    <aside className="side-panel">
      <div className="sp-tabs">
        {(["review", "files", "terminal", "browser", "canvas"] as Tab[]).map((t) => (
          <button key={t} className={`sp-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t === "review" ? "Review" : t === "files" ? "Files" : t === "terminal" ? "Terminal" : t === "browser" ? "浏览器" : "画布"}
          </button>
        ))}
        <span className="grow" />
        <button className="icon-btn" onClick={onClose} title="Close panel">
          <IconX size={14} />
        </button>
      </div>

      <div className="sp-body">
        {tab === "review" && (
          <>
            {changes.length === 0 && !diff ? (
              <div className="sp-empty">No pending changes — working tree is clean.</div>
            ) : (
              <>
                <div className="git-actions">
                  <input
                    className="select-like"
                    style={{ flex: 1, minWidth: 0 }}
                    placeholder="Commit message…"
                    value={commitMsg}
                    onChange={(e) => setCommitMsg(e.target.value)}
                  />
                  <button
                    className="btn primary"
                    disabled={busy || changes.length === 0}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await api.commit(project.id, commitMsg || "OpenCodex changes");
                        setCommitMsg("");
                        await refreshGit();
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Commit
                  </button>
                </div>
                {changes.map((c, i) => (
                  <div key={i} className="git-file-row" onClick={async () => {
                    if (diffFile === c.file) { setDiffFile(null); setDiff(""); }
                    else { setDiffFile(c.file); const d = await api.diffFile(project.id, c.file); setDiff(d); }
                  }} style={{ cursor: "pointer" }}>
                    <span className={`git-kind ${c.kind}`}>{c.kind === "added" || c.kind === "untracked" ? "A" : c.kind === "deleted" ? "D" : "M"}</span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{c.file}</span>
                    {diffFile === c.file && <span style={{ color: "var(--accent)", display: "grid" }}><IconChevron size={11} dir="up" /></span>}
                  </div>
                ))}
                {diff && (
                  <pre className="diff" style={{ marginTop: 10 }}>
                    {diff.split("\n").map((l, i) => {
                      let cls = "ctx";
                      if (l.startsWith("+++") || l.startsWith("---") || l.startsWith("diff ")) cls = "file";
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
                )}
              </>
            )}
          </>
        )}

        {tab === "files" && (
          <>
            {fileContent ? (
              <>
                <div className="git-file-row" style={{ marginBottom: 8 }}>
                  <IconFile size={13} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{fileContent.path}</span>
                  <button className="icon-btn" onClick={() => setFileContent(null)}><IconX size={13} /></button>
                </div>
                <pre className="diff" style={{ maxHeight: "none" }}>{fileContent.content}</pre>
              </>
            ) : (
              treeFiles.slice(0, 300).map((f) => (
                <div
                  key={f.path}
                  className="file-row"
                  style={{ paddingLeft: 8 + depthOf(f.path) * 12 }}
                  onClick={() => !f.dir && openFile(f.path)}
                >
                  {f.dir ? <IconFolder size={13} style={{ color: "var(--faint)" }} /> : <IconFile size={13} style={{ color: "var(--faint)" }} />}
                  <span className="fr-name">{f.name}</span>
                </div>
              ))
            )}
          </>
        )}

        {tab === "terminal" && (
          <>
            <div className="term-console">
              {termHistory.map((h, i) => (
                <div className="term-entry" key={i}>
                  <div className="term-cmd"><span className="dollar">$ </span>{h.cmd}</div>
                  {h.out && <div className="term-out">{h.out}</div>}
                  <div className={`term-exit ${h.code ? "fail" : ""}`}>{h.code ? `exit ${h.code}` : ""}</div>
                </div>
              ))}
              {termHistory.length === 0 && <div className="sp-empty">Run a shell command in the workspace…</div>}
            </div>
            <div className="term-input-row">
              <span className="dollar">$</span>
              <input
                value={termInput}
                placeholder={busy ? "running…" : `${project.name} $`}
                onChange={(e) => setTermInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runTerminal()}
              />
            </div>
          </>
        )}
        {tab === "browser" && (
          <div className="sp-browser">
            <Browser
              initialUrl={preview?.url || null}
              initialNonce={browserNonce}
              onOpenTool={(t) => onOpenToolFromBrowser(t)}
              onOpenFile={(path) => onOpenCanvas(path)}
            />
          </div>
        )}

        {tab === "canvas" && (
          canvas ? (
            <div className="canvas-wrap">
              <div className="preview-urlbar">
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{canvas.path}</span>
                <button className="btn" style={{ padding: "3px 8px" }} onClick={() => { setCanvas(null); onOpenCanvas(null); }}>关闭</button>
                <button
                  className="btn primary"
                  style={{ padding: "3px 10px" }}
                  onClick={async () => {
                    await api.saveFile(project.id, canvas.path, canvas.content);
                    setSaved("已保存 " + new Date().toLocaleTimeString());
                    refreshGit();
                    setTimeout(() => setSaved(""), 2500);
                  }}
                >
                  保存
                </button>
              </div>
              {saved && <div style={{ fontSize: 11, color: "var(--green)", margin: "4px 0" }}>{saved}</div>}
              <textarea
                className="canvas-editor"
                value={canvas.content}
                onChange={(e) => setCanvas({ ...canvas, content: e.target.value })}
                spellCheck={false}
              />
            </div>
          ) : (
            <div className="sp-empty">点击文件卡片上的文件名，在画布中编辑。</div>
          )
        )}
      </div>
    </aside>
  );
}

function depthOf(p: string) {
  return p.split("/").length - 1;
}
