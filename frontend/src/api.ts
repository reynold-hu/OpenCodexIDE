import type { Project, Settings, ThreadMeta, ModelInfo, ThreadFull, ProviderInfo } from "./types";

const TOKEN_KEY = "oea-token";
const tok = () => (typeof sessionStorage !== "undefined" ? sessionStorage.getItem(TOKEN_KEY) : null);

async function j<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    try { window.dispatchEvent(new Event("oea:locked")); } catch {}
    throw new Error("locked");
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}
function F(url: string, opts: RequestInit = {}) {
  const t = tok();
  return fetch(url, { ...opts, headers: { ...(opts.headers || {}), ...(t ? { "x-oea-token": t } : {}) } });
}

export const api = {
  settings: () => F("/api/settings").then(j<Settings>),
  saveSettings: (s: Partial<Settings>) => F("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(s) }).then(j<Settings>),
  models: () => F("/api/models").then(j<ModelInfo[]>),
  providers: () => F("/api/providers").then(j<ProviderInfo[]>),
  providerModels: (id: string) => F(`/api/providers/${id}/models`).then(j<{ models: string[] }>),
  projects: () => F("/api/projects").then(j<Project[]>),
  createProject: (name: string) => F("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }).then(j<Project>),
  deleteProject: (id: string) => F(`/api/projects/${id}`, { method: "DELETE" }).then(j<{ ok: boolean }>),
  threads: (projectId?: string, product?: string) => F(`/api/threads?${projectId ? `projectId=${projectId}&` : ""}${product ? `product=${product}` : ""}`).then(j<ThreadMeta[]>),
  thread: (id: string) => F(`/api/threads/${id}`).then(j<ThreadFull>),
  createThread: (projectId: string, product?: string, extra?: Record<string, unknown>) => F("/api/threads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, product, ...(extra || {}) }) }).then(j<ThreadMeta>),
  updateThread: (id: string, patch: Partial<ThreadMeta>) => F(`/api/threads/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }).then(j<ThreadMeta>),
  deleteThread: (id: string) => F(`/api/threads/${id}`, { method: "DELETE" }).then(j<{ ok: boolean }>),
  sideChat: (id: string) => F(`/api/threads/${id}/side`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then(j<ThreadMeta>),
  forkThread: (id: string) => F(`/api/threads/${id}/fork`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then(j<ThreadMeta>),
  undo: (id: string, paths: string[]) => F(`/api/threads/${id}/undo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paths }) }).then(j<{ ok: boolean }>),
  feedback: (id: string, eventId: string, value: "up" | "down") => F(`/api/threads/${id}/feedback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventId, value }) }).then(j<{ ok: boolean }>),
  schedule: (id: string, prompt: string, everyMinutes: number) => F(`/api/threads/${id}/schedule`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, everyMinutes }) }).then(j<{ id: string }>),
  unschedule: (id: string, taskId: string) => F(`/api/threads/${id}/schedule/${taskId}`, { method: "DELETE" }).then(j<{ ok: boolean }>),
  prompt: (id: string, prompt: string, team?: boolean, agents?: string[]) => F(`/api/threads/${id}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, team, agents }) }).then(j<{ ok: boolean }>),
  artifacts: (product: string, projectId?: string) => F(`/api/artifacts?product=${product}${projectId ? `&projectId=${projectId}` : ""}`).then(j<any[]>),
  agents: () => F("/api/agents").then(j<any[]>),
  createAgent: (a: Record<string, unknown>) => F("/api/agents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(a) }).then(j<any>),
  deleteAgent: (id: string) => F(`/api/agents/${id}`, { method: "DELETE" }).then(j<{ ok: boolean }>),
  approval: (id: string, decision: "approve" | "deny") => F(`/api/approvals/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) }).then(j<{ ok: boolean }>),
  tree: (projectId: string, threadId?: string) => F(`/api/projects/${projectId}/tree${threadId ? `?thread=${threadId}` : ""}`).then(j<{ name: string; path: string; dir: boolean }[]>),
  file: (projectId: string, path: string, threadId?: string, rev?: string) => F(`/api/projects/${projectId}/file?path=${encodeURIComponent(path)}${threadId ? `&thread=${threadId}` : ""}${rev ? `&rev=${rev}` : ""}`).then(j<{ content: string; truncated: boolean; size: number }>),
  git: (projectId: string, threadId?: string) => F(`/api/projects/${projectId}/git${threadId ? `?thread=${threadId}` : ""}`).then(j<{ status: { file: string; kind: string }[]; diff: string }>),
  saveFile: (projectId: string, path: string, content: string, threadId?: string) => F(`/api/projects/${projectId}/file`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, content, thread: threadId }) }).then(j<{ ok: boolean }>),
  commit: (projectId: string, message: string, threadId?: string) => F(`/api/projects/${projectId}/commit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, thread: threadId }) }).then(j<{ ok: boolean }>),
  terminal: (projectId: string, cmd: string, threadId?: string) => F(`/api/projects/${projectId}/terminal`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cmd, thread: threadId }) }).then(j<{ code: number; stdout: string; stderr: string }>),
  processes: (projectId: string) => F(`/api/projects/${projectId}/processes`).then(j<{ id: string; cmd: string; pid: number; startedAt: number; running: boolean }[]>),
  startProcess: (projectId: string, cmd: string) => F(`/api/projects/${projectId}/processes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cmd }) }).then(j<{ id: string }>),
  stopProcess: (projectId: string, pid: string) => F(`/api/projects/${projectId}/processes/${pid}/stop`, { method: "POST" }).then(j<{ ok: boolean }>),
  procLog: (projectId: string, pid: string) => F(`/api/projects/${projectId}/processes/${pid}/log`).then(j<{ log: string }>),
  automations: () => F("/api/automations").then(j<any[]>),
  patchSchedule: (threadId: string, taskId: string, patch: Record<string, unknown>) => F(`/api/threads/${threadId}/schedule/${taskId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }).then(j<{ ok: boolean }>),
  openPath: (projectId: string, path: string | "", mode: "open" | "reveal") => F(`/api/projects/${projectId}/open`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, mode }) }).then(j<{ ok: boolean }>),
  outputs: () => F("/api/outputs").then(j<{ kind: "file" | "site"; path: string; url?: string; ts: number; thread: string; threadId: string }[]>),
  addSource: (threadId: string, url: string, title?: string) => F(`/api/threads/${threadId}/source`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, title }) }).then(j<{ ok: boolean }>),
  restore: (threadId: string, hash: string) => F(`/api/threads/${threadId}/restore`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hash }) }).then(j<{ ok: boolean }>),
  revise: (threadId: string, turnTs: number, prompt: string) => F(`/api/threads/${threadId}/revise`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ turnTs, prompt }) }).then(j<{ ok: boolean }>),
  attachWorktree: (threadId: string) => F(`/api/threads/${threadId}/worktree`, { method: "POST" }).then(j<{ ok: boolean; worktree: { path: string; branch: string } }>),
  detachWorktree: (threadId: string) => F(`/api/threads/${threadId}/worktree`, { method: "DELETE" }).then(j<{ ok: boolean }>),
  mergeWorktree: (threadId: string) => F(`/api/threads/${threadId}/worktree/merge`, { method: "POST" }).then(j<{ ok: boolean; error?: string }>),
  annotate: (threadId: string, quote: string, note: string) => F(`/api/threads/${threadId}/annotate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quote, note }) }).then(j<{ ok: boolean }>),
  retry: (threadId: string) => F(`/api/threads/${threadId}/retry`, { method: "POST" }).then(j<{ ok: boolean }>),
  cancel: (threadId: string) => F(`/api/threads/${threadId}/cancel`, { method: "POST" }).then(j<{ ok: boolean }>),
  search: (q: string) => F(`/api/search?q=${encodeURIComponent(q)}`).then(j<{ id: string; title: string; updatedAt: number; sample: string[] }[]>),
  branches: (projectId: string) => F(`/api/projects/${projectId}/git/branches`).then(j<{ name: string; current: boolean }[]>),
  checkout: (projectId: string, branch: string) => F(`/api/projects/${projectId}/git/checkout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ branch }) }).then(j<{ ok: boolean }>),
  diffFile: (projectId: string, path?: string, threadId?: string) => F(`/api/projects/${projectId}/diff?${path ? `path=${encodeURIComponent(path)}&` : ""}${threadId ? `thread=${threadId}` : ""}`).then(j<{ diff: string }>).then((r) => r.diff),
  upload: (projectId: string, path: string, dataBase64: string) => F(`/api/projects/${projectId}/upload`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, dataBase64 }) }).then(j<{ ok: boolean }>),
  streamUrl: (threadId: string) => `/api/threads/${threadId}/stream${tok() ? `?token=${tok()}` : ""}`,
};
