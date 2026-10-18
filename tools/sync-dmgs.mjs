#!/usr/bin/env node
/* OpenEveryAgent — upstream DMG sync & feature-diff tool (original implementation)
   Resolves the *official* latest build for each product, downloads it, prunes
   older local copies, and diffs the renderer/asset module lists so we can see
   which features were added/removed between versions.

   Usage:
     node tools/sync-dmgs.mjs                 # resolve latest versions (no download)
     node tools/sync-dmgs.mjs --download      # download missing builds
     node tools/sync-dmgs.mjs --clean         # remove older managed copies after download
     node tools/sync-dmgs.mjs --analyze       # extract app payloads + feature diff
     node tools/sync-dmgs.mjs --all           # download + clean + analyze
     node tools/sync-dmgs.mjs codex claude    # limit to products

   Official sources (observed from each app's update configuration):
     codex : https://persistent.oaistatic.com/codex-app-prod/appcast.xml   (Sparkle; zip)
     claude: https://downloads.claude.ai/claude-science/latest/mac-arm64.dmg
     muse  : https://www.facebook.com/endo/release/appcast.xml?channel=production (Sparkle)
     grok  : https://cursor.com/download/bot  → downloads.cursor.com/grokbot/stable/...
*/
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const ROOT = path.join(os.homedir(), "Downloads", "OpenEveryAgent-DMGs");
const ARCH = process.arch === "arm64" ? "arm64" : "x64";
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const only = args.filter((a) => !a.startsWith("--"));
const DO_DOWNLOAD = has("--download") || has("--all");
const KEEP_OLD = has("--keep-old");
const CLEAN_DOWNLOADS = has("--clean-downloads");
const DO_CLEAN = !KEEP_OLD;
const DO_ANALYZE = has("--analyze") || has("--all");

const UA = { headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" } };

async function getText(url) {
  const r = await fetch(url, UA);
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.text();
}

/* ---------- product resolvers (official sources only) ---------- */
const PRODUCTS = {
  codex: {
    label: "OpenAI Codex (ChatGPT.app)",
    source: "https://persistent.oaistatic.com/codex-app-prod/appcast.xml",
    async resolve() {
      const xml = await getText(this.source);
      const m = xml.match(/<item>[\s\S]*?<sparkle:shortVersionString>([^<]+)<\/sparkle:shortVersionString>[\s\S]*?<enclosure\s+url="([^"]+)"/);
      if (!m) throw new Error("could not parse appcast");
      return { version: m[1], url: m[2], file: path.basename(new URL(m[2]).pathname) };
    },
  },
  claude: {
    label: "Anthropic Claude",
    source: "https://storage.googleapis.com/osprey-downloads-c02f6a0d-347c-492b-a752-3e0651722e97/nest/Claude.dmg",
    async resolve() {
      // three official channels exist:
      //  docs     = code.claude.com docs redirect (universal, latest; may 403 CLIs)
      //  classic  = osprey bucket (standard Claude desktop, Electron)
      //  science  = claude.com/download's current public link (Claude Science app,
      //             tracked for the future OpenScience project)
      const candidates = [
        { channel: "docs", url: "https://claude.ai/api/desktop/darwin/universal/dmg/latest/redirect?utm_source=claude_code&utm_medium=docs", file: "Claude.dmg" },
        { channel: "classic", url: this.source, file: "Claude-Classic.dmg" },
        { channel: "science", url: ARCH === "arm64" ? "https://downloads.claude.ai/claude-science/latest/mac-arm64.dmg" : "https://downloads.claude.ai/claude-science/latest/mac-x64.dmg", file: "Claude-Science.dmg" },
      ];
      for (const c of candidates) {
        const r = await fetch(c.url, { method: "HEAD", ...UA });
        if (r.ok) {
          const len = Number(r.headers.get("content-length") || 0);
          const lastMod = r.headers.get("last-modified");
          const v = lastMod ? `latest-${new Date(lastMod).toISOString().slice(0, 10)}` : "latest";
          return { version: v, url: c.url, file: c.file, size: len, channel: c.channel };
        }
      }
      throw new Error("no claude dmg reachable");
    },
  },
  muse: {
    label: "Meta Muse",
    source: "https://www.facebook.com/endo/release/appcast.xml?channel=production",
    async resolve() {
      const xml = await getText(this.source);
      const m = xml.match(/<item>[\s\S]*?<sparkle:shortVersionString>([^<]+)<\/sparkle:shortVersionString>[\s\S]*?<enclosure\s+url="([^"]+)"/);
      if (!m) throw new Error("could not parse appcast");
      const url = m[2].replace(/\n|\s+/g, "").replace(/&amp;/g, "&");
      return { version: m[1], url, file: `Muse-${m[1]}.dmg` };
    },
  },
  grok: {
    label: "Cursor Grok Bot",
    source: "https://cursor.com/download/bot",
    async resolve() {
      const html = await getText(this.source);
      const arch = ARCH === "arm64" ? "darwin-arm64" : "darwin-x64";
      const dmgs = [...html.matchAll(/https:\/\/downloads\.cursor\.com\/grokbot\/stable\/(darwin-(?:arm64|x64))\/[^"'\s\\]+?\.dmg/g)].map((m) => m[0]);
      const pick = dmgs.find((u) => u.includes(arch)) || dmgs[0];
      if (!pick) throw new Error("could not find grok bot dmg on download page");
      const vm = pick.match(/\/(\d+\.\d+\.\d+)\//);
      return { version: vm ? vm[1] : "latest", url: pick, file: path.basename(pick) };
    },
  },
};

/* ---------- helpers ---------- */
function productDir(name) {
  const d = path.join(ROOT, name);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function listLocal(name) {
  const d = productDir(name);
  return fs.readdirSync(d).filter((f) => /\.(dmg|zip)$/i.test(f)).sort();
}

function featuresFile(name, version) {
  return path.join(productDir(name), `features-${version}.txt`);
}

function extractFeatureList(archivePath, name) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `oea-${name}-`));
  try {
    if (archivePath.endsWith(".zip")) {
      execFileSync("ditto", ["-x", "-k", archivePath, tmp]);
    } else {
      const mount = path.join(tmp, "mnt");
      fs.mkdirSync(mount);
      execFileSync("hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mount, archivePath], { stdio: "ignore" });
      try {
        const app = fs.readdirSync(mount).find((f) => f.endsWith(".app"));
        if (app) execFileSync("ditto", [path.join(mount, app), path.join(tmp, app)]);
      } finally {
        execFileSync("hdiutil", ["detach", mount, "-quiet"], { stdio: "ignore" });
      }
    }
    const app = fs.readdirSync(tmp).find((f) => f.endsWith(".app"));
    if (!app) throw new Error("no .app in payload");
    const res = path.join(tmp, app, "Contents", "Resources");
    const lines = [];
    const asar = path.join(res, "app.asar");
    if (fs.existsSync(asar)) {
      const out = execFileSync("npx", ["--yes", "@electron/asar", "list", asar], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      lines.push(...out.split("\n").filter(Boolean));
    }
    const hatch = path.join(res, "hatch");
    if (fs.existsSync(hatch)) {
      lines.push("__hatch__/index.html");
      try {
        const meta = path.join(hatch, "metaconfig.json");
        if (fs.existsSync(meta)) {
          lines.push("__hatch__/metaconfig.json");
          const cfg = JSON.parse(fs.readFileSync(meta, "utf8"));
          for (const v of Object.values(cfg.clientParameters || {})) {
            if (v && v.key) lines.push(`flag:${v.key}`);
          }
        }
      } catch {}
    }
    if (!lines.length) {
      // native app: top-level Resources entries become the feature surface
      try {
        for (const e of fs.readdirSync(res)) {
          if (/\.(lproj|car|plist)$/i.test(e)) continue;
          lines.push(`res:${e}`);
        }
      } catch {}
    }
    return lines;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function featureKeys(lines) {
  const keys = new Set();
  for (const l of lines) {
    if (l.startsWith("flag:") || l.startsWith("res:")) { keys.add(l); continue; }
    const base = l.split("/").pop() || "";
    const m = base.match(/^([a-z][a-z0-9-]+?)(?:-[A-Za-z0-9_-]{6,})?\.(?:js|css|svg|json|html)$/i);
    if (m) keys.add(m[1].toLowerCase());
    else if (/^[a-z][a-z0-9-]{3,}$/i.test(base)) keys.add(base.toLowerCase());
  }
  return [...keys].sort();
}

function previousFeatures(name, currentVersion) {
  const d = productDir(name);
  const fs2 = fs.readdirSync(d).filter((f) => f.startsWith("features-") && f.endsWith(".txt") && !f.includes(currentVersion)).sort();
  if (!fs2.length) return null;
  const latest = fs2[fs2.length - 1];
  return { version: latest.replace(/^features-|\.txt$/g, ""), keys: fs.readFileSync(path.join(d, latest), "utf8").split("\n").filter(Boolean) };
}

async function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1e6) return "cached";
  const r = await fetch(url, UA);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  const total = Number(r.headers.get("content-length") || 0);
  const fd = fs.openSync(dest + ".part", "w");
  let received = 0;
  let lastPct = -1;
  const tty = process.stdout.isTTY;
  for await (const chunk of r.body) {
    fs.writeSync(fd, chunk);
    received += chunk.length;
    if (!total) continue;
    const pct = Math.floor((received / total) * 100);
    if (tty) process.stdout.write(`\r    ${path.basename(dest)} ${(received / 1048576).toFixed(1)}/${(total / 1048576).toFixed(1)} MB`);
    else if (pct >= lastPct + 10) { lastPct = pct; console.log(`    ${path.basename(dest)} ${pct}% (${(received / 1048576).toFixed(0)} MB)`); }
  }
  fs.closeSync(fd);
  fs.renameSync(dest + ".part", dest);
  process.stdout.write("\n");
  return "downloaded";
}

/* ---------- loose ~/Downloads cleanup (safe patterns only) ---------- */
function parseVer(v) {
  return String(v || "").replace(/[^0-9.]/g, "").split(".").filter(Boolean).map(Number);
}
function cmpVer(a, b) {
  const x = parseVer(a), y = parseVer(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}
function sha256File(p) {
  return execFileSync("shasum", ["-a", "256", p], { encoding: "utf8" }).split(" ")[0];
}

function cleanLooseDownloads(name, info, managedPath) {
  const dl = path.join(os.homedir(), "Downloads");
  const patterns = {
    codex: /^(ChatGPT|Codex)[^/]*\.(dmg|zip)$/i,
    claude: /^Claude[^/]*\.dmg$/i,
    muse: /^Muse[-_. ][^/]*\.dmg$/i,
    grok: /^(Grok[ _-]?Bot|GrokBot)[^/]*\.dmg$/i,
  };
  const re = patterns[name];
  if (!re) return;
  let entries = [];
  try { entries = fs.readdirSync(dl); } catch { return; }
  for (const f of entries) {
    if (!re.test(f)) continue;
    const full = path.join(dl, f);
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (!st.isFile()) continue;

    // 1) versioned filename → delete only if strictly older than latest
    const vm = f.match(/(\d+\.\d+(?:\.\d+)*)/);
    if (vm && info.version && /^\d/.test(info.version)) {
      if (cmpVer(vm[1], info.version) < 0) {
        fs.rmSync(full, { force: true });
        console.log(`  cleaned loose old: ~/Downloads/${f} (v${vm[1]} < v${info.version})`);
      }
      continue;
    }

    // 2) unversioned/duplicate → delete only if byte-identical to the managed build
    try {
      const ms = fs.statSync(managedPath);
      if (ms.size === st.size) {
        if (sha256File(full) === sha256File(managedPath)) {
          fs.rmSync(full, { force: true });
          console.log(`  cleaned loose duplicate: ~/Downloads/${f}`);
        }
      }
    } catch {}
  }
}

/* ---------- main ---------- */
const pick = only.length ? only : Object.keys(PRODUCTS);
for (const name of pick) {
  const p = PRODUCTS[name];
  if (!p) { console.log(`? unknown product: ${name}`); continue; }
  console.log(`\n━━ ${p.label} ━━`);
  let info;
  try { info = await p.resolve(); } catch (e) { console.log(`  ✗ resolve failed: ${e.message}`); continue; }
  console.log(`  latest : ${info.version}${info.size ? ` · ${(info.size / 1048576).toFixed(0)} MB` : ""}`);
  console.log(`  url    : ${info.url}`);
  const dir = productDir(name);
  const local = listLocal(name);
  const target = path.join(dir, info.file);
  console.log(`  local  : ${local.length ? local.join(", ") : "(none)"}`);

  if (DO_DOWNLOAD) {
    try {
      const st = await download(info.url, target);
      console.log(`  ${st} → ${target}`);
    } catch (e) { console.log(`  ✗ download failed: ${e.message}`); continue; }
  }

  if (DO_CLEAN && fs.existsSync(target)) {
    for (const f of fs.readdirSync(dir)) {
      if (!/\.(dmg|zip)$/i.test(f) || f === info.file) continue;
      fs.rmSync(path.join(dir, f), { force: true });
      console.log(`  cleaned old build: ${f}`);
    }
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".part")) fs.rmSync(path.join(dir, f), { force: true });
    }
  }

  if (CLEAN_DOWNLOADS && fs.existsSync(target)) {
    cleanLooseDownloads(name, info, target);
  }

  if (DO_ANALYZE && fs.existsSync(target)) {
    try {
      console.log("  analyzing payload…");
      const lines = extractFeatureList(target, name);
      const keys = featureKeys(lines);
      fs.writeFileSync(featuresFile(name, info.version), keys.join("\n"));
      console.log(`  features: ${keys.length} modules → ${featuresFile(name, info.version)}`);
      const prev = previousFeatures(name, info.version);
      if (prev) {
        const prevSet = new Set(prev.keys);
        const added = keys.filter((k) => !prevSet.has(k));
        const removed = prev.keys.filter((k) => !keys.includes(k));
        console.log(`  diff vs ${prev.version}: +${added.length} new / -${removed.length} removed`);
        if (added.length) console.log(`    NEW: ${added.slice(0, 40).join(", ")}${added.length > 40 ? " …" : ""}`);
        if (removed.length) console.log(`    GONE: ${removed.slice(0, 20).join(", ")}${removed.length > 20 ? " …" : ""}`);
      }
    } catch (e) {
      console.log(`  ✗ analyze failed: ${e.message}`);
    }
  }
}
console.log(`\nmanaged dir: ${ROOT}`);
