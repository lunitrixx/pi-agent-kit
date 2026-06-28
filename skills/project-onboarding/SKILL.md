---
name: project-onboarding
description: Analyze a project to understand its structure, conventions, entry points, and tooling. Use when starting work in an unfamiliar codebase, after cloning a new repository, or when the user asks for a project overview, orientation, or "how does this project work".
---

# Project Onboarding

Build a comprehensive mental model of an unfamiliar project. The goal is
mastery from the first session — the agent should understand not just *where*
things are, but *how* the code works, *why* decisions were made, and *what*
patterns govern every layer of the stack.

## When to Use

- First session in a new project (or after `git clone`)
- User asks "what does this project do?", "how is this structured?", or "give
  me an overview"
- User says "I'm new to this codebase", "orient me", or "onboard me"
- After a long pause — to refresh the mental model

## Workflow

Execute in order. Skip inapplicable steps (no git, no package.json). Report
back with a structured summary after each phase. **This is read-only — never
modify files.**

### Phase 1: Identity & Context

1. **Read the README.** Look for `README.md`, `README`, `README.txt`
   (case-insensitive). Extract: project name, one-line purpose, key technologies.

2. **Read agent instructions.** Check `CLAUDE.md`, `AGENTS.md`, `.cursorrules`,
   `.github/copilot-instructions.md`. These contain project-specific conventions.
   Always read them fully.

3. **Run memory scan.** Run `/memory scan` to generate the project file map
   (anatomy). Search the cerebrum for prior knowledge, and the buglog for
   known issues.

### Phase 2: Structure & Tooling

4. **Map the directory tree.** Run `ls -la` at project root, then drill into
   top-level directories. Identify: source dirs, test dirs, docs, config,
   assets, scripts, CI/CD.

5. **Identify package ecosystem.** Check package manifests (`package.json`,
   `pyproject.toml`, `Cargo.toml`, `go.mod`, etc.). Note the package manager,
   build system, and key dependencies.

6. **Identify framework and version.** From dependencies and directory structure,
   determine the exact framework(s) and their versions.

### Phase 3: Code Deep-Dive (the mastery layer)

This is where you stop skimming and start *reading code*. Do not skip.

7. **Read key source files.** Pick 3-5 representative files from different
   layers (API handler, service/business logic, data access, utility). Read
   them fully. Answer:
   - What patterns repeat across files?
   - How are dependencies injected or imported?
   - What does error handling look like?
   - Are there framework-specific idioms (decorators, middleware, hooks)?

8. **Trace one request / one flow end-to-end.** Pick a user-facing entry point
   (API route, CLI command, UI component) and follow it all the way to the
   database or external service. Read every file it touches. Document the call
   chain.

9. **Analyze the dependency graph.** List all direct dependencies. For each
   dependency that is **not** a well-known standard library, search the web
   briefly. Understand: what does this library do? Why was it chosen over
   alternatives? Is it actively maintained?

10. **Read the data model.** Find the schema definitions, type definitions,
    or database migrations. Understand the core entities and their
    relationships. Draw a mental (or ASCII) entity diagram.

11. **Identify architecture patterns.** From the code you read, determine:
    - Is this layered (controller → service → repository)?
    - Hexagonal/ports-and-adapters?
    - Event-driven?
    - Monolith or microservices?
    - MVC, MVVM, component-based?

### Phase 4: Conventions & Quality

12. **Analyze coding conventions.** From the files read, infer:
    - Naming conventions (camelCase, snake_case, PascalCase, kebab-case)
    - File organization rules
    - Import ordering and grouping
    - Comment style and frequency
    - Test file location and naming

13. **Inspect tooling config.** Check `.eslintrc`, `.prettierrc`,
    `pyproject.toml` (`[tool.ruff]`), `.editorconfig`, `tsconfig.json`,
    `biome.json`. Note: strictness level, enforced rules, format-on-save.

14. **Assess test infrastructure.** Find and read 1-2 test files. Answer:
    - Which test framework? Which assertion library?
    - How are tests structured (describe/it, test functions, table-driven)?
    - How are mocks/fixtures/factories handled?
    - Is there integration test infrastructure (test DB, Docker)?
    - How do you run tests? (`npm test`, `pytest`, `cargo test`, `go test ./...`)

### Phase 5: History & Operations

15. **Analyze git history.** Run:
    ```
    git log --oneline -30
    git log --oneline --all --grep="BREAKING"
    git log --oneline --all --grep="fix:"
    git log --oneline --all --grep="refactor"
    ```
    Identify: active areas, recent refactors, recurring bug patterns, breaking
    changes.

16. **Check CI/CD.** Read `.github/workflows/`, `.gitlab-ci.yml`, or similar.
    Understand the pipeline: lint, test, build, deploy. What blocks a merge?

17. **Inspect runtime configuration.** Check `.env.example`, config files,
    `docker-compose.yml`, `Dockerfile`. Note required services (database,
    cache, queue) and environment variables.

### Phase 6: Research Unknowns

18. **Look up unfamiliar technology.** For any framework, library, or tool
    encountered that is not immediately obvious, do a web search. Get the
    official docs landing page — not to read everything, but to understand
    its purpose, API surface, and relationship to the project stack.

19. **Search for project-specific gotchas.** Run:
    ```
    git log --oneline --all --grep="hack"
    git log --oneline --all --grep="workaround"
    git log --oneline --all --grep="TODO"
    git log --oneline --all --grep="FIXME"
    ```
    These highlight edge cases and technical debt.

### Phase 7: Persist Knowledge

20. **Save findings to lntrx-memory.** Use `lntrx_memory_learn` to persist:
    - Technology stack and versions (category: convention)
    - Architecture pattern (category: decision)
    - Key conventions (category: convention)
    - Known gotchas from git log (category: bug)
    - Entry points and their call chains (category: note)

    This ensures other agents (and future sessions) start from your discoveries,
    not from zero.

## Summary Template

After all phases, present:

```
## Project: <name>
**Purpose:** <one-liner>
**Stack:** <language> + <framework> on <runtime>

### Architecture
- **Pattern:** <layered | hexagonal | event-driven | ...>
- **Structure:** <directory overview>
- **Data flow:** <request lifecycle in 3-5 steps>

### Key Dependencies
| Dependency | Version | Purpose | Why? |
|---|---|---|---|
| <name> | <ver> | <what> | <reason> |

### One Request, Trace
<entry-point> → <middleware/gate> → <service> → <repository> → <database>

### Conventions
- **Naming:** <style>
- **Testing:** <framework>, <run-command>
- **Formatting:** <tool> with <rules>

### Things to Know
- <gotcha from git log>
- <unfamiliar dependency worth learning>
- <area with tech debt>

### Install & Run
```bash
git clone <repo> && cd <project>
<install-command>
<dev-command>
<test-command>
```

### Memory
- Anatomy: <N> files mapped
- Learnings saved: <N> entries
```

## Notes

- **Read code, don't just list files.** Phase 3 is the core differentiator.
  Without reading actual source, the agent is blind.
- **Search the web for unknowns.** Don't guess what an unfamiliar library does.
  Look it up and cite your source.
- **If a CLAUDE.md is thorough,** keep phases 1-2 lighter and go deeper on
  phases 3-6 — CLAUDE.md usually doesn't cover code-level patterns.
- **When the project has no documentation at all,** invest more time in phases
  3-5 to compensate.
- **Never modify files during onboarding.** This is read-only analysis.
- **Always persist.** The summary is nice, but `lntrx_memory_learn` entries
  are what make future sessions productive. Save liberally.
