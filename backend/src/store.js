import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const DATA_HOME = process.env.OPEN_CODEX_HOME || path.join(os.homedir(), ".open-codex-ide");
const STATE_FILE = path.join(DATA_HOME, "state.json");
const WORKSPACE_ROOT = path.join(DATA_HOME, "workspaces");

const DEFAULT_STATE = {
  settings: {
    theme: "dark",
    appMode: "codex",
    provider: "simulated",
    providers: {},
    model: "gpt-5.1-codex",
    reasoning: "medium",
    approvalMode: "auto",
    sounds: true,
    account: { name: "developer", email: "developer@local" },
  },
  projects: [],
  threads: [],
};

function ensureDirs() {
  fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });
  fs.mkdirSync(DATA_HOME, { recursive: true });
}

let state = null;
let saveTimer = null;

export function load() {
  if (state) return state;
  ensureDirs();
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    state = { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
  } catch {
    state = structuredClone(DEFAULT_STATE);
    persistNow();
  }
  return state;
}

function persistNow() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      persistNow();
    } catch (e) {
      console.error("state save failed", e);
    }
  }, 80);
}

export function saveNow() {
  clearTimeout(saveTimer);
  persistNow();
}

export function workspacePath(project) {
  return project.path || path.join(WORKSPACE_ROOT, project.id);
}

export function resetAll() {
  state = structuredClone(DEFAULT_STATE);
  saveNow();
  return state;
}

export { DATA_HOME, WORKSPACE_ROOT };
