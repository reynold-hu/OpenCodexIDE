import React, { useEffect, useState } from "react";
import { Mascot } from "./Mascot";

export function CloudPanel({ onOpenTerminal }: { onOpenTerminal: () => void }) {
  const [phase, setPhase] = useState<"idle" | "provisioning" | "booting" | "ready">("idle");

  const boot = () => {
    setPhase("provisioning");
    setTimeout(() => setPhase("booting"), 1200);
    setTimeout(() => setPhase("ready"), 3000);
  };

  return (
    <div className="cloud-panel">
      <div className="cloud-note">
        真实产品的 Grok Bot / Muse 背后是一台<strong>云端 VM</strong>。本地无法复刻远程桌面，
        这里是一个诚实的占位模拟：agent 实际运行在你本机的 workspace 里。
      </div>

      {phase === "idle" ? (
        <button className="cloud-boot" onClick={boot}>⏻ 启动云端 PC（模拟）</button>
      ) : (
        <div className="cloud-vm">
          <div className="cloud-vm-bar">
            <span className={`status-dot ${phase === "ready" ? "idle" : "running"}`} style={phase === "ready" ? { background: "var(--green)" } : undefined} />
            <span className="cv-title">{phase === "provisioning" ? "正在分配实例…" : phase === "booting" ? "启动系统…" : "cloud-pc · ready"}</span>
            <button className="cv-close" onClick={() => setPhase("idle")}>×</button>
          </div>
          <div className="cloud-screen">
            {phase !== "ready" ? (
              <div className="cv-boot-anim"><span /><span /><span /></div>
            ) : (
              <div className="cv-desktop">
                <div className="cv-window">
                  <div className="cv-win-bar"><i /><i /><i /></div>
                  <div className="cv-term">
                    <p>$ workspace mounted</p>
                    <p>$ agent: <b>local</b> (placeholder for remote VM)</p>
                    <p className="cv-blink">$ ▊</p>
                  </div>
                </div>
                <button className="cv-use-local" onClick={onOpenTerminal}>用本地终端操作这台"机器" →</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CloudPcCard({ state, mode }: { state: string; mode?: string }) {
  const [shown, setShown] = useState(state);
  useEffect(() => {
    if (state === "provisioning") {
      const t = setTimeout(() => setShown("ready"), 1600);
      return () => clearTimeout(t);
    }
    setShown(state);
  }, [state]);
  return (
    <div className="card cloud-card">
      <div className="cmd-line">
        <Mascot mode={mode || "grok"} state={shown === "ready" ? "ready" : "working"} size={22} />
        <span className="cmd-text">云端 PC {shown === "ready" ? "已就绪（本地占位模拟）" : "分配中…"}</span>
        <span className="ch-meta">placeholder</span>
      </div>
    </div>
  );
}
