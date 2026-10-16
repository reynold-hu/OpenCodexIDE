import type { Project, Settings, ThreadMeta, ModelInfo, ThreadFull, ProviderInfo } from "./types";

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  settings: () => fetch("/api/settings").then(j<Settings>),
  saveSettings: (s: Partial<Settings>) => fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(s) }).then(j<Settings>),
  models: () => fetch("/api/models").then(j<ModelInfo[]>),
  providers: () => fetch("/api/providers").then(j<ProviderInfo[]>),
  providerModels: (id: string) => fetch(`/api/providers/${id}/models`).then(j<{ models: string[] }>),
  projects: () => fetch("/api/projects").then(j<Project[]>),
  createProject: (name: string) => fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }).then(j<Project>),
  deleteProject: (id: string) => fetch(`/api/projects/${id}`, { method: "DELETE" }).then(j<{ ok: boolean }>),
  threads: (projectId?: string) => fetch(`/api/threads${projectId ? `?projectId=${projectId}` : ""}`).then(j<ThreadMeta[]>),
  thread: (id: string) => fetch(`/api/threads/${id}`).then(j<ThreadFull>),
  createThread: (projectId: string) => fetch("/api/threads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId }) }).then(j<ThreadMeta>),
  updateThread: (id: string, patch: Partial<ThreadMeta>) => fetch(`/api/threads/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }).then(j<ThreadMeta>),
  deleteThread: (id: string) => fetch(`/api/threads/${id}`, { method: "DELETE" }).then(j<{ ok: boolean }>),
  prompt: (id: string, prompt: string) => fetch(`/api/threads/${id}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) }).then(j<{ ok: boolean }>),
  approval: (id: string, decision: "approve" | "deny") => fetch(`/api/approvals/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) }).then(j<{ ok: boolean }>),
  tree: (projectId: string) => fetch(`/api/projects/${projectId}/tree`).then(j<{ name: string; path: string; dir: boolean }[]>),
  file: (projectId: string, path: string) => fetch(`/api/projects/${projectId}/file?path=${encodeURIComponent(path)}`).then(j<{ content: string; truncated: boolean; size: number }>),
  git: (projectId: string) => fetch(`/api/projects/${projectId}/git`).then(j<{ status: { file: string; kind: string }[]; diff: string }>),
  commit: (projectId: string, message: string) => fetch(`/api/projects/${projectId}/commit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }) }).then(j<{ ok: boolean }>),
  terminal: (projectId: string, cmd: string) => fetch(`/api/projects/${projectId}/terminal`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cmd }) }).then(j<{ code: number; stdout: string; stderr: string }>),
  streamUrl: (threadId: string) => `/api/threads/${threadId}/stream`,
};
