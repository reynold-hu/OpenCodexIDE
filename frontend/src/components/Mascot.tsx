import React from "react";
import type { MascotState } from "../lib/mascotState";

export type { MascotState };

/* Original characters, 7-state emotional machine (concept: desktop-buddy style;
   artwork & implementation 100% ours; rendered via CSS keyframes like the
   emotion/sand approach, state inputs like Rive). */
export function Mascot({ mode, state = "idle", size = 96, level = 0 }: { mode: string; state?: MascotState; size?: number; level?: number }) {
  const cls = `mascot m-${mode} st-${state}`;
  if (mode === "grok") return <GrokBot state={state} size={size} cls={cls} level={level} />;
  if (mode === "muse") return <MuseHatch state={state} size={size} cls={cls} level={level} />;
  if (mode === "claude") return <ClaudeRay state={state} size={size} cls={cls} level={level} />;
  return <CodexOrb state={state} size={size} cls={cls} level={level} />;
}

function Extras({ state }: { state: MascotState }) {
  return (
    <g className="fx">
      {state === "sleep" && <text className="fx-zzz" x="46" y="12" fontSize="10" fill="currentColor">z z</text>}
      {state === "working" && <circle className="fx-sweat" cx="50" cy="14" r="2.4" fill="#4a9eda" />}
      {state === "heart" && (
        <g className="fx-hearts" fill="#e04a6f">
          <path d="M12 10c1.2-1.6 3.4-.6 3 .8-.3 1.2-1.8 2.2-3 3.2-1.2-1-2.7-2-3-3.2-.4-1.4 1.8-2.4 3-.8Z" />
          <path d="M48 6c1.2-1.6 3.4-.6 3 .8-.3 1.2-1.8 2.2-3 3.2-1.2-1-2.7-2-3-3.2-.4-1.4 1.8-2.4 3-.8Z" />
        </g>
      )}
      {state === "celebrate" && (
        <g className="fx-confetti">
          {["#d9a520", "#4a9eda", "#00c853", "#e04a6f", "#7c6df2"].map((c, i) => (
            <rect key={i} x={6 + i * 12} y={2 + (i % 2) * 4} width="3" height="3" rx="0.8" fill={c} style={{ animationDelay: `${i * 0.12}s` }} />
          ))}
        </g>
      )}
      {state === "attention" && <g className="fx-alert"><circle cx="52" cy="10" r="5" fill="#d9a520" /><rect x="51.2" y="7" width="1.6" height="4" rx="0.8" fill="#fff" /><rect x="51.2" y="12" width="1.6" height="1.6" rx="0.8" fill="#fff" /></g>}
    </g>
  );
}

function Eyes({ state, x1 = 25.5, x2 = 38.5, y = 27, r = 2.6 }: { state: MascotState; x1?: number; x2?: number; y?: number; r?: number }) {
  if (state === "sleep") return <g className="eyes"><path d={`M${x1 - 3} ${y} h6`} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d={`M${x2 - 3} ${y} h6`} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></g>;
  if (state === "dizzy") return <g className="eyes"><text x={x1 - 3} y={y + 3} fontSize="8" fill="currentColor">@</text><text x={x2 - 3} y={y + 3} fontSize="8" fill="currentColor">@</text></g>;
  if (state === "heart") return <g className="eyes" fill="#e04a6f"><path d={`M${x1} ${y + 2}c-2.4-2.4-4.6-.6-3.6 1 .6 1 2.2 1.9 3.6 3 1.4-1.1 3-2 3.6-3 1-1.6-1.2-3.4-3.6-1Z`} /><path d={`M${x2} ${y + 2}c-2.4-2.4-4.6-.6-3.6 1 .6 1 2.2 1.9 3.6 3 1.4-1.1 3-2 3.6-3 1-1.6-1.2-3.4-3.6-1Z`} /></g>;
  return (
    <g className="eyes blink">
      <g className="pup">
        <circle cx={x1} cy={y} r={r} fill="currentColor" />
        <circle cx={x2} cy={y} r={r} fill="currentColor" />
      </g>
    </g>
  );
}

function Mouth({ state, y = 37 }: { state: MascotState; y?: number }) {
  if (state === "sleep") return <path className="mouth" d={`M29 ${y} q3 1.5 6 0`} stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />;
  if (state === "working") return <path className="mouth" d={`M28 ${y} h8`} stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />;
  if (state === "attention") return <ellipse className="mouth" cx="32" cy={y} rx="3" ry="3.6" fill="currentColor" />;
  if (state === "celebrate" || state === "heart") return <path className="mouth" d={`M26 ${y - 1} q6 6 12 0`} stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" />;
  if (state === "dizzy") return <path className="mouth" d={`M27 ${y} q2 -2 4 0 t4 0`} stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />;
  return <path className="mouth" d={`M28 ${y - 1} q4 3 8 0`} stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />;
}

function GrokBot({ state, size, cls, level }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={cls}>
      <Extras state={state} />
      <g className="g-antenna"><line x1="32" y1="14" x2="32" y2="6" stroke="currentColor" strokeWidth="2" /><circle className="g-tip" cx="32" cy="5" r="2.6" fill="currentColor" /></g>
      <g className="body">
        <rect x="14" y="14" width="36" height="30" rx="9" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <Eyes state={state} />
        <Mouth state={state} />
        <g className="g-arms" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="10" y1="26" x2="14" y2="30" /><line x1="54" y1="26" x2="50" y2="30" /></g>
        <g className="g-wheels" stroke="currentColor" strokeWidth="2"><line x1="24" y1="44" x2="24" y2="52" /><line x1="40" y1="44" x2="40" y2="52" /></g>
      </g>
      {level > 0 && <text x="32" y="62" textAnchor="middle" fontSize="7" fill="currentColor" className="lv">Lv{level}</text>}
    </svg>
  );
}

function MuseHatch({ state, size, cls, level }: any) {
  const hatched = state !== "sleep";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={cls}>
      <Extras state={state} />
      <g className="mu-egg">
        <path d="M32 8 C 44 22 48 34 48 42 a16 16 0 0 1 -32 0 c0-8 4-20 16-34z" fill="none" stroke="currentColor" strokeWidth="2.5" />
        {!hatched && <path className="mu-crack" d="M26 30 l4 5 -3 5 5 4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />}
      </g>
      <g className="mu-creature">
        <circle cx="32" cy="40" r="11" fill="currentColor" opacity="0.92" />
        <Eyes state={state} y={38} x1={28} x2={36} r={1.8} />
        <Mouth state={state} y={44} />
        <line x1="32" y1="29" x2="32" y2="25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle className="mu-ant-tip" cx="32" cy="24" r="1.6" fill="currentColor" />
      </g>
      {level > 0 && <text x="32" y="62" textAnchor="middle" fontSize="7" fill="currentColor" className="lv">Lv{level}</text>}
    </svg>
  );
}

function ClaudeRay({ state, size, cls }: any) {
  const rays = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={cls}>
      <Extras state={state} />
      <g className="cr-rays">
        {rays.map((a) => (
          <line key={a} x1="32" y1="10" x2="32" y2="16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" transform={`rotate(${a} 32 32)`} />
        ))}
      </g>
      <circle cx="32" cy="32" r="10" fill="currentColor" className="cr-core" />
      <g className="cr-face" fill="var(--bg)">
        {state === "sleep" ? (
          <><path d="M27 31 h4" stroke="var(--bg)" strokeWidth="1.6" strokeLinecap="round" /><path d="M33 31 h4" stroke="var(--bg)" strokeWidth="1.6" strokeLinecap="round" /></>
        ) : (
          <><circle cx="29" cy="31" r="1.6" /><circle cx="35" cy="31" r="1.6" /></>
        )}
        {state === "celebrate" || state === "heart" ? <path d="M28 35 q4 3 8 0" stroke="var(--bg)" strokeWidth="1.6" fill="none" strokeLinecap="round" /> : null}
        {state === "working" ? <path d="M29 35 h6" stroke="var(--bg)" strokeWidth="1.6" strokeLinecap="round" /> : null}
      </g>
    </svg>
  );
}

function CodexOrb({ state, size, cls, level }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={cls}>
      <Extras state={state} />
      <g className="co-ring">
        <ellipse cx="32" cy="32" rx="22" ry="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" opacity="0.55" />
        <circle cx="54" cy="32" r="2.4" fill="currentColor" className="co-sat" />
      </g>
      <circle cx="32" cy="32" r="10" fill="currentColor" className="co-core" />
      <g className="cr-face" fill="var(--bg)">
        {state === "sleep" ? (
          <><path d="M27 31 h4" stroke="var(--bg)" strokeWidth="1.6" strokeLinecap="round" /><path d="M33 31 h4" stroke="var(--bg)" strokeWidth="1.6" strokeLinecap="round" /></>
        ) : (
          <><circle cx="29" cy="31" r="1.6" /><circle cx="35" cy="31" r="1.6" /></>
        )}
        {state === "celebrate" || state === "heart" ? <path d="M28 35 q4 3 8 0" stroke="var(--bg)" strokeWidth="1.6" fill="none" strokeLinecap="round" /> : null}
      </g>
      {level > 0 && <text x="32" y="62" textAnchor="middle" fontSize="7" fill="currentColor" className="lv">Lv{level}</text>}
    </svg>
  );
}
