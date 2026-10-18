import React, { useEffect, useState } from "react";

/* Startup brand mark — the official OpenEveryAgent logo (our own asset).
   Falls back to the product's original mascot if the image fails to load. */
export function BrandMark({ product, size = 92, fallback }: { product: string; size?: number; fallback: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), []);
  if (failed) return <>{fallback}</>;
  return (
    <div className="bm-wrap" style={{ width: size, height: size }}>
      <img
        src="/logo.png"
        alt="OpenEveryAgent"
        width={size}
        height={size}
        style={{ objectFit: "contain", borderRadius: Math.round(size * 0.18) }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
