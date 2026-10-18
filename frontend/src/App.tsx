import React, { useEffect, useState } from "react";
import CodexShell from "./shells/CodexShell";
import ClaudeShell from "./shells/ClaudeShell";
import MuseShell from "./shells/MuseShell";
import GrokShell from "./shells/GrokShell";
import { LockScreen } from "./components/LockScreen";

const PRODUCT: string = (import.meta as any).env.VITE_PRODUCT || "codex";

export default function App() {
  useEffect(() => {
    const titles: Record<string, string> = { codex: "OpenEveryAgent · Codex", claude: "OpenEveryAgent · Claude", muse: "OpenEveryAgent · Muse", grok: "OpenEveryAgent · Grok Bot" };
    document.title = titles[PRODUCT] || "OpenEveryAgent";
  }, []);
  if (PRODUCT === "claude") return <><LockScreen /><ClaudeShell /></>;
  if (PRODUCT === "muse") return <><LockScreen /><MuseShell /></>;
  if (PRODUCT === "grok") return <><LockScreen /><GrokShell /></>;
  return <><LockScreen /><CodexShell /></>;
}
