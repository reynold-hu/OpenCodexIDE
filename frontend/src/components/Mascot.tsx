import React from "react";

export type MascotState = "idle" | "thinking" | "working" | "ready";

export function Mascot({ mode, state = "idle", size = 96 }: { mode: string; state?: MascotState; size?: number }) {
  if (mode === "grok") return <GrokBot state={state} size={size} />;
  if (mode === "muse") return <MuseHatch state={state} size={size} />;
  if (mode === "claude") return <ClaudeRay state={state} size={size} />;
  return <CodexOrb state={state} size={size} />;
}

/* 原创几何机器人:方头 + 天线 + 眨眼,状态驱动(机制参考 Rive state machine,零依赖 SVG/CSS 实现) */
function GrokBot({ state, size }: { state: MascotState; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={`mascot m-grok s-${state}`}>
      <g className="g-antenna">
        <line x1="32" y1="14" x2="32" y2="6" stroke="currentColor" strokeWidth="2" />
        <circle className="g-tip" cx="32" cy="5" r="2.6" fill="currentColor" />
      </g>
      <rect x="14" y="14" width="36" height="30" rx="9" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <g className="g-eyes">
        <rect x="22" y="25" width="6" height="8" rx="2.5" fill="currentColor" />
        <rect x="36" y="25" width="6" height="8" rx="2.5" fill="currentColor" />
      </g>
      <path className="g-mouth" d="M26 37 h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <g className="g-arms" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="10" y1="26" x2="14" y2="30" />
        <line x1="54" y1="26" x2="50" y2="30" />
      </g>
      <g className="g-wheels" stroke="currentColor" strokeWidth="2" fill="none">
        <line x1="24" y1="44" x2="24" y2="52" /><line x1="40" y1="44" x2="40" y2="52" />
      </g>
    </svg>
  );
}

/* 原创孵化生物:蛋 → 裂缝 → 探出眼睛的小团子(呼应 hatch 概念,美术全部自绘) */
function MuseHatch({ state, size }: { state: MascotState; size: number }) {
  const hatched = state === "ready";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={`mascot m-muse s-${state}`}>
      <g className="mu-egg">
        <path d="M32 8 C 44 22 48 34 48 42 a16 16 0 0 1 -32 0 c0-8 4-20 16-34z" fill="none" stroke="currentColor" strokeWidth="2.5" />
        {!hatched && <path className="mu-crack" d="M26 30 l4 5 -3 5 5 4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />}
      </g>
      <g className="mu-creature">
        <circle cx="32" cy="40" r="11" fill="currentColor" opacity="0.92" />
        <circle cx="28" cy="38" r="2" fill="var(--bg)" />
        <circle cx="36" cy="38" r="2" fill="var(--bg)" />
        <path d="M29 44 q3 2.5 6 0" stroke="var(--bg)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <line x1="32" y1="29" x2="32" y2="25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="32" cy="24" r="1.6" fill="currentColor" />
      </g>
    </svg>
  );
}

/* 原创呼吸射线标:12 条圆头射线,thinking 时旋转 */
function ClaudeRay({ state, size }: { state: MascotState; size: number }) {
  const rays = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={`mascot m-claude s-${state}`}>
      <g className="cr-rays">
        {rays.map((a) => (
          <line key={a} x1="32" y1="10" x2="32" y2="16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" transform={`rotate(${a} 32 32)`} />
        ))}
      </g>
      <circle className="cr-core" cx="32" cy="32" r="5" fill="currentColor" />
    </svg>
  );
}

/* 原创轨道球:核心 + 旋转环 + 卫星点 */
function CodexOrb({ state, size }: { state: MascotState; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={`mascot m-codex s-${state}`}>
      <circle cx="32" cy="32" r="9" fill="currentColor" className="co-core" />
      <g className="co-ring">
        <ellipse cx="32" cy="32" rx="22" ry="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" opacity="0.55" />
        <circle cx="54" cy="32" r="2.4" fill="currentColor" className="co-sat" />
      </g>
    </svg>
  );
}
