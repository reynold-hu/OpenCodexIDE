# Codex Surface — Product Design & Reference

The Codex surface is the IDE-first product in OpenEveryAgent: threads with plan
checklists, command/diff cards, approvals, checkpoints, worktrees, dots, and a
full side-panel toolkit. This document is the source of truth for its design,
flows, API and verification.

Run it: `npm run dev:codex` → http://localhost:5175 (API :8787).
Default theme is **light** across all four products (Codex accent `#10a37f`).
State: `~/.open-every-agent/codex/`.

---

## 1. Information architecture

```
┌ titlebar ─ traffic · sidebar toggle · title · summary · panel ┐
│ nav rail (Home/Artifacts/History/Projects/Agents/Automations) │
│ sidebar ─ account · mode selector (ChatGPT|ChatGPT Work|Codex)│
│           New chat · search · dots row · project picker        │
│           scope tabs (本地/云端) · grouped threads · footer    │
│ main ─ thread header (dot · title · badges · menu)            │
│        thread stream  OR  landings / rail pages               │
│        composer (model · approvals · reasoning · team)        │
│ side panel ─ Review | Files | Terminal | 浏览器 | 画布 | 云端PC │
│ summary panel ─ plan · files · outputs · subagents · sources  │
│                 automations · processes                       │
│ buddy (bottom-right) · dot flight · voice call modal          │
└───────────────────────────────────────────────────────────────┘
```

Landing surfaces: rail pages (Artifacts, History with archived restore,
Projects with rename/delete, Agents roster, Automations center, Apps roadmap).

## 2. Feature matrix

| Area | Features |
| --- | --- |
| Threads | SSE streaming; plan cards; command cards (risk badges, live output, expiry countdown); merged file cards (undo, view changes, expand, open-with); preview cards (open-with menu, Headless-Chrome screenshot); process cards (stop/log); sources; subagents; swarm cards; cloud-PC placeholder; annotations; error/cancel states |
| Conversation surfaces | Switched from the **sidebar header product menu** (logo + surface name + chevron) — not a segmented bar: **ChatGPT** (prose, activity folded) · **ChatGPT Work** (plans/artifacts kept, commands folded) · **Codex** (all cards). Surface switches cross-fade the thread. |
| Dots | 7 gradient variants; sidebar dots row + new dot; Compact/Detailed conversation; character preview + default color in settings; onboarding flight animation; voice call (Web Speech placeholder) |
| Input | model pill · approvals pill (auto/ask/read-only) · reasoning pill · team-mode toggle · @file autocomplete · slash commands (/status /model /init /compact /team) · attachments · paste-image upload · mic dictation · stop · steer queue while running |
| Message actions | copy · read-aloud · 👍👎 · edit & re-run · revert-to-checkpoint · follow-up pills · ⌘F in-thread find · scroll-to-bottom |
| Turn ops | auto checkpoint every turn; restore; undo file changes; fork; side chat; continue; retry; cancel; steer injection; annotations (selection → quote+note, consumed next turn) |
| Worktrees | attach isolated worktree (branch `oc/<slug>`); merge back to main; detach; all fs/terminal/preview routes become thread-aware |
| Multi-root | associate extra folders per project; Files panel root switcher; root-aware tree/file read/write/terminal; roots stored in project state |
| Auto-review | auto-mode rule engine annotates command cards: `自动放行 · 联网/写入` badges when rules allow silent execution, `规则需确认` when a rule forces approval |
| Automation | per-thread scheduled prompts; Automations center (create/toggle/run-now/delete/countdown); bot templates (晨报/巡检/快照/周报) on grok surface |
| Side panel | Review (git status, per-file diff, commit); Files (tree, preview, reveal/open-with); Terminal (workspace shell); Browser (tabs, omnibox+search, back/forward/reload, zoom 50–200%, new-tab page: tools/推荐/最近); Canvas (edit + save); Preview; Cloud PC |
| Settings | theme · provider/key/baseURL/model-sync · default model · approval mode · sounds · voice · buddy · **harness** (builtin/opencode serve) · skin→provider mapping · **auto-review rules** · **Passkey lock** · dot preview · account · reset |
| Security | WebAuthn Touch-ID lock (register/auth/disable, token-gated API + SSE), risk classification, destructive-command approval, read-only mode |
| Search | full-text across thread events with snippets; project filter |
| Export | Markdown download; PDF via print stylesheet; detached window (`?thread=&detached=1`) |
| Shortcuts | ⌘K palette · ⌘N new chat · ⌘S side chat · ⌘P files panel · ctrl+\` terminal · ⌘/ shortcuts · ⌘F find |

## 3. Turn lifecycle

```
prompt → checkpoint (git commit) → turn_started
  → agent loop (builtin | opencode serve)
      plan events · command events (risk+approval) · file_change · preview
      steer queue drained between steps (or after simulated turn)
  → agent_message streamed (deltas → done)
  → turn_complete {usage} → follow-ups · mascot celebrate · usage chip
```

Approval flow: `command(status=awaiting_approval)` → `approval_request{expiresAt}`
→ Allow/Deny → `command_update(status=running|denied)` → `command_result`.
Auto mode consults **auto-review rules** (blockDestructive default on,
allowNetwork/allowWrite opt-in). Read-only denies mutating commands.

Checkpoints: every turn creates `ocx-checkpoint <thread> <ts>`; the user bubble
exposes ↺ restore (git reset --hard) and the history stepper labels them.

Worktree: attach before a turn; commands/writes/terminal/preview resolve to the
worktree; merge creates the commit in the worktree and merges the branch into
the project checkout; detach prunes it.

## 4. API reference (codex product)

Base: `http://localhost:8787`. Per-product guard: fs/git/terminal/worktree/
process/screenshot/open routes return 404 on other products.

```
GET  /api/health                          → {ok,name,product,version}
GET  /api/settings | PUT | POST /api/reset
GET  /api/providers | /api/providers/:id/models
GET  /api/models
GET|POST /api/projects | GET|PATCH|DELETE /api/projects/:id
GET  /api/projects/:id/tree[?root]|file?path[&rev][&root]|history?path|git|git/branches
GET|POST|DELETE /api/projects/:id/roots (multi-root workspaces)
POST /api/projects/:id/terminal|commit|processes|open|upload|screenshot|file
GET  /api/projects/:id/diff[?path] · POST /api/projects/:id/git/checkout
GET|POST /api/threads (product auto-tagged) | GET|PATCH|DELETE /api/threads/:id
POST /api/threads/:id/prompt?team&agents        (queues as steer while running)
GET  /api/threads/:id/stream                    (SSE)
POST /api/threads/:id/{cancel,retry,revise,undo,restore,fork,side,annotate,schedule,worktree}
POST /api/threads/:id/worktree/merge · DELETE /api/threads/:id/worktree
PATCH /api/threads/:id/schedule/:taskId · DELETE same
POST /api/approvals/:id {decision} · POST /api/threads/:id/feedback
GET  /api/search?q · /api/artifacts · /api/outputs · /api/automations
GET  /api/agents | POST | DELETE /api/agents/:id
GET  /api/harness · /api/passkey/status
POST /api/passkey/register-begin|register-finish|auth-begin|auth-finish
DELETE /api/passkey
GET  /preview/:projectId/* · /shots/*
POST /api/threads/:id/source
```

SSE events: `turn_started(prompt,checkpoint) · plan/plan_update · command/
command_update/command_output/command_result · approval_request(diffPreview,
expiresAt) · file_change/files_reverted · preview_ready · process · source ·
subagent/subagent_update · swarm_started/swarm_agent/swarm_done · steer ·
queue_update · annotation/notes_consumed · worktree/worktree_detached ·
worktree_merged · cloud_pc · restored · agent_message delta/done ·
turn_complete(usage) · turn_cancelled · turn_error`.

## 5. State machines

- thread.status: `idle → running → idle` (+\`awaiting\` transient via approvals)
- command.status: `awaiting_approval → running → success|failed|denied`
- mascot: `sleep|idle|working|attention|celebrate|dizzy|heart`
  (approval pending → attention; approval <5s → heart; every 50k tokens →
  celebrate + level; cancel → dizzy; no thread → sleep)
- dot orb: `sleeping|idle|running|jumping` (spring)

## Branding

Startup screens display the official OpenEveryAgent logo
(`frontend/public/logo.png`, our own asset). Product mascots remain in-app
(buddy corner pet, dot orbs, composer states). No third-party brand assets are
distributed with this repository.

## 6. Persistence

- `~/.open-every-agent/codex/state.json` — settings, projects, threads, agents
- `~/.open-every-agent/codex/workspaces/<project>` — git workspaces
- `~/.open-every-agent/codex/worktrees/<thread>` — thread worktrees
- `~/.open-every-agent/codex/procs/` — background process logs
- `~/.open-every-agent/codex/shots/` — headless screenshots
- provider keys live in settings (server-side only; masked in responses)

## 7. Verification

`node tools/e2e-codex.mjs` — 29 checks covering projects/threads/dots, SSE
turn, plan+command+delta stream, file writes, undo, checkpoint restore,
annotations, search, artifacts, schedules/automations, agent CRUD, worktree
attach (git-verified) / detach, passkey status, retry. All green as of the
latest run.

## 8. Known limits / next

- Cloud chats and Cloud PC are honest placeholders (real product runs a remote VM)
- Dot voice calls use browser Web Speech (real product is server-managed)
- Opencode harness approvals rely on opencode's own permission config
- Roadmap: auto-review nudge banner, cloud tunnel, multi-root workspaces
  (see docs/ROADMAP.md)
