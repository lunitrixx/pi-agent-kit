---
name: pi-project-setup
description: Bootstrap a new project or migrate an existing one to the Pi-native agent config (AGENTS.md, thin CLAUDE.md, .pi/skills, .claude symlink, scaffolding files). Use for "initialize/bootstrap/scaffold a project", "setup a new repo", "match the pi template", "migrate to AGENTS.md", "adopt the pi-native pattern".
---

# Pi project setup

## Hard rules
1. Never lose project-specific information (conventions, commands, host tables, stack details) - it goes into the new `AGENTS.md`.
2. Never touch source code - only agent config and scaffolding.
3. Never overwrite a file with meaningful content without asking.
4. `AGENTS.md` holds project-specific conventions only. Universal ones (commit format, PR etiquette, branch policy, writing style) live in the global system prompt; never copy them into any project file - drop them when migrating.
5. Skills are moved, never copied: one canonical copy, `.claude/skills` is a git-tracked symlink.
6. Keep project-specific files (`.editorconfig` indent, `flake.nix`, `package.json`) unless they truly conflict.

Skills dir: regular project `.pi/skills/` (symlink `.claude/skills -> ../.pi/skills`); Pi package (`"pi.skills"` in `package.json`) `skills/` (symlink `.claude/skills -> ../skills`).

## 1. Analyze (in parallel)
- Project type from manifests (`flake.nix`, `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, ...); Pi package?
- New (empty/no meaningful files) or existing (source, README or git)?
- Read every existing agent instruction file fully: `CLAUDE.md`, `AGENTS.md`, `CURSOR.md`, `.cursorrules`, `.github/copilot-instructions.md`.
- State of `.claude/skills/` (real dir, symlink, missing), `.pi/skills/`, `.pi/settings.json`, `.github/` templates, `.editorconfig`, `.gitignore`, `.gitattributes`, `.env.example`, `LICENSE.md`, `.vscode/settings.json`, `.mcp.json`.
- `git rev-parse --git-dir`: new project without git -> `git init`; existing without git -> leave it.
- Project name: ask for new projects if unclear; existing: from directory, README or `package.json`.

## 2. Plan
Show Create / Replace / Move / Delete / Update / Preserve lists and wait for confirmation.

## 3. Execute

**AGENTS.md** - new projects use this template; existing projects use it too, filling `## Project` from README/CLAUDE.md (stack, purpose, key dirs), `## Conventions` with project-specific conventions only, and `## Skills` with the migrated skills plus relevant pi-agent-kit skills.

````markdown
# AGENTS.md

Canonical source of truth for AI coding agents working in this repository. This
file is the single authority for project rules, workflow, conventions, and
skills policy. Pi reads it natively; Claude Code and Codex-compatible agents
read it through their respective adapters.

> Keep this file human-authored and concise. It is read by multiple agents
> (Pi, Claude Code, Codex, and any tool that can be pointed at it).

## Architecture

This repo is **Pi-native**. The canonical locations are:

```
AGENTS.md             # canonical project instructions for Pi and compatible agents
CLAUDE.md             # Claude Code adapter, points back to AGENTS.md
.pi/settings.json     # Pi project settings
.pi/skills/           # canonical Pi-native Agent Skills
.claude/skills -> ../.pi/skills  # symlink to canonical skills
.mcp.json             # shared MCP server config where supported
```

- **Instructions:** `AGENTS.md` is the single source of truth. `CLAUDE.md` is a
  thin adapter that delegates to `AGENTS.md`.
- **Skills:** Pi-native skills live canonically in `.pi/skills/`. Pi auto-discovers
  this directory. External harness skills (`~/.claude/skills`, `~/.codex/skills`)
  are loaded via `.pi/settings.json`. `.claude/skills/` is a git-tracked symlink
  to the canonical skills directory - no duplication.
- **MCP servers:** Shared in `.mcp.json`, read by Pi and Claude Code.

## Project

**<project-name>** - <one-line description>

**Tech stack:** <language/framework>

## Conventions

Project-specific conventions only; add them as they emerge. Universal agent
conventions (commit format, PR etiquette, branch policy, writing style) are
provided by the global system prompt - never write them into this file.
````

**CLAUDE.md** - exactly this; Claude-specific settings stay in `.claude/settings.json`:

```markdown
# CLAUDE.md

> **This repo is Pi-native.** This file is a thin Claude Code adapter.
> The canonical project rules live in `AGENTS.md`.

@AGENTS.md
```

**Skills**
- Real skills in `.claude/skills/`: move each `<name>/` with supporting files into the canonical dir, remove the old dir, `ln -s ../.pi/skills .claude/skills` (Pi package: `../skills`), `git add .claude/skills`.
- Canonical skills already exist: only create the symlink.
- None anywhere: create the empty canonical dir and the symlink.

**.pi/settings.json** - keep existing keys; ensure `{"skills": ["~/.claude/skills", "~/.codex/skills"]}` (`.pi/skills/` is auto-discovered).

**Scaffolding** (create if missing; never remove existing entries):
- `.gitignore` - existing projects append only:
  ```
  # Agent personal / machine-specific config (never commit)
  .claude/settings.local.json
  .pi/settings.local.json

  # Secrets & environment
  .env
  .env.*
  !.env.example
  ```
  plus `skills-lock.json` if present. New projects additionally get OS junk (`.DS_Store`, `Thumbs.db`, `Desktop.ini`), editor junk (`*.swp`, `*.swo`, `*~`), build output (`dist/`, `build/`) and stack-specific entries (`node_modules/`, `__pycache__`, `/target/`).
- `.gitattributes` - `* text=auto`; `text` for md/json/yaml/yml/toml/xml; `text eol=lf` for sh, bash and the stack's sources (ts, tsx, js, py, rs, go, css, html); `binary` for png, jpg, jpeg, gif, ico, woff, woff2, pdf.
- `.editorconfig` (new projects; ask for existing) - `root = true`; `[*]` utf-8, lf, space, indent 2, final newline, trim trailing whitespace; `[*.md]` no trimming; `[Makefile]` tabs.
- `.env.example` - comment header: copy to `.env` and fill in; `.env` is gitignored, this file documents required vars.
- `LICENSE.md` - MIT, current year, holder from git config/README or ask.
- `.vscode/settings.json` (only if `.vscode/` exists) - `{"files.eol": "\n", "editor.formatOnSave": true}`.
- New projects only: ask Makefile or justfile; create targets `help` (self-documenting from `## ` comments), `install`, `dev`, `test`, `build`, `lint`, `clean`, each a TODO echo.

**Remove**: `skills-lock.json`; old `.claude/skills/` contents; `.cursorrules`/`copilot-instructions.md` fully covered by AGENTS.md - only after confirmation.

## 4. Verify
Read back `AGENTS.md` (nothing project-specific lost, no universal rules), check both skills paths and the symlink, the scaffolding files, `git status`.

## Edge cases
- No agent config at all: template with a TODO in `## Project`; ask the user to fill it.
- Populated `AGENTS.md` exists: ask before overwriting.
- Missing `.pi/` or `.claude/`: create them.
- Existing `.editorconfig` indent differs: keep it.
- CI workflows reading `CLAUDE.md` or skill paths: update them.
