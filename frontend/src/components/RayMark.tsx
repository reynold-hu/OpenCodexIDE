import React from "react";

/* original breathing ray mark (Claude-style surface, own artwork) */
export function ClaudeRayMark({ size = 22 }: { size?: number }) {
  const rays = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="ray-mark">
      <g className="ray-rays">
        {rays.map((a) => (
          <line key={a} x1="32" y1="12" x2="32" y2="18" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" transform={`rotate(${a} 32 32)`} />
        ))}
      </g>
      <circle cx="32" cy="32" r="4.5" fill="currentColor" />
    </svg>
  );
}
