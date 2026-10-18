import React, { useEffect, useState } from "react";

/* Pluggable character packs — drop-in our own generated assets.
   Location: frontend/public/characters/<product>/manifest.json
   Manifest: { "name": "...", "states": { "idle": "idle.gif", "working": "working.gif", ... } }
   States match the mascot machine: idle | working | attention | celebrate | dizzy | heart | sleep */
export interface CharacterPack {
  name?: string;
  states?: Record<string, string>;
  variants?: Record<string, Record<string, string>>;
}

const cache = new Map<string, CharacterPack | null>();

export function useCharacterPack(product: string): CharacterPack | null {
  const [pack, setPack] = useState<CharacterPack | null>(cache.get(product) ?? null);
  useEffect(() => {
    if (cache.has(product)) { setPack(cache.get(product)!); return; }
    let live = true;
    fetch(`/characters/${product}/manifest.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => { cache.set(product, p); if (live) setPack(p); })
      .catch(() => { cache.set(product, null); if (live) setPack(null); });
    return () => { live = false; };
  }, [product]);
  return pack;
}

export function packStateFor(pack: CharacterPack | null, state: string): string | null {
  if (!pack?.states) return null;
  const s = pack.states[state] || pack.states.idle;
  return s ? `/characters/${state && s ? "" : ""}` : null; // path resolved by caller
}

export function PackImage({ product, pack, state, size, tint }: { product: string; pack: CharacterPack; state: string; size: number; tint?: string }) {
  const file = pack.states?.[state] || pack.states?.idle;
  if (!file) return null;
  return (
    <span className={`char-frame st-${state}`} style={{ width: size, height: size }}>
      <img
        className="char-pack-img"
        src={`/characters/${product}/${file}`}
        width={size}
        height={size}
        alt=""
        style={{ objectFit: "contain", filter: tint || undefined }}
        draggable={false}
      />
    </span>
  );
}

/* dot color variants → CSS tint applied to a neutral generated orb pack */
export const DOT_TINTS: Record<string, string | undefined> = {
  default: undefined,
  red: "hue-rotate(-28deg) saturate(1.5)",
  yellow: "hue-rotate(30deg) saturate(1.3) brightness(1.08)",
  green: "hue-rotate(95deg) saturate(1.2)",
  blue: "hue-rotate(195deg) saturate(1.2)",
  purple: "hue-rotate(255deg) saturate(1.15)",
  pink: "hue-rotate(315deg) saturate(1.3)",
};
