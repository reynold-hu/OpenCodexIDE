<p align="center">
  <img src="assets/logo.png" alt="Open Every Agent IDE" width="220"/>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License: AGPL-3.0"/></a>
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs welcome"/>
  <img src="https://img.shields.io/badge/fork%20welcome-Windows%20%26%20macOS-orange" alt="Fork to build desktop ports"/>
  <img src="https://img.shields.io/badge/node-%E2%89%A520-339933" alt="Node >= 20"/>
  <img src="https://img.shields.io/badge/React%20%2B%20Vite-frontend-646cff" alt="React + Vite"/>
  <img src="https://img.shields.io/badge/Express%20%2B%20SSE-backend-black" alt="Express + SSE"/>
  <img src="https://img.shields.io/badge/status-v0.1-yellow" alt="status v0.1"/>
</p>

# Open Every Agent IDE

**Open Every Agent IDE — a self-hosted, front-end/back-end separated web IDE that
unifies the best of today's agent surfaces: Codex-style agentic UX, Claude-style
warmth, Muse-style voice embodiment, Grok-Bot-style scheduled automation, and
opencode-style bring-your-own-provider flexibility. Four skins, one agent engine,
any model.**

Type a task in the browser; an agent plans it, runs real shell commands in a
real workspace, edits real files, shows you diffs — with explicit approval gates
and a full Review / Files / Terminal side panel. Every part is yours: your
machine, your workspace, your API keys, your model.

```
  browser (React + Vite)                      Node backend (Express)
 ┌───────────────────────────┐   REST + SSE  ┌──────────────────────────────┐
 │ sidebar · thread cards    │ ◀───────────▶ │ agent loop                   │
 │ composer (model/approval) │               │  plan → run_command →        │
 │ Review / Files / Terminal │               │  write_file → diff → reply   │
 │ settings · ⌘K palette     │               ├──────────┬───────────────────┤
 └───────────────────────────┘               │ providers│ local workspace   │
                                             │ OpenAI-  │ git · fs · bash   │
        one `npm run dev` — no cloud,        │ compat:  │ (your machine)    │
        no account, no vendor lock-in        │ Codex UI │                   │
                                             │ UX:      │ DeepSeek, Qwen,   │
                                             │ plan &   │ Kimi, GLM, Ollama │
                                             │ cmd cards│ OpenRouter, …     │
                                             └──────────┴───────────────────┘
```

> **What "combines the strengths" means, honestly:**
> the *interaction surface* follows the Codex desktop idea — threads with plan
> checklists, `$ command` cards, diff cards, approval pills, a Review panel —
> while the *engine layer* follows what opencode proved: any OpenAI-compatible
> provider, key stays on your machine, the agent is just a tool-calling loop.
> Open Every Agent IDE is an independent implementation built from scratch; it takes
> inspiration from publicly observed UX patterns of both ecosystems, and from
> neither copies code, assets, or branding.

## Four independent products, one monorepo

Each product is a **separate frontend + backend process with its own API surface,
port and data directory** — not a reskinned single app. Pick what to run at launch:

```bash
npm run dev:codex    # IDE surface   :5175 → :8787   ~/.open-every-agent/codex
npm run dev:claude   # chat+artifacts:5176 → :8788   ~/.open-every-agent/claude
npm run dev:muse     # studio+voice :5177 → :8789   ~/.open-every-agent/muse
npm run dev:grok     # agent team   :5178 → :8790   ~/.open-every-agent/grok
```

| Product | Paradigm | API surface (guarded per product) |
| --- | --- | --- |
| **Codex** | agentic IDE: sidebar threads, plan/command/diff cards, worktrees, checkpoints, steering, terminal, Review/Files/Canvas/Browser panels, ⌘K | full: fs/git/terminal/worktree/preview/processes/screenshot/open |
| **Claude** | chat-first: Recents sidebar, Projects, Artifacts grid + half-screen artifact panel (Preview/Code) | chats, projects, artifacts, approvals, search (fs/terminal blocked) |
| **Muse** | creative studio: icon rail, brief → creations, Gallery wall with live thumbnails, Boards, Voice embodiment, Cloud PC placeholder | boards, creations/artifacts, voice (fs/terminal blocked) |
| **Grok Bot** | agent team: roster with custom agents, Dispatch (multi-select members), per-agent transcript feed (swarm cards), Automations center, Cloud PC placeholder | tasks, agents CRUD, swarm dispatch, automations (fs blocked) |

All four speak to the same provider layer (13 OpenAI-compatible presets + custom)
with per-product keys/config in their own state.json. Every surface is an
**original implementation** of a publicly observed design language; no third-party
code, artwork, fonts, icons, or logos are included.

| Product | Character (original SVG, state-machine animated) | Suggested provider |
| --- | --- | --- |
| **Codex** | orbiting core + ring | any (DeepSeek/Qwen/…) |
| **Claude** | breathing ray-mark | Anthropic-compatible |
| **Muse** | egg that wobbles, cracks, hatches a creature | Meta Llama-compatible |
| **Grok** | blinking robot with antenna; bobs while working, smiles when done | xAI-compatible |

Mechanism notes from studying the real apps: Muse's animated character is a
**Rive state machine** (idle → react → hatch) inside a 44 MB single-file web app;
Grok Bot is a **thin client for a cloud-rendered desktop agent**. We reproduce the
*interaction idea* — state-driven vector characters and a cloud-PC concept — with
zero-dependency SVG/CSS and an honest **Cloud PC placeholder** panel (grok/muse
skins): it simulates provisioning → boot → ready while the agent actually runs
against your local workspace.

Every skin attaches **any** provider (13 presets incl. Anthropic, Meta, xAI,
DeepSeek, Qwen, Kimi, GLM, OpenRouter, Groq, Ollama, custom). Settings →
"SKIN → PROVIDER 映射" pins a default provider per skin — switching skins
auto-switches providers, so each product surface can speak to its own vendor
*and* to the shared external pool.

## Upstream sync — official sources & feature diff

We track the latest official builds of the four products and re-derive their
feature surface each release. `tools/sync-dmgs.mjs` resolves the **official**
update feeds, downloads new builds, prunes old ones, and diffs the renderer
module lists so new features show up immediately:

```bash
npm run dmgs              # resolve latest versions only
node tools/sync-dmgs.mjs --all   # download + auto-prune old + analyze + feature diff
node tools/sync-dmgs.mjs --all --clean-downloads   # also prune old loose installers in ~/Downloads
```

Old builds are pruned automatically after each successful download (`--keep-old` to disable). Managed folder: `~/Downloads/OpenEveryAgent-DMGs/<product>/`
(`features-<version>.txt` holds the module list; the next `--all` run prints
`+new / -removed` module names vs the previous version.)

| Product | Official latest source (observed from in-app update config) |
| --- | --- |
| **OpenAI Codex** | Sparkle feed `https://persistent.oaistatic.com/codex-app-prod/appcast.xml` → `persistent.oaistatic.com/.../ChatGPT-darwin-arm64-<ver>.zip` |
| **Anthropic Claude** | `https://downloads.claude.ai/claude-science/latest/mac-arm64.dmg` |
| **Meta Muse** | Sparkle feed `https://www.facebook.com/endo/release/appcast.xml?channel=production` (signed CDN enclosure) |
| **Cursor Grok Bot** | `https://cursor.com/download/bot` → `downloads.cursor.com/grokbot/stable/darwin-arm64/<ver>/Grok_Bot_<ver>.dmg` |

Workflow each cycle: sync → feature-diff → read the new module names → build
the missing behaviours into the matching product shell.

## Why not just use X?

| | Codex-style desktop agents | opencode | **OpenEveryAgent IDE** |
|---|---|---|---|
| interface | native app, one vendor's account | terminal TUI | **web UI in any browser** |
| bring your own model | limited / vendor-bound | ✅ any provider | ✅ any OpenAI-compatible endpoint |
| plan / command / diff cards | ✅ | partial | ✅, streamed over SSE |
| approval gates | ✅ | ✅ | ✅ Auto / Ask / Read-only |
| real workspace (git, files, terminal) | ✅ | ✅ | ✅ with Review + commit UI |
| runs on | the vendor's binary | your terminal | `npm run dev` — laptop to server |
| multi-device access | no | hacky | **it's a web app** |
| license | proprietary | MIT-ish OSS | **AGPL-3.0, source stays open** |

**What we do not claim:** that this is a drop-in replacement for any hosted
product, or that the built-in simulator matches a frontier model. Simulated
mode exists so you can feel the full UX with zero keys; plug in DeepSeek, Qwen,
Kimi, GLM, OpenRouter, Groq or local Ollama for real work.

## Quick start

```bash
git clone https://github.com/reynold-hu/OpenEveryAgentIDE.git
cd OpenEveryAgentIDE
npm run setup     # installs backend + frontend deps
npm run dev       # backend :8787 + frontend :5175
open http://localhost:5175
```

Works with zero configuration (built-in simulator agent, real workspace,
everything local). To connect a real model: **Settings → Model Provider**.

## Model providers (opencode-style)

| Provider | Base URL | Example models |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat`, `deepseek-reasoner` |
| Qwen (DashScope) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen3-coder-plus`, `qwen-max` |
| Moonshot Kimi | `https://api.moonshot.cn/v1` | `kimi-k2-0905-preview` |
| Zhipu GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4.6` |
| OpenRouter | `https://openrouter.ai/api/v1` | any routed model id |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Ollama (local) | `http://localhost:11434/v1` | `qwen3-coder`, `deepseek-r1` |
| OpenAI | `https://api.openai.com/v1` | `gpt-5.1-codex` |
| Custom | any `/v1` endpoint | free-form |

Paste the API key in Settings (kept only in `~/.open-codex-ide/state.json` on
your machine — the API never returns it in plaintext, only `hasKey: true`).
**Sync** pulls the provider's live model list; or type a model directly.
Env fallback: `OPEN_CODEX_API_KEY`.

With a real provider, the agent runs a full tool-calling loop
(`update_plan` / `run_command` / `write_file` / `read_file`) streamed over SSE —
the same plan cards, command cards, diffs and approval gates as simulated mode,
with multi-turn context rebuilt from the stored transcript.

## Features

| Area | What you get |
| --- | --- |
| **Shell** | macOS-style titlebar, left nav rail (Home / Artifacts / History / Projects / Agents), collapsible sidebar, dark/light/system themes — deliberately logo-free & minimal in-app (the logo lives in this README + favicon) |
| **Sidebar** | project picker (+ create), search, chats grouped 置顶/Today/Yesterday/7-days, running-status pulse |
| **Threads** | SSE streaming, plan checklist cards, `$ command` cards with live output, merged "已编辑 N 个文件" card (+X −Y, 撤销, 查看变更, expandable file list), markdown replies |
| **Thread menu (···)** | 重命名 / 置顶 / 新建侧边聊天 / 继续 / Fork 到新对话 / 添加计划任务 / 分享 / 复制对话 / 新窗口打开 / 归档 |
| **Summary panel** | live task progress, changed files, web previews, command count, scheduled tasks, latest reply — every item jumps to its block in the thread |
| **Web preview + headless browser** | generated sites served from the workspace (`/preview/:project/…`), embedded preview pane, one-click Chrome headless screenshot, "打开方式" menu |
| **Canvas** | click any changed file to open it in an editable side canvas; save writes back to the workspace and updates the Review diff |
| **Composer** | model pill + approvals pill (Auto / Ask for approvals / Read-only), 📎 text-file attachments, Enter to send |
| **Approvals** | mutating commands & file changes pause for Allow/Deny cards; read-only mode blocks them |
| **Side panel** | Review (git status + colored diff + one-click commit), Files (tree + preview), Terminal (real shell in the workspace), 预览, 画布 |
| **Messages** | copy / read-aloud / 👍👎 feedback, scroll-to-bottom button, side-chat chips, ⌘S side chat |
| **Scheduled tasks** | recurring prompts that fire on the server even while the tab is closed |
| **Settings** | theme, provider + key, default model, approval mode, notification chime, reset |
| **⌘K palette** | fuzzy jump to chats + New chat (⌘N), side chat, summary toggle, theme, settings, panel, new project |
| **Persistence** | chats/settings survive restarts; workspaces are real git repos under `~/.open-codex-ide/workspaces/` |

## Architecture

```
OpenEveryAgentIDE/
├── backend/    Node + Express REST API (port 8787)
│   └── src/
│       ├── index.js      routes: settings / providers / models / projects / threads / approvals / fs / git / terminal / SSE
│       ├── agent.js      agent loop: built-in simulator + real-LLM tool-calling engine (dispatch by provider)
│       ├── providers.js  provider registry (DeepSeek/Qwen/Kimi/GLM/OpenRouter/Groq/Ollama/custom), key masking
│       ├── llm.js        OpenAI-compatible streaming client + agent tool schemas
│       ├── workfs.js     workspace fs, git status/diff/commit, shell exec
│       └── store.js      JSON persistence (~/.open-codex-ide/)
└── frontend/   Vite + React + TypeScript (port 5175, /api proxied to 8787)
    └── src/
        ├── App.tsx              shell, state, SSE event folding, shortcuts
        ├── components/          Sidebar, Composer, Blocks (plan/command/diff cards),
        │                        SidePanel (Review/Files/Terminal), SettingsModal, CommandPalette
        └── styles.css           dark + light theme system
```

## Fork it — Windows & macOS ports welcome 🪟🍎

This is exactly the kind of project that wants native shells, and the
front/back split makes it easy: wrap `frontend/dist` in **Tauri** or
**Electron** and ship the `backend/` as a sidecar process. Fork away, open an
issue to show off your port, and we'll link it here:

- [ ] Windows tray app (Tauri) — *your fork could be this*
- [ ] macOS menu bar + Dock (Codex-style) — *or this*
- [ ] iOS/Android via the web UI + hosted backend

Please keep the AGPL obligations and attribution intact (see below).

## License & attribution

Licensed under **AGPL-3.0-only** (see [LICENSE](LICENSE)):

- ✅ Use, modify, and run it however you like — forking and building on it is encouraged.
- 🔗 Distribute or host a modified version (network service included) → you must publish the modified source under the same license and keep the copyright notice plus a link to this repo.
- 🚫 Authorship must stay visible: no stripping notices, no relabeling a derivative as your own closed product.
- ™ "OpenEveryAgent" is this project's name — forks should rename to avoid misrepresenting origin.

*Codex is a trademark of OpenAI. opencode is a trademark of its respective owner.
Claude is a trademark of Anthropic. Grok is a trademark of xAI. Muse is a
trademark of Meta. Skin names here describe *look-and-feel targets implemented
entirely in original code* — no assets, fonts, characters, or code were taken
from any of them. This project is not affiliated with, endorsed by, or a
continuation of any of these companies.*

## API sketch

```
GET  /api/settings | PUT /api/settings | POST /api/reset
GET  /api/models   GET /api/providers   GET /api/providers/:id/models
GET|POST /api/projects        DELETE /api/projects/:id
GET|POST /api/threads         GET|PATCH|DELETE /api/threads/:id
POST /api/threads/:id/prompt  GET /api/threads/:id/stream (SSE)
POST /api/approvals/:id
GET  /api/projects/:id/tree|file|git    POST /api/projects/:id/terminal|commit
```

SSE events: `turn_started, plan, plan_update, command, command_update, command_result, approval_request, file_change, agent_message, agent_message_delta, agent_message_done, turn_complete, turn_error`.
