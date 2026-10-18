import React from "react";

/* OpenAI-Dots-style character orb — mechanism observed from the app's Dot module
   (gradient pairs + inner-shadow filter stack + spring states); implementation,
   palettes arrangement and code are our own. */
export const DOT_VARIANTS = ["default", "red", "yellow", "green", "blue", "purple", "pink"] as const;
export type DotVariant = (typeof DOT_VARIANTS)[number];

const PALETTES: Record<DotVariant, [string, string, string]> = {
  default: ["#FFB455", "#FF9C2C", "#FF9C2C"],
  red: ["#FF6C6F", "#FA6062", "#FA6062"],
  yellow: ["#FFE742", "#FFE236", "#FFCD0F"],
  green: ["#A9E597", "#7DCC60", "#7DCC60"],
  blue: ["#7CB6FF", "#3689EB", "#3689EB"],
  purple: ["#B99EF8", "#A47AF5", "#A47AF5"],
  pink: ["#F886B7", "#EE569F", "#EE569F"],
};

export function Dot({ variant = "default", size = 22, state = "idle", ring = false }: { variant?: DotVariant; size?: number; state?: "sleeping" | "idle" | "running" | "jumping"; ring?: boolean }) {
  const [c0, c1, c2] = PALETTES[variant] || PALETTES.default;
  const id = React.useId().replace(/:/g, "");
  return (
    <span className={`dot3d st-${state} ${ring ? "ring" : ""}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 56 56" fill="none">
        <defs>
          <linearGradient id={`g${id}`} x1="28" y1="4" x2="28" y2="52" gradientUnits="userSpaceOnUse">
            <stop stopColor={c0} />
            <stop offset="0.78" stopColor={c1} />
            <stop offset="1" stopColor={c2} />
          </linearGradient>
          <filter id={`f${id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feFlood floodOpacity="0" result="bg" />
            <feBlend in="SourceGraphic" in2="bg" result="shape" />
            <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="alpha" />
            <feOffset dy="2" result="off" />
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in2="alpha" operator="arithmetic" k2="-1" k3="1" result="inner" />
            <feColorMatrix in="inner" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.28 0" result="shadow" />
            <feBlend in="shape" in2="shadow" mode="multiply" result="lit" />
            <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="alpha2" />
            <feOffset dy="-2" result="off2" />
            <feGaussianBlur stdDeviation="1.2" result="blur2" />
            <feComposite in2="alpha2" operator="arithmetic" k2="-1" k3="1" result="top" />
            <feColorMatrix in="top" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.22 0" result="gloss" />
            <feBlend in="lit" in2="gloss" mode="normal" />
          </filter>
        </defs>
        <circle cx="28" cy="28" r="24" fill={`url(#g${id})`} filter={`url(#f${id})`} />
        <ellipse cx="21" cy="18" rx="7" ry="5" fill="white" opacity="0.22" />
      </svg>
    </span>
  );
}

export function dotStateFrom(thread: { status?: string; dot?: { color?: string; compact?: boolean } | null } | null, running: boolean, awaiting: boolean): "sleeping" | "idle" | "running" | "jumping" {
  if (running) return "running";
  if (awaiting) return "jumping";
  if (!thread) return "sleeping";
  return "idle";
}
