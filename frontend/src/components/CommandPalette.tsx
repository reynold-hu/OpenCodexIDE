import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ThreadMeta } from "../types";
import { IconPlus, IconGear, IconTerminal, IconBolt, IconSearch } from "../icons";

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  run: () => void;
}

export function CommandPalette({
  threads,
  onOpenThread,
  actions,
  onClose,
}: {
  threads: ThreadMeta[];
  onOpenThread: (t: ThreadMeta) => void;
  actions: PaletteAction[];
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const items = useMemo(() => {
    const ql = q.toLowerCase();
    const acts: PaletteAction[] = actions.filter((a) => a.label.toLowerCase().includes(ql));
    const thr = threads
      .filter((t) => (t.title || "New chat").toLowerCase().includes(ql))
      .slice(0, 8)
      .map<PaletteAction>((t) => ({
        id: `open-${t.id}`,
        label: t.title || "New chat",
        hint: "chat",
        icon: <IconBolt size={13} />,
        run: () => onOpenThread(t),
      }));
    return [...thr, ...acts];
  }, [q, threads, actions, onOpenThread]);

  useEffect(() => setSel(0), [q]);

  const runAt = (i: number) => {
    const it = items[i];
    if (!it) return;
    it.run();
    onClose();
  };

  return (
    <div className="overlay" onMouseDown={onClose} style={{ justifyContent: "flex-start" }}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px", borderBottom: "1px solid var(--border)" }}>
          <IconSearch size={15} style={{ color: "var(--faint)" }} />
          <input
            ref={inputRef}
            style={{ border: "none", padding: "14px 0" }}
            placeholder="Type a command or search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter") {
                runAt(sel);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
          />
        </div>
        <div className="palette-list">
          {items.map((it, i) => (
            <button key={it.id} className={`palette-item ${i === sel ? "sel" : ""}`} onClick={() => runAt(i)} onMouseEnter={() => setSel(i)}>
              {it.icon || <IconPlus size={13} />}
              {it.label}
              {it.hint && <span className="pi-kbd">{it.hint}</span>}
            </button>
          ))}
          {items.length === 0 && <div className="sp-empty">No matching commands</div>}
        </div>
      </div>
    </div>
  );
}
