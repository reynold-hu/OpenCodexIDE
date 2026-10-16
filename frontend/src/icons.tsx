import React from "react";

type P = { size?: number; className?: string; style?: React.CSSProperties };

const S = ({ size = 16, children, className, style }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    {children}
  </svg>
);

export const IconPlus = (p: P) => <S {...p}><path d="M12 5v14M5 12h14" /></S>;
export const IconSearch = (p: P) => <S {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></S>;
export const IconChevron = (p: P & { dir?: "up" | "down" | "right" }) => {
  const rot = { up: 180, down: 0, right: -90 }[p.dir || "down"];
  return <S {...p} style={{ transform: `rotate(${rot}deg)`, ...p.style }}><path d="m6 9 6 6 6-6" /></S>;
};
export const IconGear = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .33 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.33 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .33-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.33-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.33h0a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h0a1.7 1.7 0 0 0 1.87-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.33 1.87h0a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
  </S>
);
export const IconTrash = (p: P) => <S {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></S>;
export const IconSend = (p: P) => <S {...p} size={p.size || 14}><path d="M12 19V5M5 12l7-7 7 7" /></S>;
export const IconStop = (p: P) => <S {...p} size={p.size || 12}><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" /></S>;
export const IconCheck = (p: P) => <S {...p}><path d="M20 6 9 17l-5-5" /></S>;
export const IconX = (p: P) => <S {...p}><path d="M18 6 6 18M6 6l12 12" /></S>;
export const IconFolder = (p: P) => <S {...p}><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" /></S>;
export const IconFile = (p: P) => <S {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></S>;
export const IconPanel = (p: P) => <S {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M15 3v18" /></S>;
export const IconTerminal = (p: P) => <S {...p}><path d="m4 17 6-6-6-6M12 19h8" /></S>;
export const IconReview = (p: P) => <S {...p}><path d="M21 6H3M10 18H3M21 12H3" /></S>;
export const IconShield = (p: P) => <S {...p}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C16.51 3.81 19 5 21 5a1 1 0 0 1 1 1z" /></S>;
export const IconBolt = (p: P) => <S {...p}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></S>;
export const IconClock = (p: P) => <S {...p}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></S>;
export const IconPencil = (p: P) => <S {...p}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></S>;
