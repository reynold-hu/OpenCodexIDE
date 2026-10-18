import React, { useEffect, useState } from "react";

/* Startup-screen brand mark.
   Tries user-provided local assets served from ~/.open-every-agent/brand/<product>.png
   (or .svg) — these live outside the repo and are never committed. Falls back to
   our original mark when absent. Third-party logos remain trademarks of their owners. */
export function BrandMark({ product, size = 92, fallback }: { product: string; size?: number; fallback: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [ext, setExt] = useState<"png" | "svg">("png");

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
    setExt("png");
  }, [product]);

  if (failed) return <>{fallback}</>;
  return (
    <div className="bm-wrap" style={{ width: size, height: size }}>
      <img
        src={`/brand/${product}.${ext}`}
        alt=""
        width={size}
        height={size}
        style={{ display: loaded ? "block" : "none", borderRadius: Math.round(size * 0.22), objectFit: "contain" }}
        onLoad={() => setLoaded(true)}
        onError={() => { if (ext === "png") setExt("svg"); else setFailed(true); }}
      />
      {!loaded && <span className="bm-ghost" style={{ opacity: 0 }}>{fallback}</span>}
    </div>
  );
}
