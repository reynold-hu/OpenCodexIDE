# OpenCodex IDE

A front-end / back-end separated web clone of the Codex desktop app (the "Codex" surface inside `ChatGPT.dmg`), rebuilt clean-room from observing the app's UI structure and design tokens.

> **Note** — the original app's Electron bundle is proprietary. Nothing from it is copied here: this is 100% original code (React + Vite frontend, Express backend) that recreates the look (same dark/light palette, layout, cards) and behavior (agent threads with plans, command execution, approvals, diffs, terminal, review, settings, command palette).

## License & attribution

Licensed under **AGPL-3.0-only** (see [LICENSE](LICENSE)). In practice this means:

- ✅ Anyone can use, modify and run it — forking this repo and building on it is encouraged.
- 🔗 If you distribute it or host a modified version for others (a network service counts), you **must publish the modified source under the same AGPL license** and keep the original copyright notice and a link to <https://github.com/reynold-hu/OpenCodexIDE>.
- 🚫 You may not remove authorship, relabel it as your own product, or close-source a derivative and sell it — that's piracy, and AGPL + §7(b) attribution terms make it legally unenforceable for anyone to do quietly.
- ™ "OpenCodex" is the project name; forks should rename (e.g. "MyCodex") to avoid misrepresenting origin.

(Honest note: no license can literally force people to press "Fork" instead of `git clone` — legally they're the same act. AGPL is the strongest *practical* shield: any closed "盗版" redistribution becomes copyright infringement, and forks must stay open and attributed.)

## Model providers (opencode-style)

The agent works out of the box with a **built-in simulated Codex** (no key needed). To drive it with a real model, open **Settings → Model Provider** and pick any OpenAI-compatible backend:

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

Paste the API key (kept only in local `~/.open-codex-ide/state.json`, never echoed by the API — the backend only exposes `hasKey: true`). Optionally **Sync** pulls the provider's live model list, or type a model name directly. Env fallback: `OPEN_CODEX_API_KEY`.

With a real provider, the agent runs a full tool-calling loop (`update_plan` / `run_command` / `write_file` / `read_file`) streamed over SSE — the same plan cards, command cards, diffs and approval gates as the simulated mode; multi-turn context is rebuilt from the stored transcript.

## Architecture

```
OpenCodexIDE/
├── backend/    Node + Express REST API (port 8787)
│   └── src/
│       ├── index.js      routes: settings / providers / models / projects / threads / approvals / fs / git / terminal / SSE
│       ├── agent.js      agent loop: simulated engine + real-LLM tool-calling engine (dispatch by provider)
│       ├── providers.js  opencode-style provider registry (DeepSeek/Qwen/Kimi/GLM/OpenRouter/Groq/Ollama/custom), key masking
│       ├── llm.js        OpenAI-compatible streaming client + agent tool schemas
│       ├── workfs.js     workspace fs, git status/diff/commit, shell exec
│       └── store.js      JSON persistence (~/.open-codex-ide/)
└── frontend/   Vite + React + TypeScript (port 5175, /api proxied to 8787)
    └── src/
        ├── App.tsx              shell, state, SSE event folding, shortcuts
        ├── components/          Sidebar, Composer, Blocks (plan/command/diff cards),
        │                        SidePanel (Review/Files/Terminal), SettingsModal, CommandPalette
        └── styles.css           dark + light themes from the app's design tokens
```

## Quick start

```bash
npm run setup      # installs backend + frontend deps
npm run dev        # backend :8787 + frontend :5175
# open http://localhost:5175
```

Separate terminals also work:

```bash
npm --prefix backend run dev
npm --prefix frontend run dev
```

## Features (parity with the desktop app)

| Area | What you get |
| --- | --- |
| **Shell** | macOS-style titlebar, collapsible sidebar, right side panel, dark/light/system theme |
| **Sidebar** | projects picker (+ create), search, chats grouped Today/Yesterday/7-days, running-status pulse, delete |
| **Threads** | SSE streaming, plan checklist cards, `$ command` cards with live output/collapsing, file-change cards with diff, markdown replies with typewriter streaming |
| **Composer** | model pill (GPT-5.1-Codex family…), approvals pill (Auto / Ask for approvals / Read-only), Enter to send, auto-grow |
| **Approvals** | mutating commands & file changes pause for Allow/Deny cards; read-only mode blocks them |
| **Side panel** | Review (git status + colored diff + one-click commit), Files (tree + preview), Terminal (real shell in the workspace) |
| **Settings** | theme, default model, approval mode, notification chime, account, reset data |
| **⌘K palette** | fuzzy jump to chats + New chat (⌘N), toggle theme, open settings/panel, new project |
| **Persistence** | chats/settings/projects survive restarts (`~/.open-codex-ide/`); workspaces are real git repos under `~/.open-codex-ide/workspaces/` |

The agent engine is a deterministic local simulator (inspects the workspace, plans, writes real files, shows real diffs, runs real commands). Swap `backend/src/agent.js` for an adapter to the real `codex` CLI or any model API if you want live responses.

## API sketch

```
GET  /api/settings | PUT /api/settings | POST /api/reset
GET  /api/models   GET /api/providers   GET /api/providers/:id/models
GET|POST /api/projects        DELETE /api/projects/:id
GET  /api/projects/:id/tree|file|git    POST /api/projects/:id/terminal|commit
GET|POST /api/threads         GET|PATCH|DELETE /api/threads/:id
POST /api/threads/:id/prompt  GET /api/threads/:id/stream (SSE)
POST /api/approvals/:id
```

SSE events: `turn_started, plan, plan_update, command, command_update, command_result, approval_request, file_change, agent_message, agent_message_delta, agent_message_done, turn_complete, turn_error`.
