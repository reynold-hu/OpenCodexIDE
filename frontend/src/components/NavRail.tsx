import React, { useEffect, useRef, useState } from "react";
import {
  IconHome, IconLayers, IconClock, IconLibrary, IconDots, IconGrid, IconCalendar,
  IconGear, IconArrowDown, IconPencil, IconTrash,
} from "../icons";

export type RailView = "home" | "artifacts" | "history" | "projects" | "automations" | "more" | "apps";

const ITEMS: { id: RailView; label: string; icon: React.ReactNode }[] = [
  { id: "home", label: "Home · 新对话", icon: <IconHome size={17} /> },
  { id: "artifacts", label: "Artifacts · 产物", icon: <IconLayers size={17} /> },
  { id: "history", label: "History · 全部对话", icon: <IconClock size={17} /> },
  { id: "projects", label: "Projects · 项目", icon: <IconLibrary size={17} /> },
  { id: "automations", label: "Automations · 自动化", icon: <IconCalendar size={17} /> },
  { id: "more", label: "More · 关于与设置", icon: <IconDots size={17} /> },
  { id: "apps", label: "Apps · 产品表面", icon: <IconGrid size={17} /> },
];

export function NavRail({
  view, onView, account, onSettings, onShortcuts, onThemeToggle, onReset, onAvatar,
}: {
  view: RailView;
  onView: (v: RailView) => void;
  account: { name: string; email: string; avatar?: string };
  onSettings: () => void;
  onShortcuts: () => void;
  onThemeToggle: () => void;
  onReset: () => void;
  onAvatar: (dataUrl: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuOpen]);

  return (
    <nav className="nav-rail">
      {ITEMS.map((it) => (
        <button key={it.id} className={`rail-btn ${view === it.id ? "active" : ""}`} title={it.label} onClick={() => onView(it.id)}>
          {it.icon}
        </button>
      ))}
      <span style={{ flex: 1 }} />
      <div className="rail-avatar-wrap" ref={wrapRef}>
        <button className="rail-avatar" title={`${account.name} · 账户`} onClick={() => setMenuOpen(!menuOpen)}>
          {account.avatar ? <img src={account.avatar} alt="" /> : <span>{(account.name || "U")[0].toUpperCase()}</span>}
        </button>
        {menuOpen && (
          <div className="rail-menu">
            <div className="rail-menu-head">
              <span className="rail-menu-avatar">
                {account.avatar ? <img src={account.avatar} alt="" /> : <span>{(account.name || "U")[0].toUpperCase()}</span>}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="rm-name">{account.name}</div>
                <div className="rm-mail">{account.email}</div>
              </div>
            </div>
            <div className="menu-sep" />
            <button className="tmenu-item" onClick={() => { setMenuOpen(false); onSettings(); }}><span className="tmi-ico"><IconGear size={13} /></span>设置</button>
            <button className="tmenu-item" onClick={() => { setMenuOpen(false); onShortcuts(); }}><span className="tmi-ico"><IconPencil size={13} /></span>键盘快捷键<span className="tmi-kbd">⌘/</span></button>
            <button className="tmenu-item" onClick={() => { setMenuOpen(false); onThemeToggle(); }}><span className="tmi-ico"><IconArrowDown size={13} style={{ transform: "rotate(180deg)" }} /></span>切换主题</button>
            <button className="tmenu-item" onClick={() => { setMenuOpen(false); fileRef.current?.click(); }}><span className="tmi-ico"><IconPencil size={13} /></span>更换头像…</button>
            <div className="menu-sep" />
            <button className="tmenu-item" onClick={() => { setMenuOpen(false); onReset(); }}><span className="tmi-ico"><IconTrash size={13} /></span>重置所有数据</button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = () => onAvatar(String(r.result || ""));
            r.readAsDataURL(f);
            e.target.value = "";
          }}
        />
      </div>
    </nav>
  );
}
