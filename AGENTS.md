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
- `grill-me` — Harsh code review with severity levels
- `merge-pr` — Squash-merge GitHub PRs and clean up branches
- `project-onboarding` — Analyze unfamiliar codebases systematically
- `scratchpad` — Persistent TODO list across sessions via lntrx-memory
- `commit` — Generate conventional commit messages from staged changes
- `changelog` — Write changelog entries from git history
- `pr` — Generate pull request descriptions from branch changes
- `debug` — Systematic debugging workflow
- `refactor` — Systematic refactoring with safety net
- `test` — Write unit and integration tests for existing code
- `readme` — Generate or update project README.md
- `docs-gen` — Generate proper documentation site under docs/
- `dep-update` — Check and update dependencies across any package manager
- `extend-pi` — Decide and create the right Pi extension, skill, or agent
- `librarian` — Research open-source libraries with evidence-backed answers (from pi-web-access)

## Agents

Subagent definitions live in `agents/`. Each is a Markdown file with YAML
frontmatter specifying name, tools, and model.

- `review` — Code review specialist (read-only)
- `plan` — Creates bite-sized implementation plans
- `build` — General-purpose implementation agent

## Prompts

Prompt templates live in `prompts/`. Use with `/prompt:<name>`.

- `commit` — Conventional commit message
- `changelog` — Changelog entry
- `pr` — Pull request description
- `refactor` — Systematic refactoring workflow

## Shared memory (lntrx-memory)

This project uses lntrx-memory for cross-session memory. Memory files are plain
Markdown/JSON — **every agent should consult them**:

- `.pi/memory/cerebrum.md` — learned conventions, preferences, and corrections
- `.pi/memory/anatomy.md` — project file map with token estimates
- `.pi/memory/buglog.json` — known bugs and their fixes
- `.pi/memory/scratch.md` — persistent TODO checklist
- `.pi/memory/daily/` — daily work log
- `~/.pi/agent/memory/` — global memory (preferences across all projects)

Use `/memory show`, `/memory scan`, `lntrx_memory_search`, and
`lntrx_memory_learn` to interact with memory.
