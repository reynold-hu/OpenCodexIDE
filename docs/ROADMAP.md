# Roadmap & TODOs

## OpenScience (future fifth product)

Goal: an algorithm-research & data-analysis IDE — the research counterpart to the
four agent surfaces. Long-term it should merge with the **Claude Science** app
(`com.anthropic.operon`) experience we already track upstream.

Direction
- Research notebook surface: reproducible runs, dataset registry, experiment
  diffing, result provenance (ties into our checkpoint/usage systems).
- Data analysis: SQL + dataframe engine (DuckDB / Polars style), charts,
  statistical summaries, notebook kernels.
- Algorithm research: training/eval loops, hyperparameter sweeps, benchmarking
  harnesses, GPU/job runners — built on solid open-source stacks (PyTorch,
  scikit-learn, JAX, Arrow/DuckDB, Jupyter kernels) rather than custom engines.
- Agent parity: the same provider layer + harness (builtin / opencode serve),
  multi-agent swarm, automations, long-running experiments with checkpoints.
- Integration with Claude Science: adopt its research/analysis workflows
  (tracked via the upstream sync tool's `science` channel) in an open,
  self-hosted form.

Status: backlog — scaffold the product directory + backend surface after the
four IDE surfaces reach feature parity.

## Upstream tracking

- `node tools/sync-dmgs.mjs --all --clean-downloads` each cycle (latest builds,
  prune old, feature-module diff). Sources documented in README.
- Watch for new modules in `features-<version>.txt` diffs and replicate them.

## Codex (priority)

- [x] Dots (7 gradient variants, spring states, dots sidebar, Compact/Detailed)
- [x] ChatGPT / ChatGPT Work / Codex conversation-detail modes
- [x] Passkey lock (WebAuthn Touch ID): backend routes + lock screen
- [x] Dot character preview + onboarding "flight" animation
- [x] Auto-review rule settings (allow network/writes, block destructive)
- [x] Dot voice call surface (Web Speech placeholder call modal)
- [x] Cloud chats section (local vs cloud task split, placeholder)

## Claude surface

- [ ] Projects chat grouping + knowledge base (AGENTS.md) cross-project search
- [ ] Artifact annotations (selection comments) persisted per artifact
- [ ] Passkey lock (shared component with Codex)

## Muse surface (8.0 sync findings)

- [ ] **Tasks list redesign** (`hatch_tasks_list_redesign`)
- [ ] Passkey login (`enable_passkey_login` — shared lock component)
- [ ] Creation detail: version history, remix chains
- [ ] Cloud PC: map/device/WhatsApp placeholder panels (`show_whatsapp_on_cvm`,
      `map_vector_style_grayscale`, `home_device_help_url`)

## Grok Bot surface

- [ ] Per-agent transcript view (done in swarm cards → extend to full view)
- [ ] Bot marketplace (bot-template details/share cards observed upstream)
- [ ] Cloud agent artifact OTel/trace panel (`cloud-agent-artifact-open-telemetry`)
- [ ] Approval-mode switcher parity (`chunk-approval-mode-switcher`)

## Shared / infra

- [ ] Provider: Ollama model pull from UI; per-product key management screen
- [ ] Harness: opencode passkey-aware sessions, model allowlist per product
- [ ] Update checker in-app (read upstream feeds from the app itself)
