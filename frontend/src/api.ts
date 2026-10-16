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
  sideChat: (id: string) => fetch(`/api/threads/${id}/side`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then(j<ThreadMeta>),
  forkThread: (id: string) => fetch(`/api/threads/${id}/fork`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then(j<ThreadMeta>),
  undo: (id: string, paths: string[]) => fetch(`/api/threads/${id}/undo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paths }) }).then(j<{ ok: boolean }>),
  feedback: (id: string, eventId: string, value: "up" | "down") => fetch(`/api/threads/${id}/feedback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventId, value }) }).then(j<{ ok: boolean }>),
  schedule: (id: string, prompt: string, everyMinutes: number) => fetch(`/api/threads/${id}/schedule`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, everyMinutes }) }).then(j<{ id: string }>),
  unschedule: (id: string, taskId: string) => fetch(`/api/threads/${id}/schedule/${taskId}`, { method: "DELETE" }).then(j<{ ok: boolean }>),
  prompt: (id: string, prompt: string) => fetch(`/api/threads/${id}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) }).then(j<{ ok: boolean }>),
  approval: (id: string, decision: "approve" | "deny") => fetch(`/api/approvals/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) }).then(j<{ ok: boolean }>),
  tree: (projectId: string) => fetch(`/api/projects/${projectId}/tree`).then(j<{ name: string; path: string; dir: boolean }[]>),
  file: (projectId: string, path: string) => fetch(`/api/projects/${projectId}/file?path=${encodeURIComponent(path)}`).then(j<{ content: string; truncated: boolean; size: number }>),
  git: (projectId: string) => fetch(`/api/projects/${projectId}/git`).then(j<{ status: { file: string; kind: string }[]; diff: string }>),
  saveFile: (projectId: string, path: string, content: string) => fetch(`/api/projects/${projectId}/file`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, content }) }).then(j<{ ok: boolean }>),
  commit: (projectId: string, message: string) => fetch(`/api/projects/${projectId}/commit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }) }).then(j<{ ok: boolean }>),
  terminal: (projectId: string, cmd: string) => fetch(`/api/projects/${projectId}/terminal`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cmd }) }).then(j<{ code: number; stdout: string; stderr: string }>),
  streamUrl: (threadId: string) => `/api/threads/${threadId}/stream`,
};
