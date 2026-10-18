import React, { useEffect, useRef, useState } from "react";
import { Dot } from "./Dot";
import { IconX } from "../icons";

/* Dot voice-call surface — local placeholder for the server-managed calls the
   real product offers. Uses Web Speech (TTS + recognition), original code. */
export function VoiceCall({ open, onClose, color, lastMessage, onSend }: {
  open: boolean;
  onClose: () => void;
  color: string;
  lastMessage: string;
  onSend: (text: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [heard, setHeard] = useState("");
  const recRef = useRef<any>(null);
  const spokenRef = useRef("");

  useEffect(() => {
    if (!open) {
      try { speechSynthesis.cancel(); } catch {}
      try { recRef.current?.stop?.(); } catch {}
      setListening(false);
      setSpeaking(false);
      return;
    }
    if (lastMessage && spokenRef.current !== lastMessage) {
      spokenRef.current = lastMessage;
      try {
        const u = new SpeechSynthesisUtterance(lastMessage.replace(/[`#*_\[\]()]/g, "").slice(0, 800));
        u.onstart = () => setSpeaking(true);
        u.onend = () => setSpeaking(false);
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
      } catch {}
    }
  }, [open, lastMessage]);

  if (!open) return null;

  const toggleMic = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (listening) {
      recRef.current?.stop?.();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = navigator.language || "zh-CN";
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let t = "";
      for (const r of e.results) t += r[0].transcript;
      setHeard(t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setHeard("");
    setListening(true);
    rec.start();
  };

  const sendHeard = () => {
    if (!heard.trim()) return;
    onSend(heard.trim());
    setHeard("");
    recRef.current?.stop?.();
    setListening(false);
  };

  return (
    <div className="overlay call-overlay" onMouseDown={onClose}>
      <div className="call-card" onMouseDown={(e) => e.stopPropagation()}>
        <button className="icon-btn call-close" onClick={onClose}><IconX size={14} /></button>
        <div className="call-orb"><Dot variant={color as any} size={110} state={speaking || listening ? "running" : "idle"} ring /></div>
        <h2>语音通话</h2>
        <div className="call-status">{speaking ? "正在朗读回复…" : listening ? "在听你说…" : "点麦克风开始说话"}</div>
        <div className="call-sub">真实产品的通话由云端托管;本地版使用浏览器 Web Speech 模拟</div>
        {heard && <div className="call-heard">“{heard}”</div>}
        <div className="call-actions">
          <button className={`call-mic ${listening ? "on" : ""}`} onClick={listening ? sendHeard : toggleMic} title={listening ? "发送" : "说话"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" /></svg>
          </button>
          <button className="btn" onClick={() => { try { speechSynthesis.cancel(); } catch {} onClose(); }}>结束通话</button>
        </div>
      </div>
    </div>
  );
}
