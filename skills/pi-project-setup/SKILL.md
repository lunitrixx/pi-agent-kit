---
name: pi-project-setup
description: >-
  Bootstrap a new project or migrate an existing one to the Pi-native
  agent-config pattern. Creates AGENTS.md, thin CLAUDE.md adapter,
  .pi/rules/ with universal rules, .pi/skills/ for Pi-native skills,
  .claude/ symlinks, and all scaffolding files (.gitignore, .gitattributes,
  .editorconfig, .env.example, LICENSE.md, Makefile/justfile).
  Use when the user says "initialize a project", "setup a new repo",
  "bootstrap", "scaffold", "match the pi template", "migrate to AGENTS.md",
  "restructure agent config", or "adopt the pi-native pattern".
---

# Project Setup

Unified skill that covers both greenfield project initialization and
brownfield migration to the Pi-native agent-config pattern. Detects the
situation automatically and applies the right combination of scaffolding
and migration steps.

## When to use

- **New project:** "initialize a project", "setup a new repo", "bootstrap",
  "scaffold", "create a new project"

- **Existing project:** "match the pi template", "migrate to AGENTS.md",
  "adopt pi-native pattern", "restructure agent config"

## What this skill does

| Area | New project | Existing project |
|------|-------------|------------------|
| `AGENTS.md` | Scaffolded from scratch | Extracted from existing CLAUDE.md |
| `CLAUDE.md` | Thin adapter created | Rewritten to thin adapter |
| `.pi/rules/` | Created (4 universal rules) | Created (4 universal rules) |
| `.pi/skills/` | Empty dir + symlink | Populated from existing skills |
| `.pi/settings.json` | Created | Updated |
| `.gitignore` | Full stack-specific | Agent/secret entries appended |
| `.gitattributes` | Created | Created if missing |
| `.editorconfig` | Created | Created if missing |
| `.env.example` | Created | Created if missing |
| `LICENSE.md` | Created | Created if missing |
| `Makefile` / `justfile` | Created | Not touched |
| `git init` | Executed | Not touched |

## Skills location: two patterns

Regular projects use `.pi/skills/` as the canonical skills directory.

If the project **is a Pi package** (declares `"pi.skills"` in `package.json`),
skills live in a top-level `skills/` directory instead:

| Project type | Canonical skills dir | Symlink target |
|---|---|---|
| Regular project | `.pi/skills/` | `.claude/skills -> ../.pi/skills` |
| Pi package | `skills/` | `.claude/skills -> ../skills` |

## Hard rules

1. **Never lose project-specific information.** Existing conventions, commands,
   host tables, tech-stack details must be preserved in the new `AGENTS.md`.
2. **Never touch project source code.** Only agent-config and scaffolding files.
3. **Never overwrite without asking** if a file already has meaningful content.
4. **Universal rules go into `.pi/rules/`** — never inline them into `AGENTS.md`.
5. **Skills move to `.pi/skills/`, never copy.** The canonical skill lives exactly
   once. `.claude/skills/` becomes a git-tracked symlink.
6. **Project-specific files stay.** `.editorconfig` indent size, `flake.nix`,
   `package.json`, etc. are unchanged unless they truly conflict.

## Phase 1: Analyze current state

Run these checks in parallel:

1. **Determine project type** from package manifests:
   - `flake.nix` → Nix
   - `package.json` → Node / Pi package
   - `pyproject.toml` → Python
   - `Cargo.toml` → Rust
   - `go.mod` → Go
   - etc.

   If `package.json` has a `"pi.skills"` field, the project is a Pi package.

2. **Decide new vs. existing:**
   - If the directory is empty or has no meaningful files → **new project**
   - If it has source code, a README, or a git repo → **existing project**

3. **For existing projects, find agent instructions:**
   - `CLAUDE.md`, `AGENTS.md`, `CURSOR.md`, `.cursorrules`, `.github/copilot-instructions.md`
   - Read every one that exists fully.

4. **Check agent directories:**
   - `.claude/skills/` — real skills, symlink, or directory?
   - `.pi/skills/` — exists?
   - `.pi/` — `settings.json`, `rules/`?
   - `.github/` — PR template, issue templates?

5. **Check scaffolding files:**
   - `.editorconfig`, `.gitignore`, `.gitattributes`, `.env.example`, `LICENSE.md`
   - `.vscode/settings.json`, `.mcp.json`

6. **Check git:** Run `git rev-parse --git-dir 2>/dev/null`. If not initialized,
   do `git init` for new projects. Skip for existing projects without git.

7. **Confirm project name.** For new projects, ask if not obvious. For existing
   projects, derive from directory name, README, or `package.json`.

## Phase 2: Present the plan

Show the user exactly what will happen, grouped by action:

- **Create:** New files that don't exist
- **Replace:** Files that will be overwritten
- **Move:** Files changing location (skills migration)
- **Delete:** Files being removed (old lockfiles, duplicates)
- **Update:** Files being modified (`.pi/settings.json`, `.gitignore`)
- **Preserve:** Project-specific files staying unchanged

Ask for confirmation before touching anything.

## Phase 3: Execute

### Step 1: Create `.pi/rules/` (universal rules)

Create these four files. They are identical across every project — copy
verbatim:

**`.pi/rules/commit.md`:**
```
# Commit Rules

_Mandatory - additions allowed, removal or weakening is not._

## Format

```
type(scope): present-tense summary

Why this change, not what (code shows what).
```

## Rules

- Type: feat, fix, chore, docs, refactor, test, perf
- Scope: optional, lowercase, the affected module/component
- Summary: max 72 chars, imperative mood ("add" not "added")
- Body: explain motivation, not implementation
- Skip body if summary is self-explanatory
- ONE commit message per change - no bullet lists of unrelated changes

## Process

1. Run `git diff --staged` to see what changed.
2. Stage all changes with `git add` if nothing is staged.
3. Write ONE commit message and commit directly.
```

**`.pi/rules/pull-requests.md`:**
```
_Mandatory - additions allowed, removal or weakening is not._

- **NEVER open a PR without asking first.** Creating branches and commits is
  fine; only open a PR when explicitly asked.
- **NEVER merge a PR without explicit confirmation.** A green CI run is not the
  same as the change being verified by a real consumer on a real target.
- **Always squash-merge.** The squash commit title must include the PR number
  on the right: `type(scope): summary (#N)`. Use the `merge-pr` skill which
  handles this automatically.
```

**`.pi/rules/workflow.md`:**
```
_Mandatory - additions allowed, removal or weakening is not._

- Never commit directly to `main`. Every change goes through a branch and a Pull Request.
- Branch naming: `feat/<topic>` for features, `fix/<topic>` for bugfixes.
- Always use squash merge, with a single clean squash commit message (not a concatenation of every commit).
- Git/GitHub artifacts (commit messages, PR titles/bodies, issues, branch names) are always written in English.
- Do not add any trailer block to commits or PRs.
- After every user-facing change (feature, fix, rename, removal), update
  CHANGELOG.md under the topmost `## Unreleased` section. If the section
  doesn't exist, create it.
- After changes to project structure, entry points, or commands, check if
  README.md is still accurate and propose an update.
```

**`.pi/rules/writing-style.md`:**
```
Applies to all agent output: chat replies, docs, code comments, commit messages,
and PRs.

- Use a plain hyphen `-` as the dash. Do not use the longer em or en dash variants.
- Do not overuse emojis or decorative icons. Default to none; add one only when it
  genuinely aids clarity and the user has not asked you to avoid them.
```

### Step 2: Set up `AGENTS.md`

**For new projects** — scaffold from scratch:

```markdown
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
CLAUDE.md             # Claude Code adapter, points back to AGENTS.md and .pi/rules/
.pi/settings.json     # Pi project settings
.pi/rules/            # Universal rules (workflow, PRs, writing style) loaded by agents
.pi/skills/           # canonical Pi-native Agent Skills
.claude/skills -> ../.pi/skills  # symlink to canonical skills
.claude/rules -> ../.pi/rules    # symlink to canonical rules
.mcp.json             # shared MCP server config where supported
```

- **Instructions:** `AGENTS.md` is the single source of truth. `CLAUDE.md` is a
  thin adapter that delegates to `AGENTS.md`.
- **Skills:** Pi-native skills live canonically in `.pi/skills/`. Pi auto-discovers
  this directory. External harness skills (`~/.claude/skills`, `~/.codex/skills`)
  are loaded via `.pi/settings.json`. `.claude/skills/` and `.claude/rules/` are
  git-tracked symlinks to the canonical directories - no duplication.
- **MCP servers:** Shared in `.mcp.json`, read by Pi and Claude Code.

## Project

**<project-name>** — <one-line description>

**Tech stack:** <language/framework>

## Conventions

- Follow existing code conventions; check sibling files before creating anything new.
- Prefer the project's own generators/scaffolding over hand-written boilerplate.
- Run the project's formatter and linter before finalizing changes.

<!-- Add project-specific conventions here as they emerge. -->
```

**For existing projects** — extract from the current agent instructions
(usually `CLAUDE.md`). Use the same template structure but fill `## Project`
and `## Conventions` from the existing content.

Extraction rules:
- **`## Project`:** Pull from the existing README or first section of CLAUDE.md.
  Include tech stack, purpose, key directories.
- **`## Conventions`:** Extract _project-specific_ conventions only. Universal
  rules stay in `.pi/rules/` — remove them from AGENTS.md if the old CLAUDE.md
  had them inline.
- **`## Skills`:** List skills found in `.pi/skills/` (after migration) plus
  relevant pi-agent-kit skills.

### Step 3: Write thin `CLAUDE.md`

```markdown
# CLAUDE.md

> **This repo is Pi-native.** This file is a thin Claude Code adapter.
> The canonical project rules live in `AGENTS.md` and `.pi/rules/`.

@AGENTS.md

@.pi/rules/workflow.md
@.pi/rules/pull-requests.md
@.pi/rules/writing-style.md
@.pi/rules/commit.md
```

If an old `CLAUDE.md` had Claude-specific config (sandbox settings, env vars,
plugin config), those live in `.claude/settings.json` — keep them there, do not
copy into the new `CLAUDE.md`.

### Step 4: Handle skills

**If `.claude/skills/` has real skills (SKILL.md files):**

1. Create `.pi/skills/<name>/` for each skill (or `skills/<name>/` for Pi packages)
2. Move each `SKILL.md` and its supporting files into the canonical directory
3. Remove the old `.claude/skills/` directory
4. Create a git-tracked symlink: `ln -s ../.pi/skills .claude/skills`
   (or `ln -s ../skills .claude/skills` for Pi packages)
5. Stage the symlink with `git add .claude/skills`

**If `.pi/skills/` already has canonical skills:**

- Just create the symlink if `.claude/skills/` is still a directory or missing.

**If no skills exist anywhere:**

- Create `.pi/skills/` as an empty directory (or `skills/` for Pi packages)
- Create the symlink: `ln -s ../.pi/skills .claude/skills`

**Note:** The symlink is git-tracked (mode `120000`). It works cross-platform.

### Step 5: Update `.pi/settings.json`

Ensure it has at least:
```json
{
    "skills": [
        "~/.claude/skills",
        "~/.codex/skills"
    ]
}
```

Pi auto-discovers `.pi/skills/` — no explicit entry needed. Preserve any
existing keys beyond `skills`.

### Step 6: Create `.claude/rules` symlink

```
ln -s ../.pi/rules .claude/rules
git add .claude/rules
```

If `.claude/` doesn't exist yet, create it first: `mkdir .claude`

### Step 7: Scaffolding files (create if missing)

**`.gitignore`** — for new projects, create full stack-specific gitignore.
For existing projects, only append agent/scaffolding entries:

```
# Agent personal / machine-specific config (never commit)
.claude/settings.local.json
.pi/settings.local.json

# Secrets & environment
.env
.env.*
!.env.example
```

Also add `skills-lock.json` if it exists (it's no longer needed).
Never remove existing `.gitignore` entries.

For new projects, also include these universal patterns plus stack-specific
ones (`node_modules/`, `__pycache__/`, `/target/`, etc.):

```
# OS junk
.DS_Store
Thumbs.db
Desktop.ini

# Editor junk
*.swp
*.swo
*~

# Build output
dist/
build/
```

**`.gitattributes`** (if missing):
```
# Auto-detect text files and normalize to LF
* text=auto

# Explicit text types
*.md text
*.json text
*.yaml text
*.yml text
*.toml text
*.xml text
*.sh text eol=lf
*.bash text eol=lf

# Source code (include the relevant extensions for the detected stack)
*.ts text eol=lf
*.tsx text eol=lf
*.js text eol=lf
*.py text eol=lf
*.rs text eol=lf
*.go text eol=lf
*.css text eol=lf
*.html text eol=lf

# Binary
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.woff binary
*.woff2 binary
*.pdf binary
```

**`.editorconfig`** (if missing, or only for new projects — ask for existing):
```ini
# EditorConfig is awesome: https://editorconfig.org
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
```

**`.env.example`** (if missing):
```
# Copy this file to .env and fill in real values.
# .env is gitignored; this example file is committed and documents required vars.
# Add project-specific environment variables below.
```

**`LICENSE.md`** (if missing):
Standard MIT license. Copyright year: current year. Copyright holder: ask the
user if not obvious from existing files (git config, README author).

**`.vscode/settings.json`** (if `.vscode/` exists but settings.json missing):
```json
{
    "files.eol": "\n",
    "editor.formatOnSave": true
}
```

**`Makefile`** or **`justfile`** — for new projects only. Ask which task runner
the user prefers. Create a minimal one:

```makefile
.PHONY: help install dev test build lint clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	@echo "TODO: add install command"

dev: ## Start development server
	@echo "TODO: add dev command"

test: ## Run tests
	@echo "TODO: add test command"

build: ## Build for production
	@echo "TODO: add build command"

lint: ## Lint code
	@echo "TODO: add lint command"

clean: ## Remove build artifacts
	@echo "TODO: add clean command"
```

### Step 8: Remove obsolete files

- `skills-lock.json` — Skills are now in `.pi/skills/`, tracked by git.

- `.claude/skills/` old contents (replaced by symlink).

- Any duplicate agent instruction files (`.cursorrules`, `.github/copilot-instructions.md`)
  that are fully covered by `AGENTS.md` — but only if the user confirms.

## Phase 4: Verify

1. Read back `AGENTS.md` — is all project-specific info preserved?
2. Check `.pi/rules/` — 4 files, no project-specific content leaked in.
3. Check `.claude/skills/` — symlink to `.pi/skills/`.
4. Check `.claude/rules/` — symlink to `.pi/rules/`.
5. Check `.pi/skills/` — canonical skills present.
6. Check scaffolding: `.gitignore`, `.gitattributes`, `.editorconfig`, `.env.example`.
7. Verify no universal rules remain inline in `AGENTS.md`.
8. Run `git status` to review all changes.

## Edge cases

- **No existing agent config at all:** Scaffold `AGENTS.md` from the new-project
  template with a `TODO` in `## Project`. Ask the user to fill it.
- **`AGENTS.md` already exists and is populated:** Ask before overwriting.
- **No `.pi/` directory:** Create it with `settings.json` and `rules/`.
- **`.claude/` doesn't exist:** Create it with the two symlinks.
- **`.editorconfig` indent differs from defaults:** Keep the project's existing
  indent size.
- **Project is a Pi package** (`"pi.skills"` in `package.json`): Use `skills/`
  instead of `.pi/skills/` as the canonical skills directory. Symlink targets
  adjust accordingly.
- **CI/CD references agent files:** Check `.github/workflows/` — if any
  workflow reads `CLAUDE.md` or skills paths, update them.

## Note on `CLAUDE.md` @-references

The `@AGENTS.md` and `@.pi/rules/*.md` references in the thin `CLAUDE.md` are
Claude Code's native include mechanism. Pi reads `AGENTS.md` directly (it's in
the project context) and loads `.pi/rules/` via the pi-agent-kit extension.
Other agents (Codex, etc.) should be pointed at `AGENTS.md` and configured to
load `.pi/rules/` or the individual rule files they need.
