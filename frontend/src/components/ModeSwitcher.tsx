import React from "react";

const MODES: [string, string][] = [["codex", "Codex"], ["claude", "Claude"], ["muse", "Muse"], ["grok", "Grok"]];

export default function ModeSwitcher({ current, onSwitch }: { current: string; onSwitch: (m: string) => void }) {
  return (
    <div className="app-switcher">
      {MODES.map(([id, label]) => (
        <button key={id} className={`as-pill ${current === id ? "on" : ""}`} onClick={() => id !== current && onSwitch(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}
