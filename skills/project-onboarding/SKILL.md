---
name: project-onboarding
description: Build a working model of an unfamiliar codebase - structure, flows, conventions, fragile areas. Use in a new or freshly cloned repo, or for "project overview", "orient me", "how does this project work".
---

# Project onboarding

Read-only: never modify project files. Skip steps that do not apply. Report a short summary after each phase. If AGENTS.md/CLAUDE.md is thorough, go light on phases 1-2 and deeper on 3-6; with no docs, invest in 3-5.

## 1. Identity
- README: name, purpose, key technologies.
- Agent instructions, fully: `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md`.
- Prior knowledge: the project's vault ledger (`projects/<orga>/<projekt>/memory.md`) and `stack-knowledge/`.

## 2. Structure and tooling
- Directory tree: source, tests, docs, config, scripts, CI.
- Manifests: package manager, build system, key dependencies, exact framework versions.

## 3. Boundaries (outside in)
- Deployment config (Dockerfile, compose, k8s): topology, databases, caches, queues, external APIs.
- ASCII boundary diagram, each connection labelled with protocol and port.
- All entry points: HTTP routes, CLI, jobs/cron/queue workers, webhooks, OAuth callbacks, gRPC/GraphQL.

## 4. Code (do not skip - read code, not file lists)
- Top 3-5 business-critical flows; read hot paths first.
- Read 3-5 files from different layers fully: repeated patterns, dependency injection, error handling, framework idioms.
- Trace the most important flow end to end and write it down:
  ```
  POST /api/orders -> OrderController.create() -> OrderService.createOrder()
    -> validate -> InventoryService.check() -> order.create() -> publish("order.created")
  <- 201 Created
  ```
- Data model: schemas, types, migrations, relationships; entity diagram.
- Direct dependencies and any unfamiliar framework or tool: look up every non-obvious one on the web (official docs: purpose, why chosen, maintained?) and cite the source.
- Module map: what each top-level source dir owns and exports; cross-module imports via grep, circular deps, dependency direction (UI -> logic -> data).
- Architecture pattern: layered, hexagonal, event-driven, MVC, monolith or services.

## 5. Conventions and quality
- Naming, file organisation, import order, comment style, test location.
- Linter/formatter config (`.eslintrc`, `.prettierrc`, ruff, `.editorconfig`, `tsconfig.json`, `biome.json`): strictness.
- Tests: framework, structure, fixtures/mocks, integration infra, run command. Pick one test and ask whether breaking the code would fail it.

## 6. History and fragility
```
git log --oneline -30
git log --oneline --all --grep="BREAKING"      # also: fix:, hack, workaround, TODO, FIXME, refactor
git log --stat --since="6 months ago" | grep "|" | sort | uniq -c | sort -rn | head -15
git log --oneline --follow <high-churn-file>   # hotfixes, reverts, repeated touches = unstable
```
- ADRs or design docs (`docs/adr/`, `docs/architecture/`, `docs/decisions/`).
- CI pipeline: what blocks a merge.
- Runtime config: `.env.example`, required services and env vars. If compose exists, suggest the user runs it.

## 7. Persist
Write stack and versions, architecture and boundary diagram, conventions, fragile modules and gotchas, entry points with traces, and notable dependencies into the project's vault ledger as the global rules describe. Always persist - the summary alone is lost.

## When to stop
Stop when you can explain a hot path end to end and new files teach nothing new. Then make one small, reversible change (a test around a fragile path, a guardrail) - never a rewrite.

## Summary

```
## Project: <name>
Purpose / Stack (<language> + <framework> on <runtime>)
### Architecture       pattern, topology, request lifecycle in 5-7 steps
### Boundary diagram
### Module map         | Module | Owns | Depends on | Risk |
### Key dependencies   | Dependency | Version | Purpose | Why this one |
### Critical flow      entry -> middleware -> service -> repository -> db
### Fragile areas      | File | Churn (6mo) | Pattern | Risk |
### Conventions        naming, testing + command, formatting
### Things to know     gotchas, circular deps, tech debt
### Install & run
### Persisted          what was written to the vault
```
