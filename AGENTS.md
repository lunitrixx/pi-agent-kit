# AGENTS.md

Canonical source of truth for AI coding agents working in this repository. This
file is the single authority for project rules, workflow, conventions, and
skills policy. Pi reads it natively; Claude Code and Codex-compatible agents
read it through their respective adapters.

> Keep this file human-authored and concise. It is read by multiple agents
> (Pi, Claude Code, Codex, and any tool that can be pointed at it).

## Project

pi-agent-kit is a Pi-native toolkit providing extensions, skills, themes,
prompts, and specialized agents for the [pi-coding-agent](https://github.com/badlogic/pi-mono).
Install it as a Pi package to extend your Pi harness with project-independent
capabilities.

**Tech stack:** TypeScript (extensions), Markdown (skills, prompts, agents), JSON (themes)

**Key files:**
- `package.json` — Pi package manifest, extensions, bundled dependencies
- `extensions/lntrx-header/src/extension.ts` — Rainbow LUNITRIXX header + system info
- `themes/lunitrixx.json` — Dark amber theme with nerd font symbols

## Conventions

- Extensions live under `extensions/<name>/` with their own `package.json` and `src/extension.ts`.
- Skills use YAML frontmatter with `name` and `description` fields, live under `skills/<name>/SKILL.md`.
- Prompts are plain Markdown templates under `prompts/<name>.md`.
- Themes are JSON files under `themes/<name>.json`.
- Agents are Markdown definitions under `agents/<name>.md`.
- Package manager is npm. Run `npm install` before `pi install .` for local development.
- Do not change dependencies without approval.

## Skills

This repo is itself structured as a Pi package. Portable skills that ship with
the kit live in `skills/`. Pi loads them via the `"pi.skills"` field in
`package.json`.

Bundled skills:
- `changelog` — Write or update a changelog from git history
- `commit` — Write a conventional commit message from staged changes
- `debug` — Systematic debugging workflow
- `dep-update` — Check and update dependencies across any package manager
- `docs-gen` — Generate proper documentation site under docs/
- `extend-pi` — Decide and create the right Pi extension, skill, or agent
- `grill-me` — Harsh code review with severity levels
- `merge-pr` — Squash-merge GitHub PRs and clean up branches
- `pi-project-setup` — Bootstrap a new project to the Pi-native agent-config pattern
- `pr` — Write a pull request description from branch changes
- `project-onboarding` — Analyze unfamiliar codebases systematically
- `readme` — Generate or update project README.md
- `refactor` — Systematic refactoring with safety net
- `test` — Write unit and integration tests for existing code
- `version-management` — Bump version, write changelogs, and create git tags

## Agents

This kit does not ship its own agent definitions. Subagents (`review`, `plan`,
`build`) are provided by the `pi-subagents` dependency and loaded at runtime.

## Shared memory (lntrx-memory)

This project uses lntrx-memory for cross-session recall. Memory is stored in a
SQLite database with FTS5 full-text search — **every agent should consult it**:

- **DB path:** `~/.pi/memory.db` (override with `LNTRX_MEMORY_DB`)
- **Backend:** `node:sqlite` (Node 24+, no native dependencies)

### Tools

- `lntrx_memory_search(query, limit?, scope?)` — Search by keyword (FTS5)
- `lntrx_memory_learn(headline, detail?, category?, labels?, scope?, id?)` — Save or update
- `lntrx_memory_forget(id, table?)` — Delete an entry or bug
- `lntrx_memory_scan()` — Scan project anatomy
- `lntrx_memory_bug(symptom, solution?, state?, id?)` — Track or update a bug

### Commands

- `/memory list [N]` — Recent entries
- `/memory search <query>` — Full-text search
- `/memory learn <text>` — Quick save
- `/memory forget <id|all> [bug]` — Delete entries
- `/memory scan` — Rescan anatomy
- `/memory bug add|fix|close|delete` — Bug management
- `/memory bugs` — List open bugs
- `/memory health` — DB stats
