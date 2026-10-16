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

export interface Settings {
  theme: "dark" | "light" | "system";
  provider: string;
  providers: Record<string, ProviderConfig>;
  model: string;
  reasoning: string;
  approvalMode: ApprovalMode;
  sounds: boolean;
  account: { name: string; email: string };
}

export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: number;
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

export type Block =
  | { kind: "prompt"; text: string }
  | { kind: "agent_message"; id: string; text: string; done: boolean }
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
    }
  | { kind: "file_change"; path: string; additions: number; deletions: number; patch: string }
  | { kind: "turn_complete" }
  | { kind: "error"; message: string };

export interface ThreadFull extends ThreadMeta {
  events: any[];
}
