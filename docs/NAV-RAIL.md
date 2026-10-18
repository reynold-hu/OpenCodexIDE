# Codex Nav Rail — REA, behavior & acceptance

Seven rail buttons + the account avatar (bottom). Settings moved into the
avatar menu to match the app's header/profile pattern; the sidebar footer
duplicate was removed.

```
┌ rail ───────────┐
│ ⌂  Home          │  new chat / landing
│ ▤  Artifacts     │  cross-thread artifact index
│ ◷  History       │  all chats + archived restore
│ ▥  Projects      │  project switcher & management
│ ▦  Automations   │  scheduled task center
│ ⋯  More          │  about · shortcuts · theme · docs · reset
│ ▩  Apps          │  product surfaces & run commands
│                  │
│ (avatar)         │  account menu · upload avatar · settings
└──────────────────┘
```

## 1. Home — 新对话

- **Purpose**: return to the new-chat landing (mascot, composer, suggestion
  chips) or the currently open thread.
- **REA**: in the Codex app the first rail item is Home; the landing shows the
  agent identity, one composer, and suggestion chips. We reproduce that pattern
  (original art, our own logo, same information hierarchy).
- **Ours**: clears any rail page; keeps the current thread if one is open; rail
  active state maps to "home" whenever the chat view is active.
- **Acceptance**: click from any rail page → landing/thread visible; active
  highlight on Home; ⌘N creates a new chat from anywhere.

## 2. Artifacts — 产物

- **Purpose**: every file the agent produced, across threads.
- **REA**: the app's artifacts rail aggregates outputs (file changes and site
  previews) rather than per-thread lists; clicking navigates back to the
  originating turn.
- **Ours**: aggregates `file_change` events per thread, **dedupes by path**
  (×count for repeated edits), sorts by recency, searchable by path; click opens
  the source thread.
- **Acceptance**: after an agent writes a file it appears ≤1 refresh; repeated
  edits collapse into one row with ×N; search filters live; click opens the
  thread containing it.

## 3. History — 全部对话

- **Purpose**: full conversation browser with archive management.
- **REA**: the header's recent-tasks menu splits *All / Local / Cloud* chats;
  the rail history view is the full list counterpart.
- **Ours**: filters 全部 / 进行中 / 已归档 + search; per-row **rename/delete**;
  archived rows have **恢复**; running threads show the pulsing status dot.
- **Acceptance**: filters switch instantly; rename/delete update the sidebar;
  restore moves the thread back to active; search filters both partitions.

## 4. Projects — 项目

- **Purpose**: project management (each project = an isolated git workspace).
- **REA**: project picker + per-project threads in the sidebar; project
  settings available from the menu.
- **Ours**: list with workspace path, **open in Finder**, rename, delete (with
  confirm, falling back to another project), create; clicking switches the
  sidebar to that project.
- **Acceptance**: create/rename/delete persist; open-in-Finder launches the
  workspace; deleting the active project selects another or empty state.

## 5. Automations — 自动化

- **Purpose**: scheduled prompts that run server-side on an interval.
- **REA**: the app supports adding scheduled tasks from the thread menu and
  shows them in the summary panel with a next-run countdown
  (`automation-plan-summary`).
- **Ours**: create form (prompt + minutes → new task thread + schedule), per
  task: enable/disable, run-now, delete, view thread; **所有任务批量暂停/恢复**;
  **上次运行时间** recorded by the scheduler (`task.lastRun`).
- **Acceptance**: create → appears with countdown; toggle flips enabled; run-now
  refreshes nextRun; bulk pause/resume affects all; lastRun appears after a
  scheduled execution.

## 6. More — 关于与设置

- **Purpose**: about + quick actions previously scattered in the footer.
- **REA**: the app exposes settings/about via the profile menu; version and
  update affordances live there.
- **Ours**: version (from `/api/health`), open settings, keyboard shortcuts,
  theme toggle, docs link, reset data.
- **Acceptance**: version renders; each action triggers its target; reset asks
  for confirmation before reloading.

## 7. Apps — 产品表面

- **Purpose**: explain the four surfaces + roadmap and how to launch each.
- **REA**: the app's grid/apps launcher is a product switcher; our monorepo runs
  each surface as its own frontend/backend pair.
- **Ours**: cards for Codex (current, accent ring), Claude, Muse, Grok Bot,
  OpenScience (roadmap), plus Desktop wrappers; each shows its `npm run dev:*`
  command.
- **Acceptance**: current surface highlighted; commands are copy-paste ready;
  OpenScience marked roadmap.

## Account avatar — 用户头像

- **Purpose**: profile menu (replaces the old footer avatar + gear).
- **REA**: profile avatar sits at the bottom of the rail in the desktop app;
  clicking opens the account menu.
- **Ours**: avatar at rail bottom; menu shows name/email, settings, shortcuts,
  theme toggle, **更换头像** (local file → data URL stored in settings), reset
  data. Uploaded avatars render in the rail and menu.
- **Acceptance**: upload a PNG → avatar updates immediately and persists after
  reload; all menu actions work; clicking outside closes the menu.

## Verification (tonight's benchmark)

- Build: `npm run build` green.
- E2E: `node tools/e2e-codex.mjs` → **35 checks, ALL PASS** (includes avatar
  persistence; all prior turn/checkpoint/worktree/automation checks).
- Manual spot checks: each rail page reachable, active states correct, no
  console errors, light theme default, avatar menu closes on outside click.
