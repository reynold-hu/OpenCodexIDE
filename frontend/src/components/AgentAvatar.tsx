import React from "react";

/* original geometric agent avatars — shape + color deterministic per member */
function hexPoints(c: number, r: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(c + r * Math.cos(a)).toFixed(1)},${(c + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

export function AgentAvatar({ color = "#888", shape = "round", size = 22, pulse = false }: { color?: string; shape?: string; size?: number; pulse?: boolean }) {
  const s = size;
  const half = s / 2;
  let el: React.ReactNode;
  switch (shape) {
    case "hex":
      el = <polygon points={hexPoints(half, half - 2)} fill={color} />;
      break;
    case "square":
      el = <rect x="2" y="2" width={s - 4} height={s - 4} rx={s * 0.14} fill={color} />;
      break;
    case "triangle":
      el = <polygon points={`${half},2 ${s - 2},${s - 2} 2,${s - 2}`} fill={color} />;
      break;
    case "circle":
      el = <circle cx={half} cy={half} r={half - 2} fill={color} />;
      break;
    case "diamond":
      el = <polygon points={`${half},2 ${s - 2},${half} ${half},${s - 2} 2,${half}`} fill={color} />;
      break;
    default:
      el = <rect x="2" y="2" width={s - 4} height={s - 4} rx={half - 2} fill={color} />;
  }
  const eye = Math.max(1.2, s * 0.07);
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} className={`agent-avatar ${pulse ? "pulse" : ""}`}>
      {el}
      <circle cx={half * 0.72} cy={half * 0.85} r={eye} fill="rgba(255,255,255,0.9)" />
      <circle cx={half * 1.28} cy={half * 0.85} r={eye} fill="rgba(255,255,255,0.9)" />
    </svg>
  );
}
