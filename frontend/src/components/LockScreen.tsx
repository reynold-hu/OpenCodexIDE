import React, { useEffect, useState } from "react";
import { Dot } from "./Dot";
import { authenticatePasskey, passkeySupported } from "../lib/webauthn";

export const TOKEN_KEY = "oea-token";

export function LockScreen() {
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const onLocked = () => setLocked(true);
    window.addEventListener("oea:locked", onLocked);
    // probe once on boot
    fetch("/api/passkey/status").then((r) => r.json()).then((s) => {
      if (s.enabled && !s.unlocked) setLocked(true);
    }).catch(() => {});
    return () => window.removeEventListener("oea:locked", onLocked);
  }, []);

  if (!locked) return null;

  const unlock = async () => {
    setBusy(true);
    setErr("");
    try {
      const { token } = await authenticatePasskey();
      sessionStorage.setItem(TOKEN_KEY, token);
      setLocked(false);
      location.reload();
    } catch (e: any) {
      setErr(e?.message?.includes("cancelled") ? "已取消" : "验证失败,请重试");
    }
    setBusy(false);
  };

  return (
    <div className="lock-overlay">
      <div className="lock-card">
        <Dot variant="default" size={72} state="sleeping" ring />
        <h2>已锁定</h2>
        <p>使用 Touch ID / 系统密码解锁 OpenEveryAgent</p>
        {passkeySupported() ? (
          <button className="btn primary" onClick={unlock} disabled={busy}>
            {busy ? "等待验证…" : "使用 Passkey 解锁"}
          </button>
        ) : (
          <div className="lock-warn">此浏览器不支持 WebAuthn</div>
        )}
        {err && <div className="lock-err">{err}</div>}
      </div>
    </div>
  );
}
