import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_HOME } from "./store.js";

const LOG_DIR = path.join(DATA_HOME, "procs");
fs.mkdirSync(LOG_DIR, { recursive: true });

const registry = new Map();

export function startProcess(dir, cmd) {
  const id = "proc_" + crypto.randomBytes(4).toString("hex");
  const logPath = path.join(LOG_DIR, `${id}.log`);
  const out = fs.openSync(logPath, "a");
  const child = spawn("/bin/bash", ["-lc", cmd], { cwd: dir, detached: true, stdio: ["ignore", out, out] });
  child.unref();
  const rec = { id, cmd, pid: child.pid, logPath, startedAt: Date.now(), dir };
  registry.set(id, rec);
  return rec;
}

export function alive(rec) {
  try {
    process.kill(rec.pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function listProcesses() {
  return [...registry.values()].map((r) => ({ id: r.id, cmd: r.cmd, pid: r.pid, startedAt: r.startedAt, dir: r.dir, running: alive(r) }));
}

export function stopProcess(id) {
  const r = registry.get(id);
  if (!r) return false;
  try {
    process.kill(-r.pid, "SIGTERM");
  } catch {
    try {
      process.kill(r.pid, "SIGTERM");
    } catch {}
  }
  return true;
}

export function tailLog(id, bytes = 4000) {
  const r = registry.get(id);
  if (!r) return "";
  try {
    return fs.readFileSync(r.logPath, "utf8").slice(-bytes);
  } catch {
    return "";
  }
}
