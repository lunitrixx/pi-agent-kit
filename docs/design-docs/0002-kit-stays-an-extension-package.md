# 0002: The kit stays an extension package, not an orchestration layer

- Status: accepted
- Date: 2026-09-20

## Context

pi 0.85.1 ships `@earendil-works/pi-server` and `pi-client`, and the question was whether pi-agent-kit should
grow into the supervisor that starts and tracks agents across worktrees, replacing workmux. The full analysis
is in [the completed plan](../exec-plans/completed/2026-09-19-what-the-agent-kit-becomes.md).

## Decision

pi-agent-kit stays a package of pi extensions, skills and a theme. It does not build a supervisor. Worktree
creation, teardown, dispatch and the `pre_merge` gates stay with workmux.

## Rejected alternatives

- A supervisor on `pi-server`: in 0.85.1 it is a library (no `bin`, no process spawning, no persistence, no
  lifecycle); the embedder supplies the sessions.
- A supervisor on `pi --mode rpc` (estimated 900 to 1,100 lines of TypeScript): `pi-subagents` 0.68.0 already
  spawns detached `pi` processes and reconciles them from disk, the gaps in workmux are narrow (state keyed by
  tmux pane and server pid, no `waiting` state for pi), and it would cover pi agents only, not Claude Code.

## Consequences

- No orchestration code in this repository. Turning the `coordinator` skill into a deterministic loop belongs
  to workmux or the orchestrator repository.
- The conclusion is re-opened if `pi-subagents` drops detached background runs, or if `pi-server` grows a
  `bin` and a reference host.
