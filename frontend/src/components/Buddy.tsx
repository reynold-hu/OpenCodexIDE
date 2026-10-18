import React, { useState } from "react";
import { Mascot } from "./Mascot";
import type { MascotState } from "../lib/mascotState";

const LABELS: Record<MascotState, string> = {
  sleep: "睡着了…叫醒我",
  idle: "待命中",
  working: "干活中",
  attention: "等你审批!",
  celebrate: "搞定!",
  dizzy: "被取消了…",
  heart: "好快的批准 ♥",
};

export function Buddy({ mode, state, level = 0, hidden }: { mode: string; state: MascotState; level?: number; hidden?: boolean }) {
  const [pet, setPet] = useState(0);
  if (hidden) return null;
  return (
    <button
      className={`buddy ${state} ${pet ? "petted" : ""}`}
      title={LABELS[state]}
      onClick={() => { setPet(1); setTimeout(() => setPet(0), 700); }}
    >
      <Mascot mode={mode} state={state} size={46} level={level} />
      <span className="buddy-tip">{LABELS[state]}</span>
    </button>
  );
}
