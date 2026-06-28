# Pi Agent Kit

Pi-native toolkit providing extensions, skills, themes, prompts, and specialized agents for [pi-coding-agent](https://github.com/badlogic/pi-mono).

## Install

```bash
pi install npm:@lunitrixx/pi-agent-kit
```

### Extensions (13)
| Extension | What |
|---|---|
| `lntrx-header` | Rainbow LUNITRIXX banner + system info |
| `lntrx-lang` | `/lang de\|en` — response language |
| `lntrx-grill-me` | Socratic planning interview with severity levels |
| `lntrx-config` | Auto-provision web-search + shared config (`~/.pi/agent/`) |
| `lntrx-footer` | Token/cost/speed footer |
| `lntrx-guard` | Dangerous command confirmation, secret scanning, pre-commit hook blocking direct commits to main |
| `lntrx-health` | `/health` — codebase health: TODOs, large files, stale deps |
| `lntrx-context` | `/ctx` token usage report |
| `lntrx-localmodels` | Local LLM endpoint manager (`/localmodel`) |
| `lntrx-lsp` | LSP diagnostics after write |
| `lntrx-fmt` | Auto-format on write |
| `lntrx-memory` | Cross-session project memory (cerebrum, anatomy, buglog, scratchpad, daily) |
| `lntrx-project-rules` | Inject `.pi/rules/` into system prompt + banner widget |

### Skills (15)
Auto-detected by Pi from your prompt.

| Skill | Triggers on |
|---|---|
| `grill-me` | "roast this", "review this code" |
| `merge-pr` | "merge PR 81" |
| `project-onboarding` | "what does this project do" |
| `scratchpad` | "remember this for later" |
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
| `pi-project-setup` | "initialize a project", "scaffold", "migrate to AGENTS.md" |

### Agents
Subagents via `subagent` tool or `/parallel` command (pi-subagents).

| Agent | Purpose |
|---|---|
| `reviewer` | Code review |
| `planner` | Implementation planning |
| `scout` | Explore codebase |
| `worker` | Implementation |
| `oracle` | Second opinion |

### Theme
`/theme lunitrixx` — Dark amber theme with nerd font symbols.

### Bundled
- `pi-web-access` — web_search, fetch_content
- `pi-mcp-adapter` — MCP proxy tool
- `pi-subagents` — subagent delegation (reviewer, planner, worker, scout, oracle)
- `librarian` skill — open-source library research

## Development

```bash
npm install
pi install .
```
