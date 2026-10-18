import React from "react";
import { IconHome, IconLayers, IconClock, IconLibrary, IconDots, IconGrid, IconGear, IconCalendar } from "../icons";

export type RailView = "home" | "artifacts" | "history" | "projects" | "automations" | "more";

const ITEMS: { id: RailView; label: string; icon: React.ReactNode }[] = [
  { id: "home", label: "Home", icon: <IconHome size={17} /> },
  { id: "artifacts", label: "Artifacts", icon: <IconLayers size={17} /> },
  { id: "history", label: "History", icon: <IconClock size={17} /> },
  { id: "projects", label: "Projects", icon: <IconLibrary size={17} /> },
  { id: "automations", label: "Automations", icon: <IconCalendar size={17} /> },
];

export function NavRail({ view, onView, onSettings }: { view: RailView; onView: (v: RailView) => void; onSettings: () => void }) {
  return (
    <nav className="nav-rail">
      {ITEMS.map((it) => (
        <button key={it.id} className={`rail-btn ${view === it.id ? "active" : ""}`} title={it.label} onClick={() => onView(it.id)}>
          {it.icon}
        </button>
      ))}
      <button className="rail-btn" title="More" onClick={() => onView("more")}>
        <IconDots size={17} />
      </button>
      <span className="rail-sep" />
      <button className="rail-btn" title="Apps (roadmap)" onClick={() => onView("more")}>
        <IconGrid size={17} />
      </button>
      <span style={{ flex: 1 }} />
      <button className="rail-btn" title="Settings" onClick={onSettings}>
        <IconGear size={16} />
      </button>
    </nav>
  );
}
