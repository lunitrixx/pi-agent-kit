# Plan: what pi-agent-kit becomes now that pi has an RPC layer

Written 2026-09-20 against pi-coding-agent 0.85.1, workmux 0.1.262 and pi-agent-kit 0.4.0. Moved into the
repository from the agent vault on 2026-11-11 and shortened: measurements, decisions, rejected alternatives
and test design are kept; machine paths and dispatch details are removed. The decision is recorded in
`docs/design-docs/0002-kit-stays-an-extension-package.md`.

## Goal and non-goals

Goal: answer with an argument whether pi-agent-kit becomes the orchestration layer for the agent fleet or
stays a package of extensions, and decide for every extension whether it is kept, merged or dropped.

Non-goals: no code and no commits; converting the `coordinator` skill into a deterministic loop (belongs to
workmux or the orchestrator repository); patching workmux; Claude Code agents, which no pi package reaches;
cost and budget controls.

## Current state

Measured on 2026-09-20:

- The kit had twelve extensions (5,382 lines of TypeScript plus 67 lines in `lib/config.ts`), fifteen
  skills, one theme, an `agents/` directory holding only a README and a `prompts/` directory holding only
  a `.gitkeep`. `git log --all -- agents/` showed one commit, the initial release.
- The installed checkout of the kit ran a branch that deregistered `lntrx-permit` and
  `lntrx-subagent-audit`, because `lntrx-permit` answered permission hooks itself, read no environment
  variable (so `PI_PERMISSION_LEVEL=bypassed` was ignored) and opened `ctx.ui.select` without a timeout.
  It had stopped two unattended agents on 2026-09-08, one of them on the compound command
  `git remote -v; git branch -a; git log`.
- One workmux coder profile, `coder-qwen`, was a pi agent and loaded the kit; the others were Claude Code.
- The existing test suite: eleven files, 234 assertions, run with `tsx`, all green; no CI, the
  `pre_merge` commands in `.workmux.yaml` were the only gate.

## Research

- `pi-server` and `pi-client` 0.85.1 (installed package): `main: ./dist/index.js`, no `bin`. No
  `child_process` import, no daemon loop, no session persistence, no supervision; the embedder supplies
  sessions through `ServerHost.openSession`. Crash recovery is limited to removing a stale socket;
  `pi-client` "never reconnects or replays requests automatically". Discovery exists for local unix
  sockets only. Size: 1,311 and 915 lines of built JavaScript. Public write-ups of a `pi-server serve`
  daemon with SQLite sessions do not match this version.
- `pi --mode rpc` (pi `docs/rpc.md`, 1,618 lines): a documented JSONL protocol over stdio. `agent_settled`
  is an exact completion signal; blocking dialogs appear as `extension_ui_request` and wait for an
  `extension_ui_response`; sessions resume with `pi --session <id>`. `setHeader()`, `setFooter()` and
  related TUI calls are no-ops in RPC mode, `custom()` returns `undefined`. Node `readline` is not
  protocol compliant because it splits on U+2028 and U+2029.
- `pi-subagents` 0.68.0 already spawns child agents as detached, unref'd processes and reconciles them
  from disk after the parent dies. It throws on an unknown subagent model before launch and turns a
  non-zero exit into a tool error; failures of detached runs arrive only as display notifications.
- workmux keys its agent records by tmux pane id and a `boot_id` that embeds the tmux server pid, so a new
  tmux server invalidates every record (verified). A pi agent at a prompt reports `working`, never
  `waiting`.
- pi package docs: the resource kinds are extensions, skills, prompts and themes. There is no `agents` kind.

Rejected alternatives:

- Build a supervisor on `pi-server`: an experimental API without docs, and everything supervisor-shaped
  would have to be written.
- Build a supervisor on `pi --mode rpc` (900 to 1,100 lines estimated: transport, spawn and lifecycle,
  state store, addressing, CLI, recovery): the pi half already exists in `pi-subagents`, the workmux gap is
  narrow, the cost is five times the targeted fix, and it covers pi agents only.
- Keep the kit unchanged: two extensions were deregistered, three were inert headless, one consisted only
  of blocking dialogs, and one was largely superseded by `pi-subagents`.

## Design

Recommendation: the kit stays a package of extensions and does not grow a supervisor. Proposed order:

- P0: give `lntrx-permit` an environment bypass and a timeout (default deny) on every dialog, then
  re-register it and `lntrx-subagent-audit`.
- P1: shrink the kit (table below).
- P2: one small extension `lntrx-fleet` that writes a status record per worktree from inside pi
  (`working`, `waiting` on `ui_prompt_start`, `idle` on `agent_settled`), keyed by the worktree path and
  written atomically; liveness is derived by the reader with `kill -0`, never stored.
- Delete `agents/` and `prompts/`, move the subagent reference into `README.md`.

Extension decisions:

| Extension | Decision | Reason |
| :--- | :--- | :--- |
| `lntrx-header` | keep | Cheap, the model for a new extension; inert in RPC mode |
| `lntrx-footer` | keep, interactive only | Inert in RPC mode; its token arithmetic was reported wrong |
| `lntrx-lang` | keep | Sets the response language from inside the agent |
| `lntrx-grill-me` | keep | No installed package offers the interview flow |
| `lntrx-githooks` | keep | Works at the filesystem level for every agent and manual commits |
| `lntrx-health` | keep | Reports the codebase, not the context index |
| `lntrx-localmodels` | drop | Only blocking dialogs and `custom()`; pi's `models.json` covers it |
| `lntrx-memory` | keep | Persists asserted facts; not overlapping with document indexing |
| `lntrx-permit` | keep after P0 | Covers path, external directory, cross-surface and redaction rules other packages lack |
| `lntrx-postwrite` | keep | The only formatter, format before diagnose |
| `lntrx-project-rules` | keep | Nothing else read `.pi/rules/` |
| `lntrx-subagent-audit` | merge down to the sweep | Preflight and gate are covered by `pi-subagents` 0.68.0; the sweep of detached runs is not |

## Files to touch

None in this plan; it is a decision document. Follow-up work would have touched `extensions/lntrx-permit/`,
`extensions/lntrx-subagent-audit/`, a new `extensions/lntrx-fleet/`, `package.json`, `README.md`,
`AGENTS.md`, `agents/` and `prompts/`.

## Steps

1. Stage 1: permit bypass and dialog timeouts, merged but not registered.
2. Stage 2: re-register permit and subagent audit, watch one dispatched pi agent on a real task.
3. Stage 3: drop `lntrx-localmodels`, `agents/` and `prompts/`; merge down the subagent audit.
4. Stage 4: add `lntrx-fleet`, compare its records with workmux for a week.
5. Stage 5: decide about the `coordinator` skill in the orchestrator or workmux repository.

## Verification

Every proposed test names the change that makes it fail; a check that has never been made to fail is not a
check. Exact comparisons, not substring matches.

- Permit: with `PI_PERMISSION_LEVEL=bypassed` (any case) the decision is exactly `allow`; an unknown value
  does not bypass; every dialog call passes a numeric `timeout`; a timed out dialog resolves to exactly
  `deny`. Integration gate in two runs: without the bypass the compound command above raises a dialog,
  with it the count of dialogs is exactly 0. The first run proves the second is not passing because permit
  is absent.
- Subagent audit sweep: finds a failed detached run of this session, ignores earlier sessions, delivers a
  follow-up that triggers a turn, does not report a run the gate already raised. Two tests against
  `pi-subagents` prove the dropped guards stay covered.
- `lntrx-fleet`: key derived from the path only; same handle in two projects gives two records; an
  interrupted write keeps the previous record; every prompt kind sets `waiting`; `agent_settled`, not
  `agent_end`, sets `idle`. Survival scripts for a tmux server restart, a reboot, a killed agent and two
  agents with one handle.
- Deletions: the manifest check fails on a stale path; a manifest test asserts the `pi` keys are exactly
  `extensions`, `skills`, `themes`.

## Risks and rollback

- Re-registering `lntrx-permit` could hang unattended agents again; hence the watched single-agent trial.
  Revert is one line in `package.json`.
- Every stage is a `git revert` plus a new session; no data or file format is migrated.

## Progress log

- 2026-09-20: plan written and delivered.
- 2026-09-25: the direction went further than Stage 3. The package was reduced to `lntrx-header` and
  `lntrx-footer`; the sources of the other ten extensions, `lib/config.ts`, the tests and `.pi/rules/` were
  removed in #34 and #35, because durable agent conventions had moved into the global system prompt and
  cross-session memory was covered by the `context-mode` package (see `CHANGELOG.md`). P0, P2 and the `lntrx-fleet` extension were not built.
- 2026-11-11: moved into the repository. `agents/` and `prompts/` still exist; tracked in
  `docs/exec-plans/tech-debt-tracker.md`.

## Open questions

- Whether `agents/` and `prompts/` are deleted as decided here. Maintainer.
