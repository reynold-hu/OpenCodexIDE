export type ApprovalMode = "auto" | "ask" | "read-only";

export interface ProviderConfig {
  hasKey?: boolean;
  baseUrl?: string;
  models?: string[];
  model?: string;
}

export interface ProviderInfo {
  id: string;
  label: string;
  defaultBaseUrl: string | null;
  baseUrl: string;
  models: string[];
  model: string;
  hasKey: boolean;
}

export type AppMode = "codex" | "claude" | "muse" | "grok";

export interface Settings {
  theme: "dark" | "light" | "system";
  appMode: AppMode;
  modeProviders?: Record<string, string>;
  provider: string;
  providers: Record<string, ProviderConfig>;
  model: string;
  reasoning: string;
  approvalMode: ApprovalMode;
  sounds: boolean;
  harness?: string;
  conversationMode?: string;
  voice?: boolean;
  account: { name: string; email: string };
}

export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: number;
}

export interface AgentDef {
  id: string;
  name: string;
  color: string;
  shape: string;
  instructions: string;
  builtin: boolean;
}

export interface ScheduledTask {
  id: string;
  prompt: string;
  everyMinutes: number;
  nextRun: number;
}

export interface ThreadMeta {
  id: string;
  projectId: string;
  title: string;
  status: "idle" | "running";
  model: string;
  approvalMode: ApprovalMode;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  pinned?: boolean;
  archived?: boolean;
  dot?: { color?: string; compact?: boolean } | null;
  worktree?: { path: string; branch: string } | null;
  sideOf?: string;
  scheduled?: ScheduledTask[];
}

export interface ModelInfo {
  id: string;
  name: string;
  desc: string;
  context: string;
  reasoning: string[];
}

export interface PlanItem {
  title: string;
  done: boolean;
}

export interface SwarmAgent {
  agentId: string;
  name: string;
  color: string;
  shape: string;
  status: "queued" | "working" | "done";
  summary: string;
  transcript?: { kind: string; text: string }[];
}

export interface FileChangeItem {
  path: string;
  additions: number;
  deletions: number;
  patch: string;
  reverted?: boolean;
}

export type Block =
  | { kind: "prompt"; text: string; ts?: number; checkpoint?: string | null }
  | { kind: "agent_message"; id: string; text: string; done: boolean; feedback?: string | null; ts?: number }
  | { kind: "plan"; id: string; items: PlanItem[] }
  | {
      kind: "command";
      id: string;
      cmd: string;
      status: "awaiting_approval" | "running" | "success" | "failed" | "denied";
      output?: string;
      code?: number;
      durationMs?: number;
      reason?: string;
      approvalId?: string;
      expiresAt?: number;
      risk?: { level: string; label: string };
    }
  | ({ kind: "file_change" } & FileChangeItem)
  | { kind: "file_group"; items: FileChangeItem[] }
  | { kind: "preview"; path: string; url: string }
  | { kind: "process"; id: string; cmd: string; pid: number }
  | { kind: "source"; url: string; title?: string }
  | { kind: "subagent"; id: string; prompt: string; done: boolean }
  | { kind: "annotation"; quote: string; note: string }
  | { kind: "cloud_pc"; state: string }
  | { kind: "swarm"; id: string; task: string; agents: SwarmAgent[]; done: boolean }
  | { kind: "turn_complete" }
  | { kind: "error"; message: string };

export interface ThreadFull extends ThreadMeta {
  events: any[];
}
