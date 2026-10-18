import { useCallback, useEffect, useRef, useState } from "react";

export type MascotState = "sleep" | "idle" | "working" | "attention" | "celebrate" | "dizzy" | "heart";

/* state machine mirroring the desktop-buddy concept:
   sleep = no session · idle = connected (rotating micro-anims) · working = turn running
   attention = approval pending · heart = approved <5s · celebrate = turn done / level-up
   dizzy = cancelled */
export function useMascotMachine(opts: {
  hasThread: boolean;
  running: boolean;
  awaitingApproval: boolean;
  tokenCount: number;
}) {
  const { hasThread, running, awaitingApproval, tokenCount } = opts;
  const [state, setState] = useState<MascotState>("sleep");
  const transient = useRef<MascotState | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const approvalAt = useRef(0);
  const level = useRef(0);

  const setTransient = (s: MascotState, ms: number) => {
    transient.current = s;
    setState(s);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      transient.current = null;
    }, ms);
  };

  useEffect(() => {
    if (awaitingApproval) {
      approvalAt.current = Date.now();
      setState("attention");
      return;
    }
    if (transient.current) return;
    if (running) setState("working");
    else if (!hasThread) setState("sleep");
    else setState("idle");
  }, [awaitingApproval, running, hasThread]);

  const notifyApproved = useCallback(() => {
    if (approvalAt.current && Date.now() - approvalAt.current < 5000) setTransient("heart", 2600);
    approvalAt.current = 0;
  }, []);

  const notifyCompleted = useCallback(() => {
    const lv = Math.floor(tokenCount / 50000);
    if (lv > level.current) {
      level.current = lv;
      setTransient("celebrate", 3800);
    } else {
      setTransient("celebrate", 2200);
    }
  }, [tokenCount]);

  const notifyCancelled = useCallback(() => setTransient("dizzy", 2200), []);

  return { state, notifyApproved, notifyCompleted, notifyCancelled, level: level.current };
}
