# Pi Agent Kit

Pi-native toolkit providing extensions, skills, themes, prompts, and specialized agents for [pi-coding-agent](https://github.com/badlogic/pi-mono).

## Install

```bash
pi install npm:@lunitrixx/pi-agent-kit
```

### Extensions (14)
| Extension | What |
|---|---|
| `lntrx-header` | Rainbow LUNITRIXX banner + system info |
| `lntrx-lang` | `/lang de\|en` — response language |
| `lntrx-grill-me` | Socratic planning interview with severity levels |
| `lntrx-footer` | Token/cost/speed footer |
| `lntrx-permit` | Permission system: path, tool, bash, external-directory surfaces with shell tokenizer |
| `lntrx-githooks` | Git hooks (pre-commit main-block) — split from old lntrx-guard |
| `lntrx-health` | `/health` — codebase health: TODOs, large files, model/cost summary |
| `lntrx-localmodels` | Local LLM endpoint manager (`/local-models`) |
| `lntrx-postwrite` | Auto-format + LSP diagnostics on write/edit (merged from lntrx-fmt + lntrx-lsp) |
| `lntrx-memory` | Cross-session SQLite memory with FTS5 search, anatomy scanning, bug tracking |
| `lntrx-project-rules` | Inject `.pi/rules/` into system prompt + banner widget |

### Skills (15)
Auto-detected by Pi from your prompt.

| Skill | Triggers on |
|---|---|
| `grill-me` | "roast this", "review this code" |
| `merge-pr` | "merge PR 81" |
| `project-onboarding` | "what does this project do" |
| `commit` | "write a commit message" |
| `changelog` | "update changelog" |
| `pr` | "write a PR description" |
| `debug` | "fix this bug" |
| `refactor` | "clean up this code" |
| `test` | "add tests for" |
| `readme` | "generate README" |
| `docs-gen` | "write documentation" |
| `dep-update` | "update dependencies" |
| `extend-pi` | "build an extension" |
| `version-management` | "bump version", "release" |
| `pi-project-setup` | "initialize a project", "scaffold", "migrate to AGENTS.md" |

### Agents
Install `pi-subagents` for the `subagent` tool (see companion packages above).

### Theme
`/theme lunitrixx` — Dark amber theme with nerd font symbols.

## Optional companion packages

These Pi packages integrate well but are not bundled — install separately:

```bash
# Web access — web_search and fetch_content tools, librarian skill
pi install npm:pi-web-access

# MCP adapter — connect to MCP servers
pi install npm:pi-mcp-adapter

# Subagents — subagent delegation (reviewer, planner, worker, scout, oracle)
pi install npm:pi-subagents
```

Without `pi-subagents`, the `subagent` tool is unavailable.

## Development

```bash
npm install
pi install .
```
