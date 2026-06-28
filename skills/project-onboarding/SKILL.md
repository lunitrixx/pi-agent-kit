---
name: project-onboarding
description: Analyze a project to understand its structure, conventions, entry points, and tooling. Use when starting work in an unfamiliar codebase, after cloning a new repository, or when the user asks for a project overview, orientation, or "how does this project work".
---

# Project Onboarding

Build a comprehensive mental model of an unfamiliar project. The goal is
mastery from the first session — the agent should understand not just *where*
things are, but *how* the code works, *why* decisions were made, *what*
patterns govern every layer of the stack, and *where* the system breaks
under pressure.

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

### Phase 3: System Boundaries (the outside-in view)

Understanding a system starts at its edges. This phase builds the map of
what the system talks to and how.

7. **Read deployment configuration.** Open Dockerfile, docker-compose.yml,
   Kubernetes manifests, or whatever deploys this system. This reveals the
   true topology: monolith or microservices? What databases, caches, queues
   are connected? What external APIs does it call?

8. **Draw a boundary diagram.**
   ```
   ┌──────────────────────────────┐
   │         Your System          │
   │                              │
   │  ┌────────┐    ┌─────────┐  │
   │  │  HTTP  │    │  Worker │   │
   │  └───┬────┘    └────┬────┘  │
   │      │              │        │
   └──────┼──────────────┼────────┘
          │              │
     ┌────┴────┐    ┌────┴────┐
     │ Postgres │    │  Redis  │
     │  :5432   │    │  :6379  │
     └─────────┘    └─────────┘
   ```
   Label each connection with its protocol (HTTP, gRPC, SQL, AMQP, Redis).
   This diagram anchors everything that follows.

9. **Find all entry points.** Every system has places where the outside world
   touches it. Find them all:
   - HTTP routes (grep for `app.get`, `router.post`, `@Get`, `@Post`)
   - CLI commands (main function, argparse, clap, cobra)
   - Background jobs (queue workers, cron jobs, scheduled tasks)
   - Webhook handlers, OAuth callbacks
   - gRPC service definitions, GraphQL resolvers

### Phase 4: Code Deep-Dive (the mastery layer)

This is where you stop skimming and start *reading code*. Do not skip.

10. **Identify the top 3-5 business-critical flows.** Ask: what actions do
    users perform most? Login, checkout, search, dashboard, data export? These
    hot paths are where the business would feel pain first if something broke.
    Prioritize them — read hot paths before cold ones.

11. **Read key source files from different layers.** Pick 3-5 representative
    files (API handler, service/business logic, data access, utility). Read
    them fully. Answer:
    - What patterns repeat across files?
    - How are dependencies injected or imported?
    - What does error handling look like?
    - Are there framework-specific idioms (decorators, middleware, hooks)?

12. **Trace the critical flows end-to-end.** Pick the most important user
    action and follow it from entry point to database and back. Read every
    file it touches. Document the call chain in a compact trace notation:
    ```
    POST /api/orders
      → OrderController.create()
         → OrderService.createOrder()
            → validates input (Zod schema)
            → checks inventory (InventoryService.check())
            → creates record (prisma.order.create())
            → publishes event (EventBus.publish("order.created"))
         ← { orderId, status }
      ← 201 Created
    ```
    A text-based trace is worth more than reading 50 disconnected files.

13. **Read the data model.** Find the schema definitions, type definitions,
    or database migrations. Read every table/collection and its relationships.
    The data model is the closest thing to ground truth — code can lie, but
    the database schema rarely does. Draw an entity diagram.

14. **Analyze the dependency graph.** List all direct dependencies. For each
    dependency that is **not** a well-known standard library, search the web
    briefly. Understand: what does this library do? Why was it chosen over
    alternatives? Is it actively maintained?

15. **Map module boundaries and ownership.** List every top-level directory
    under source. For each, answer: what does this module own? What data does
    it control? What does it export to other modules?
    ```
    src/
      auth/       → Owns: users, sessions, permissions
      orders/     → Owns: orders, line items, order status
      payments/   → Owns: payment records, refunds
    ```

16. **Check inter-module dependencies.** Which modules import which? Run grep
    to find cross-module imports. Look for circular dependencies (auth imports
    from orders AND orders imports from auth? That's an architectural smell.)
    Check if the dependency direction is clean (UI → Business Logic → Data).

17. **Identify architecture patterns.** From the code you read, determine:
    - Is this layered (controller → service → repository)?
    - Hexagonal/ports-and-adapters?
    - Event-driven?
    - Monolith or microservices?
    - MVC, MVVM, component-based?

### Phase 5: Conventions & Quality

18. **Analyze coding conventions.** From the files read, infer:
    - Naming conventions (camelCase, snake_case, PascalCase, kebab-case)
    - File organization rules
    - Import ordering and grouping
    - Comment style and frequency
    - Test file location and naming

19. **Inspect tooling config.** Check `.eslintrc`, `.prettierrc`,
    `pyproject.toml` (`[tool.ruff]`), `.editorconfig`, `tsconfig.json`,
    `biome.json`. Note: strictness level, enforced rules, format-on-save.

20. **Assess test infrastructure.** Find and read 1-2 test files. Answer:
    - Which test framework? Which assertion library?
    - How are tests structured (describe/it, test functions, table-driven)?
    - How are mocks/fixtures/factories handled?
    - Is there integration test infrastructure (test DB, Docker)?
    - How do you run tests? (`npm test`, `pytest`, `cargo test`, `go test ./...`)

21. **Test the tests (mutation check).** Pick one test file. Mentally note
    what behavior it asserts. Now imagine breaking the corresponding source
    code — would this test catch it? Tests that are too permissive or test
    only the happy path are a risk signal.

### Phase 6: History & Fragility

22. **Analyze git history.**
    ```
    git log --oneline -30
    git log --oneline --all --grep="BREAKING"
    git log --oneline --all --grep="fix:"
    ```
    Identify: active areas, recent refactors, recurring bug patterns.

23. **Find fragile code with churn analysis.** The files that change most
    often are the ones most likely to break again. Run:
    ```
    git log --stat --since="6 months ago" | grep "|" | sort | uniq -c | sort -rn | head -15
    ```
    High-churn files are a risk signal even if they look clean on the surface.

24. **Read the story behind fragile files.** For each high-churn file, run
    `git log --oneline --follow <file>`. Look for:
    - Many small reactive commits ("quick fix", "hotfix")
    - Rollbacks or reverts
    - The same area touched repeatedly across short time spans
    These patterns signal unstable code that never got properly stabilized.

25. **Search for design decisions.** Run:
    ```
    git log --oneline --all --grep="hack"
    git log --oneline --all --grep="workaround"
    git log --oneline --all --grep="TODO"
    git log --oneline --all --grep="FIXME"
    git log --oneline --all --grep="refactor"
    ```
    These reveal technical debt, edge cases, and why certain decisions were made.

26. **Check for ADRs or design docs.** Look for `docs/adr/`, `docs/architecture/`,
    `docs/decisions/`, or similar. Architecture Decision Records explain *why*
    things are the way they are. Even outdated ADRs are better than guessing.

27. **Check CI/CD.** Read `.github/workflows/`, `.gitlab-ci.yml`, or similar.
    Understand the pipeline: lint, test, build, deploy. What blocks a merge?

28. **Inspect runtime configuration.** Check `.env.example`, config files,
    `docker-compose.yml`, `Dockerfile`. Note required services (database,
    cache, queue) and environment variables. If Docker Compose exists, consider
    asking the user to run it — seeing the system live is 10x more informative
    than reading config files.

### Phase 7: Research Unknowns

29. **Look up unfamiliar technology.** For any framework, library, or tool
    encountered that is not immediately obvious, do a web search. Get the
    official docs landing page — not to read everything, but to understand
    its purpose, API surface, and relationship to the project stack.

### Phase 8: Persist Knowledge

30. **Save findings to lntrx-memory.** Use `lntrx_memory_learn` to persist:
    - Technology stack and versions (category: convention)
    - Architecture pattern and boundary diagram (category: decision)
    - Key conventions (category: convention)
    - Known gotchas and fragile modules from git analysis (category: bug)
    - Entry points and their end-to-end traces (category: note)
    - Unfamiliar dependencies and why they're used (category: note)

    This ensures other agents (and future sessions) start from your discoveries,
    not from zero.

## When to Stop Analyzing and Start Contributing

The investigation must eventually become action. You've reached the "good
enough" threshold when:

- You can explain a hot path end-to-end without reopening the IDE
- You're revisiting the same files without learning anything new
- You can already see where tests, guards, or a cleaner abstraction would
  reduce risk
- You have documented the conventions well enough to write a PR that won't
  be rejected on style grounds

At that point, open a branch and make the smallest deliberate move. Add a
test around a fragile path. Introduce a guardrail. Don't attempt a rewrite
— make one safe, reversible change and reassess.

## Summary Template

After all phases, present:

```
## Project: <name>
**Purpose:** <one-liner>
**Stack:** <language> + <framework> on <runtime>

### Architecture
- **Pattern:** <layered | hexagonal | event-driven | ...>
- **Topology:** <monolith | N services | serverless>
- **Data flow:** <request lifecycle in 5-7 steps>

### Boundary Diagram
<ASCII diagram showing system, databases, external APIs with protocols>

### Module Map
| Module | Owns | Depends on | Risk |
|---|---|---|---|
| <dir> | <entities> | <imports from> | <low|medium|high> |

### Key Dependencies
| Dependency | Version | Purpose | Why this one? |
|---|---|---|---|
| <name> | <ver> | <what> | <reason from research> |

### Critical Flow Trace
<entry-point> → <middleware/gate> → <service> → <repository> → <database>

### Fragile Areas (from git churn)
| File | Churn (6mo) | Pattern | Risk |
|---|---|---|---|
| <path> | <N changes> | hotfix | High |

### Conventions
- **Naming:** <style>
- **Testing:** <framework>, <run-command>
- **Formatting:** <tool> with <rules>

### Things to Know
- <gotcha from git log>
- <circular dependency to watch>
- <unfamiliar dependency worth learning>
- <area with technical debt>

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

- **Boundaries first, code second.** Phase 3 (system boundaries) exists
  before Phase 4 (code deep-dive) for a reason. Understanding what the system
  connects to makes the code 10x more comprehensible.
- **Read code, don't just list files.** Phase 4 is the core differentiator.
  Without reading actual source, the agent is blind.
- **Trace flows, don't just read files.** A single end-to-end request trace
  teaches more than reading 50 files in isolation. Connect them.
- **Git history reveals fragility.** Files that change often are files that
  break often. Prioritize understanding them.
- **Search the web for unknowns.** Don't guess what an unfamiliar library does.
  Look it up and cite your source.
- **If a CLAUDE.md is thorough,** keep phases 1-2 lighter and go deeper on
  phases 3-6 — CLAUDE.md usually doesn't cover code-level patterns.
- **When the project has no documentation,** invest more time in phases 3-5.
- **Never modify files during onboarding.** This is read-only analysis.
- **Always persist.** The summary is nice, but `lntrx_memory_learn` entries
  are what make future sessions productive. Save liberally.
- **Know when to stop.** If you can trace the hot paths and you're not learning
  anything new, switch to contributing. More analysis has diminishing returns.
