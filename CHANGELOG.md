# Changelog

## Unreleased

### Added

- lntrx-subagent-audit: a failed subagent is no longer indistinguishable from a
  successful one. On 2026-08-10 four of fifteen reviewer runs died - three of
  them in under two seconds on `No API key found for anthropic` - and every
  calling agent reported success anyway. The extension closes each step of that:
  - **Preflight.** A `model` argument like `anthropic/claude-sonnet-4` is an
    OpenRouter model id, but its leading segment reads as a provider, and the
    child was launched against a provider with no credentials. The registry can
    tell the two apart, so the reference is rewritten to canonical
    `provider/id`. A model no configured provider can reach blocks the call with
    a reason naming what to use instead, instead of spending a run on it.
  - **Result gate.** The `subagent` tool reports a dead run in its text and
    still returns `isError: false`. Such a result now comes back as a tool error
    headed "SUBAGENT RUN FAILED - THIS TOOL CALL DID NOT PRODUCE A RESULT".
  - **Detached sweep.** Three of the four runs were detached, and their failure
    arrived as a display-only notice the caller had no obligation to read. New
    failures in `run-history.jsonl` are now delivered as a follow-up turn.
  - **`~/.pi/agent/subagent-audit.jsonl`** and `/subagent-audit`. `run-history`
    records `status: "error"` and nothing else; the audit carries the model
    asked for, the model tried, the exit code and the error text.
  - No retries: the cause was a misconfiguration, and retrying would have hidden
    it four times over.

### Fixed

- lntrx-githooks no longer crashes at session start in a git worktree. `.git` is
  a file there, so `<repo>/.git/hooks/pre-commit` is not a path, and the
  resulting `ENOTDIR` took the whole `session_start` handler down - printing an
  "Extension error" line in every worktree agent, including inside the reviewer
  subagents that failed on 2026-08-10. Hook paths now come from
  `git rev-parse --git-path`, which also respects `core.hooksPath`.

## 0.4.0 - 2026-08-08

### Added

- lntrx-permit: new permission system with shell tokenizer, 4 permission surfaces
  (path, external_directory, tool, bash), most-restrictive-wins evaluation, and
  fail-closed defaults. Replaces lntrx-guard's regex-based approach.
  - Shell tokenizer normalizes short flags to long form (rm -rf → rm --recursive --force)
  - Path surface blocks reads AND writes (cat .env is now caught)
  - --yolo CLI flag for bypassing all checks during trusted sessions
  - Session approvals: grant once or for the duration of the session
  - Secret redaction on tool_results instead of write blocking
  - /permit migrate: converts old lntrx-guard.risks.* keys to bash rules
- lntrx-githooks: git hook management extracted from lntrx-guard (filesystem-level,
  works for manual commits too). /githooks command replaces /guard-hook.
- lntrx-postwrite: merged lntrx-fmt + lntrx-lsp. Formats, then diagnoses on both write and edit.
- `/memory prune [--dry-run]` — removes corrections older than 90 days and closed
  bugs older than 30 days. Dry-run mode shows what would be removed.
- Automatic memory aging: stale corrections and closed bugs pruned on `session_start`.
- Secret redaction in memory: `save()` and `saveBug()` strip known secret patterns
  before writing to the database.
- Memory flush hooks: WAL checkpoint on `session_before_compact` and `session_shutdown`.
- Optional review loop: `lntrx-memory.reviewInterval` for periodic `/memory scan` nudges.

### Changed

- Replaced lntrx-guard with lntrx-permit + lntrx-githooks
- /safety command removed (use /permit status)
- /guard-hook command removed (use /githooks)
- lntrx-memory defaults to `memoryMode: "policy"` — auto-injected search results
  disabled, reducing first-turn token overhead by ~90%. Set to `"inject"` for old behavior.
- Correction detection no longer blindly creates bugs. Only error-like patterns
  trigger a bug entry. "Auto-detected - needs review" placeholder removed.
- Configuration library moved from `extensions/lntrx-config/` to `lib/config.ts` (no longer an extension)
- `/health` now uses `scanAnatomy()` (respects `.gitignore`) and includes model info, context window, and session cost
- Removed `/health` deps section (use `dep-update` skill instead)

### Removed

- lntrx-guard extension (replaced by lntrx-permit + lntrx-githooks)
- lntrx-config extension (became `lib/config.ts`, web-search auto-provisioning dropped)
- lntrx-context extension (`/ctx` removed; model+window+cost moved to `/health`)
- lntrx-fmt extension (merged into `lntrx-postwrite`)
- lntrx-lsp extension (merged into `lntrx-postwrite`)

## 0.3.0 - 2026-06-28

### Added

- `/memory list [N]` (alias `ls`, `recent`) shows recent entries with IDs
- `/memory forget all` deletes all entries for current project (`forget all bug` for bugs)
- Anatomy scanner respects `.scanignore` (priority) or `.gitignore` (fallback) patterns

### Changed

- Memory extension split into 6 modules: `db`, `scanner`, `text`, `tools`, `commands`, `extension` (max 272 lines, was 1132)

### Fixed

- SQLite WAL now truncated after every write via `PRAGMA wal_checkpoint(TRUNCATE)`, preventing persistent `.db-shm`/`.db-wal` files
- Scanner skips SQLite WAL/SHM artifacts (`.db-shm`, `.db-wal`, `.db-wal2`)

## 0.2.0 - 2026-06-28

### Added

- Central config extension with project-scoped `getProject`/`setProject`
- Guard: 4 new risk patterns (SOPS wildcard, curl|bash, git push --delete, npm publish)
- Per-risk guard enable/disable via `/safety risk` subcommand (global + project)
- Memory extension rewritten with SQLite+FTS5 backend (anatomy scanner, bug tracking, `<remember>` auto-capture)
- `lntrx_memory_bug` and `lntrx_memory_forget` tools
- `/memory bug add|fix|close|delete` commands
- Auto-anatomy scan on session start (stale after 24h)
- Correction detection: auto-saves bugs when user corrects assistant
- Versioning skill and Keep a Changelog formatting
- `.npmignore` to prevent project-local agent state from being published
- Project skill under `.pi/skills/config-architecture/`
- Test suites: 17 config API tests + 26 extension logic tests + 25 memory tests

### Changed

- Renamed `initialize-project` skill to `pi-project-setup` (unified greenfield + brownfield)
- Overhauled `pr`, `readme`, and `test` skills with best-practice templates and patterns
- Removed `scratchpad` skill (replaced by lntrx-memory)
- Renamed `version` skill to `version-management`
- Guard: project config now has priority over global (project > global > default)
- Guard: `/safety on|off` supports `--global` flag, defaults to project scope
- Lang: `/lang` supports `--global` flag, project language overrides global
- Rules: banner visibility is per-project via `/rules-toggle [--global]`
- Rules: injected block header now says "mandatory" instead of informational paths
- Config file moved from extensions to root `tests/` directory

### Fixed

- YAML colon in skill description broke parser
- Em dash replaced with plain hyphen in `.npmignore`

### Removed

- Memory: daily log and scratchpad (replaced by SQLite backend)

---

## 0.1.0 - 2026-06-26

### Added

- 13 Pi extensions: config, context, fmt, footer, grill-me, guard, header, health, lang, localmodels, lsp, memory, project-rules
- 15 auto-detect skills: grill-me, merge-pr, project-onboarding, scratchpad, commit, changelog, pr, debug, refactor, test, readme, docs-gen, dep-update, extend-pi, initialize-project
- 5 subagents: reviewer, planner, scout, worker, oracle (via pi-subagents)
- lunitrixx theme: dark amber with nerd font symbols
- Cross-session memory system (lntrx-memory) with cerebrum, anatomy, buglog, daily log, scratchpad
- Socratic planning extension (lntrx-grill-me) with 3-phase model
- Project rules injection (lntrx-project-rules) from .pi/rules/ and .claude/rules/
- Git guard (lntrx-guard): secret scanning, dangerous command confirmation, git hook management
- Pre-commit hook auto-install blocking direct commits to main (/guard-hook)
- Per-project and global hook config via .pi/pi-agent-kit.json
- Response language switching (/lang de|en)
- Auto-provisioned web-search config
- Bundled pi-web-access + pi-mcp-adapter + pi-subagents
