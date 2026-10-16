<p align="center">
  <img src="assets/logo.png" alt="OpenCodex IDE" width="220"/>
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

# OpenCodex IDE

**A self-hosted, front-end/back-end separated web IDE that combines the strengths
of Codex-style agentic desktop UX with opencode-style bring-your-own-provider
flexibility.**

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
> OpenCodex IDE is an independent implementation built from scratch; it takes
> inspiration from publicly observed UX patterns of both ecosystems, and from
> neither copies code, assets, or branding.

## Why not just use X?

| | Codex-style desktop agents | opencode | **OpenCodex IDE** |
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
git clone https://github.com/reynold-hu/OpenCodexIDE.git
cd OpenCodexIDE
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
OpenCodexIDE/
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
- ™ "OpenCodex" is this project's name — forks should rename to avoid misrepresenting origin.

*Codex is a trademark of OpenAI. opencode is a trademark of its respective
owner. This project is not affiliated with, endorsed by, or a continuation of
either; it is an independent from-scratch implementation.*

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
