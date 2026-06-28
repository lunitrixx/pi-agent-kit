---
name: project-onboarding
description: Analyze a project to understand its structure, conventions, entry points, and tooling. Use when starting work in an unfamiliar codebase, after cloning a new repository, or when the user asks for a project overview, orientation, or "how does this project work".
---

# Project Onboarding

Analyze an unfamiliar project and build a mental model of its structure,
conventions, and workflows. The goal is to make the agent productive from the
first interaction, without the user having to explain the project manually.

## When to Use

- First session in a new project (or after `git clone`)
- User asks "what does this project do?", "how is this structured?", or "give
  me an overview"
- User says "I'm new to this codebase", "orient me", or "onboard me"
- After a long pause - to refresh the mental model

## Workflow

Execute these steps in order. Skip steps that don't apply (e.g. no git repo, no
package.json). Always report findings back to the user in a structured summary.

### Phase 1: Project Identity

1. **Read the README** - Look for `README.md`, `README`, `README.txt` (case-insensitive).
   Extract: project name, one-line purpose, key technologies.

2. **Read agent instructions** - Check for `CLAUDE.md`, `AGENTS.md`, `.cursorrules`,
   `.github/copilot-instructions.md`. These contain project-specific conventions
   that the agent must follow. Always read them fully.

3. **Check project memory** — If `lntrx-memory` is active, run `/memory scan` to
   generate the project file map (anatomy). Then search the cerebrum for prior
   knowledge about this project, and the buglog for known issues.

### Phase 2: Structure & Tooling

5. **Map the directory tree** - Run `ls -la` at the project root, then drill into
   top-level directories. Use `find` to count files by type if helpful. Identify:
   - Source code directories (`src/`, `lib/`, `app/`, etc.)
   - Test directories (`tests/`, `spec/`, `__tests__/`)
   - Documentation (`docs/`, `doc/`, `wiki/`)
   - Configuration (dotfiles at root)
   - Assets, scripts, CI/CD

6. **Identify package ecosystem** - Check for `package.json` (Node), `pyproject.toml`
   / `setup.py` (Python), `Cargo.toml` (Rust), `go.mod` (Go), `pom.xml` / `build.gradle`
   (Java), `Makefile`, `CMakeLists.txt`, etc. Note the package manager, build
   system, and key dependencies.

7. **Identify framework** - From dependencies and file structure, determine the
   framework (React, Next.js, Django, FastAPI, Express, etc.) and note the
   version if available.

### Phase 3: Entry Points & Workflows

8. **Find entry points** - Main source file, application bootstrap, route
   definitions, CLI entry point. Read the top of each to understand the
   application lifecycle.

9. **Check git history** - Run `git log --oneline -20` to see recent activity.
   Note active branches, commit conventions, and recent focus areas.

10. **Check CI/CD** - Look at `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`,
   or similar. Understand the pipeline: lint, test, build, deploy.

### Phase 4: Conventions & Patterns

11. **Linter/Formatter config** - Check for `.eslintrc`, `.prettierrc`, `pyproject.toml`
    (`[tool.ruff]`), `.editorconfig`, etc. Note code style rules.

12. **Test framework** - From dependencies and test files, identify the test
    runner (Jest, pytest, cargo test, etc.) and how to run tests.

13. **Environment & secrets** - Check for `.env.example`, `.env.template`,
    `docker-compose.yml`, or setup scripts. Note required environment variables
    and services.

### Phase 5: Report

After completing all phases, present a structured summary:

```
## Project: <name>
**Purpose:** <one-liner>
**Stack:** <language> + <framework> on <runtime/platform>
**Package manager:** <npm|yarn|pnpm|pip|cargo|...>

### Memory Scan
- Anatomy: <N> files mapped
- Cerebrum: <N> prior learnings found
- Buglog: <N> known issues

### Directory Map
- `src/` - application source
- `tests/` - test suite (Jest)
- `docs/` - documentation
- ...

### Key Commands
- Install: `npm install`
- Dev server: `npm run dev`
- Test: `npm test`
- Build: `npm run build`

### Conventions (from CLAUDE.md / tool config)
- <convention 1>
- <convention 2>

### Recent Activity (git log)
- <recent commits summary>

### Things to Know
- <important gotcha or note>
```

## Notes

- If a CLAUDE.md already contains thorough project documentation, keep Phase 1-3
  lighter and focus on what CLAUDE.md doesn't cover (recent git activity, actual
  file tree, dependency freshness).
- When the project has no documentation at all, invest more time in Phase 2-3 to
  compensate.
- Never modify files during onboarding. This is read-only analysis.
