import React, { useEffect, useState } from "react";
import { api } from "../api";
import { AgentAvatar } from "./AgentAvatar";
import { IconPlus, IconTrash } from "../icons";

export function AgentRoster() {
  const [agents, setAgents] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", color: "#7c6df2", shape: "round", instructions: "" });

  const refresh = () => api.agents().then(setAgents).catch(() => {});
  useEffect(() => { refresh(); }, []);

  return (
    <div className="rail-page">
      <h2>Agents · 智能体团队</h2>
      <div className="roster-hint">团队模式(composer 的"团队"开关)会把任务分发给选中的成员并行处理,协调者最后合并结论。</div>
      <div className="rp-list">
        {agents.map((a) => (
          <div key={a.id} className="roster-row">
            <AgentAvatar color={a.color} shape={a.shape} size={30} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{a.name}{a.builtin && <span className="roster-tag">内置</span>}</div>
              <div className="roster-inst">{a.instructions}</div>
            </div>
            {!a.builtin && (
              <button className="icon-btn" title="删除" onClick={async () => { await api.deleteAgent(a.id); refresh(); }}><IconTrash size={13} /></button>
            )}
          </div>
        ))}
      </div>
      {creating ? (
        <div className="roster-form">
          <div className="rf-row">
            <input placeholder="名称,如:安全审计员" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            <select className="select-like" value={form.shape} onChange={(e) => setForm({ ...form, shape: e.target.value })}>
              {["round", "hex", "square", "triangle", "circle", "diamond"].map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <textarea placeholder="角色指令(这个 agent 是谁、负责什么、输出风格)…" rows={3} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
          <div className="rf-row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button className="btn" onClick={() => setCreating(false)}>取消</button>
            <button
              className="btn primary"
              onClick={async () => {
                if (!form.name || !form.instructions) return;
                await api.createAgent(form);
                setForm({ name: "", color: "#7c6df2", shape: "round", instructions: "" });
                setCreating(false);
                refresh();
              }}
            >
              创建
            </button>
          </div>
        </div>
      ) : (
        <button className="rp-item" style={{ marginTop: 8 }} onClick={() => setCreating(true)}>
          <IconPlus size={13} /> 新建自定义 Agent
        </button>
      )}
    </div>
  );
}
