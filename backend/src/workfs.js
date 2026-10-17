import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { workspacePath } from "./store.js";

const execFileAsync = promisify(execFile);

const IGNORE_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", "__pycache__", ".venv", "target", ".cache"]);

function safeJoin(root, rel) {
  const p = path.normalize(path.join(root, rel || "."));
  if (!p.startsWith(root)) throw new Error("path escapes workspace");
  return p;
}

export async function ensureWorkspace(project) {
  const dir = workspacePath(project);
  fs.mkdirSync(dir, { recursive: true });
  const gitDir = path.join(dir, ".git");
  if (!fs.existsSync(gitDir)) {
    try {
      await execFileAsync("git", ["init", "-q"], { cwd: dir });
      await execFileAsync("git", ["config", "user.email", "open-codex-ide@local"], { cwd: dir });
      await execFileAsync("git", ["config", "user.name", project.name || "OpenCodex"], { cwd: dir });
      const readme = path.join(dir, "README.md");
      if (!fs.existsSync(readme)) {
        fs.writeFileSync(readme, `# ${project.name}\n\nWorkspace created by OpenCodex IDE.\n`);
        await execFileAsync("git", ["add", "-A"], { cwd: dir });
        await execFileAsync("git", ["commit", "-q", "-m", "Initial commit"], { cwd: dir });
      }
    } catch (e) {
      console.error("workspace init failed:", e.message);
    }
  }
  return dir;
}

export function tree(dir, rel = ".", depth = 6) {
  const out = [];
  const walk = (r, d) => {
    if (d > depth) return;
    let entries = [];
    try {
      entries = fs.readdirSync(safeJoin(dir, r), { withFileTypes: true });
    } catch {
      return;
    }
    const dirs = entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    const files = entries.filter((e) => e.isFile()).sort((a, b) => a.name.localeCompare(b.name));
    for (const e of [...dirs, ...files]) {
      if (IGNORE_DIRS.has(e.name) || e.name.startsWith(".")) continue;
      const childRel = path.join(r, e.name);
      out.push({ name: e.name, path: childRel, dir: e.isDirectory() });
      if (e.isDirectory()) walk(childRel, d + 1);
    }
  };
  walk(rel, 1);
  return out;
}

export function readFileLimited(dir, rel) {
  const p = safeJoin(dir, rel);
  const st = fs.statSync(p);
  if (st.size > 512 * 1024) return { truncated: true, content: "", size: st.size };
  return { truncated: false, content: fs.readFileSync(p, "utf8"), size: st.size };
}

export function writeFileInWorkspace(dir, rel, content) {
  const p = safeJoin(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const existed = fs.existsSync(p);
  const before = existed ? fs.readFileSync(p, "utf8") : "";
  fs.writeFileSync(p, content);
  return { existed, before, after: content };
}

export async function gitStatus(dir) {
  const { stdout } = await execFileAsync("git", ["status", "--short"], { cwd: dir });
  const lines = stdout.split("\n").filter(Boolean);
  const changes = lines.map((l) => {
    const status = l.slice(0, 2).trim();
    const file = l.slice(3).trim();
    let kind = "modified";
    if (status.includes("?")) kind = "untracked";
    else if (status.includes("A")) kind = "added";
    else if (status.includes("D")) kind = "deleted";
    return { file, kind, status };
  });
  return changes;
}

export async function gitDiff(dir, staged = false) {
  const args = staged ? ["diff", "--cached"] : ["diff", "HEAD"];
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: dir, maxBuffer: 4 * 1024 * 1024 });
    return stdout;
  } catch {
    const { stdout } = await execFileAsync("git", ["diff"], { cwd: dir, maxBuffer: 4 * 1024 * 1024 });
    return stdout;
  }
}

export async function gitCommitAll(dir, message) {
  await execFileAsync("git", ["add", "-A"], { cwd: dir });
  await execFileAsync("git", ["commit", "-q", "-m", message], { cwd: dir });
}

export async function revertPath(dir, rel) {
  const p = safeJoin(dir, rel);
  let tracked = false;
  try {
    const { stdout } = await execFileAsync("git", ["ls-files", "--", rel], { cwd: dir });
    tracked = stdout.trim().length > 0;
  } catch {}
  if (tracked) {
    await execFileAsync("git", ["checkout", "HEAD", "--", rel], { cwd: dir });
    return "restored-to-head";
  }
  if (fs.existsSync(p)) {
    fs.rmSync(p);
    return "deleted";
  }
  return "noop";
}

export async function shellExec(dir, cmd, timeoutMs = 15000, onChunk = null, ctl = null) {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve) => {
    const child = spawn("/bin/bash", ["-lc", cmd], { cwd: dir });
    if (ctl) ctl.child = child;
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { child.kill("SIGKILL"); } catch {}
        resolve({ code: 124, stdout, stderr: stderr + "\n[timeout]", killed: true });
      }
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      const s = d.toString();
      stdout += s;
      if (onChunk && stdout.length < 200000) onChunk(s, false);
    });
    child.stderr.on("data", (d) => {
      const s = d.toString();
      stderr += s;
      if (onChunk && stderr.length < 200000) onChunk(s, true);
    });
    child.on("error", (e) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ code: 1, stdout, stderr: stderr + e.message });
      }
    });
    child.on("close", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ code: code ?? 1, stdout, stderr });
      }
    });
  });
}

export function killChild(child) {
  try {
    child?.kill("SIGTERM");
    setTimeout(() => { try { child?.kill("SIGKILL"); } catch {} }, 1500);
  } catch {}
}

export function writeBinary(dir, rel, base64) {
  const p = safeJoin(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, Buffer.from(base64, "base64"));
  return rel;
}
