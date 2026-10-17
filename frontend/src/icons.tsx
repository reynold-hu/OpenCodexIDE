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
export const IconHome = (p: P) => <S {...p}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></S>;
export const IconLayers = (p: P) => <S {...p}><path d="m12 2 10 6.5-10 6.5L2 8.5 12 2Z" /><path d="m2 15 10 6.5L22 15" /></S>;
export const IconLibrary = (p: P) => <S {...p}><path d="M4 4h4v16H4zM10 4h4v16h-4zM16.5 4.8l3.7.9-3.9 15.2-3.7-.95" /></S>;
export const IconAt = (p: P) => <S {...p}><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" /></S>;
export const IconDots = (p: P) => <S {...p}><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /></S>;
export const IconGrid = (p: P) => <S {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></S>;
export const IconPin = (p: P) => <S {...p}><path d="M12 17v5M9 3h6l1 7 2.5 2.5H5.5L8 10 9 3Z" /></S>;
export const IconArchive = (p: P) => <S {...p}><rect x="2" y="4" width="20" height="5" rx="1.5" /><path d="M4 9v10a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19V9M10 13h4" /></S>;
export const IconShare = (p: P) => <S {...p}><path d="M12 15V3m-4 7 4-7 4 7M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></S>;
export const IconCopy = (p: P) => <S {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></S>;
export const IconExternal = (p: P) => <S {...p}><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></S>;
export const IconUndo = (p: P) => <S {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></S>;
export const IconEye = (p: P) => <S {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></S>;
export const IconThumbUp = (p: P) => <S {...p}><path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></S>;
export const IconThumbDown = (p: P) => <S {...p}><path d="M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" /></S>;
export const IconSpeaker = (p: P) => <S {...p}><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" /></S>;
export const IconArrowDown = (p: P) => <S {...p}><path d="M12 5v14m-7-7 7 7 7-7" /></S>;
export const IconGlobe = (p: P) => <S {...p}><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" /></S>;
export const IconSummary = (p: P) => <S {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M3 9h6M3 15h6" /></S>;
export const IconCalendar = (p: P) => <S {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></S>;
export const IconAlert = (p: P) => <S {...p}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4M12 17h.01" /></S>;
export const IconRefresh = (p: P) => <S {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M21 3v5h-5M3 21v-5h5" /></S>;
export const IconArrowLeft = (p: P) => <S {...p}><path d="m12 19-7-7 7-7M19 12H5" /></S>;
export const IconCornerUpLeft = (p: P) => <S {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5V20" /></S>;
export const IconArrowUpRight = (p: P) => <S {...p}><path d="M7 17 17 7M7 7h10v10" /></S>;
export const IconLink = (p: P) => <S {...p}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></S>;
export const IconProcess = (p: P) => <S {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 9h6v6H9z" /></S>;
export const IconBranch = (p: P) => <S {...p}><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /><path d="M6 8.5v7M18 8.5a6 6 0 0 1-6 6h-2" /></S>;
