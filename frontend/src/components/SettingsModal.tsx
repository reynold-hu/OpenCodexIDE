import React, { useEffect, useState } from "react";
import type { ApprovalMode, ModelInfo, ProviderInfo, Settings } from "../types";
import { IconX, IconCheck } from "../icons";
import { api } from "../api";

export function SettingsModal({
  settings,
  models,
  providers,
  onChange,
  onClose,
  onReset,
}: {
  settings: Settings;
  models: ModelInfo[];
  providers: ProviderInfo[];
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
  onReset: () => void;
}) {
  const active = providers.find((p) => p.id === settings.provider) || providers[0];
  const conf = (settings.providers || {})[settings.provider] || {};
  const [keyDraft, setKeyDraft] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const [harnessInfo, setHarnessInfo] = useState("检测中…");
  useEffect(() => {
    fetch("/api/harness").then((r) => r.json()).then((h) => {
      const ms = Object.entries(h.opencodeModels || {}).map(([k, v]) => `${k}:${(v as string[]).slice(0, 2).join("/")}`).join("  ");
      setHarnessInfo(h.available ? `✓ 已安装 · ${ms}` : "✗ 未找到 opencode 二进制");
    }).catch(() => setHarnessInfo("查询失败"));
  }, []);

  const patchActive = (p: Record<string, unknown>) => {
    onChange({ providers: { [settings.provider]: p } } as Partial<Settings>);
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose}>
            <IconX size={15} />
          </button>
        </div>
        <div className="modal-body">
          <div className="menu-label" style={{ padding: "10px 0 4px" }}>MODEL PROVIDER</div>
          <div className="set-row">
            <div className="sr-label">
              <div className="sr-title">Provider</div>
              <div className="sr-desc">opencode-style: any OpenAI-compatible backend (DeepSeek, Qwen, Kimi, GLM, OpenRouter, Ollama…)</div>
            </div>
            <select className="select-like" value={settings.provider} onChange={(e) => onChange({ provider: e.target.value })}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {settings.provider !== "simulated" && (
            <>
              <div className="set-row">
                <div className="sr-label">
                  <div className="sr-title">API key {active.hasKey ? "(set — leave blank to keep)" : ""}</div>
                  <div className="sr-desc">Stored only in ~/.open-codex-ide/state.json on this machine</div>
                </div>
                <input
                  className="select-like"
                  style={{ width: 220 }}
                  type="password"
                  placeholder={active.hasKey ? "••••••••" : "sk-…"}
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  onBlur={() => {
                    if (keyDraft) {
                      patchActive({ apiKey: keyDraft });
                      setKeyDraft("");
                    }
                  }}
                />
              </div>
              <div className="set-row">
                <div className="sr-label">
                  <div className="sr-title">Base URL</div>
                  <div className="sr-desc">{active.defaultBaseUrl || "https://api.example.com/v1"}</div>
                </div>
                <input
                  className="select-like"
                  style={{ width: 220 }}
                  placeholder={active.defaultBaseUrl || ""}
                  defaultValue={conf.baseUrl || ""}
                  onBlur={(e) => {
                    if (e.target.value !== (conf.baseUrl || "")) patchActive({ baseUrl: e.target.value });
                  }}
                />
              </div>
              <div className="set-row">
                <div className="sr-label">
                  <div className="sr-title">Model</div>
                  <div className="sr-desc">Current: {active.model || settings.model}</div>
                </div>
                <input
                  className="select-like"
                  style={{ width: 220 }}
                  placeholder={active.models[0] || "model-name"}
                  defaultValue={conf.model || ""}
                  onBlur={(e) => {
                    if (e.target.value) patchActive({ model: e.target.value, models: Array.from(new Set([...(active.models || []), e.target.value])) });
                  }}
                />
                <button
                  className="btn"
                  onClick={async () => {
                    setSyncMsg("syncing…");
                    try {
                      const r = await api.providerModels(settings.provider);
                      patchActive({ models: r.models });
                      setSyncMsg(`ok · ${r.models.length} models`);
                    } catch (err: any) {
                      setSyncMsg(`✗ ${String(err?.message || err).slice(0, 60)}`);
                    }
                    setTimeout(() => setSyncMsg(""), 3000);
                  }}
                >
                  Sync
                </button>
              </div>
              {syncMsg && <div className="set-row" style={{ color: "var(--muted)", fontSize: 12 }}>{syncMsg}</div>}
            </>
          )}

          <div className="menu-label" style={{ padding: "14px 0 4px" }}>SKIN → PROVIDER 映射</div>
          {([["codex", "Codex"], ["claude", "Claude"], ["muse", "Muse"], ["grok", "Grok"]] as const).map(([id, label]) => (
            <div className="set-row" key={id}>
              <div className="sr-label"><div className="sr-title">{label} 模式默认 provider</div><div className="sr-desc">切换到该皮肤时自动启用</div></div>
              <select
                className="select-like"
                value={(settings.modeProviders || {})[id] || ""}
                onChange={(e) => onChange({ modeProviders: { ...(settings.modeProviders || {}), [id]: e.target.value } } as Partial<Settings>)}
              >
                <option value="">不改变</option>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          ))}

          {(import.meta as any).env.VITE_PRODUCT === "codex" && (
            <>
              <div className="menu-label" style={{ padding: "14px 0 4px" }}>AGENT HARNESS</div>
              <div className="set-row">
                <div className="sr-label">
                  <div className="sr-title">执行引擎</div>
                  <div className="sr-desc">opencode serve = 真实 agent 循环(自动拉起 headless server,复用其 provider 配置);内置 = 自带轻量循环/模拟器</div>
                </div>
                <div className="segmented">
                  <button className={(settings as any).harness !== "opencode" ? "on" : ""} onClick={() => onChange({ harness: "builtin" } as any)}>内置引擎</button>
                  <button className={(settings as any).harness === "opencode" ? "on" : ""} onClick={() => onChange({ harness: "opencode" } as any)}>opencode serve</button>
                </div>
              </div>
              <div className="set-row">
                <div className="sr-label"><div className="sr-title">opencode 可用性</div><div className="sr-desc">{harnessInfo}</div></div>
              </div>
            </>
          )}
          <div className="menu-label" style={{ padding: "14px 0 4px" }}>GENERAL</div>
          <div className="set-row">
            <div className="sr-label">
              <div className="sr-title">Appearance</div>
              <div className="sr-desc">Choose how OpenEveryAgent looks</div>
            </div>
            <div className="segmented">
              {(["dark", "light", "system"] as const).map((t) => (
                <button key={t} className={settings.theme === t ? "on" : ""} onClick={() => onChange({ theme: t })}>
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="set-row">
            <div className="sr-label">
              <div className="sr-title">Default model</div>
              <div className="sr-desc">Used for new chats</div>
            </div>
            <select className="select-like" value={settings.model} onChange={(e) => onChange({ model: e.target.value })}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="set-row">
            <div className="sr-label">
              <div className="sr-title">Approval mode</div>
              <div className="sr-desc">How Codex runs commands in your workspace</div>
            </div>
            <select className="select-like" value={settings.approvalMode} onChange={(e) => onChange({ approvalMode: e.target.value as ApprovalMode })}>
              <option value="auto">Auto</option>
              <option value="ask">Ask for approvals</option>
              <option value="read-only">Read-only</option>
            </select>
          </div>

          <div className="set-row">
            <div className="sr-label">
              <div className="sr-title">Notification sounds</div>
              <div className="sr-desc">Play a chime when a task finishes</div>
            </div>
            <button className={`switch ${settings.sounds ? "on" : ""}`} onClick={() => onChange({ sounds: !settings.sounds })} />
          </div>

          <div className="set-row">
            <div className="sr-label">
              <div className="sr-title">语音化身 Voice embodiment</div>
              <div className="sr-desc">Muse/Grok 风格:任务完成后用语音朗读回复(皮肤决定音色倾向)</div>
            </div>
            <button className={`switch ${(settings as any).voice ? "on" : ""}`} onClick={() => onChange({ voice: !(settings as any).voice } as Partial<Settings>)} />
          </div>

          <div className="set-row">
            <div className="sr-label">
              <div className="sr-title">桌面宠物 Buddy</div>
              <div className="sr-desc">右下角常驻形象,7 种情绪跟随任务状态(睡觉/待命/干活/催审批/庆祝/晕/爱心)</div>
            </div>
            <button className={`switch ${(settings as any).buddy !== false ? "on" : ""}`} onClick={() => onChange({ buddy: (settings as any).buddy === false } as any)} />
          </div>

          <div className="set-row">
            <div className="sr-label">
              <div className="sr-title">Account</div>
              <div className="sr-desc">{settings.account.email}</div>
            </div>
            <span className="avatar">{(settings.account.name || "U")[0].toUpperCase()}</span>
          </div>

          <div className="set-row">
            <div className="sr-label">
              <div className="sr-title">Reset all data</div>
              <div className="sr-desc">Delete chats and settings (workspaces stay on disk)</div>
            </div>
            <button className="btn" style={{ color: "var(--accent-strong)" }} onClick={onReset}>
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
