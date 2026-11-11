# Plan: analyse the whole project, implement the safe improvements, record what was learned

Brief of 2026-10-15, sent to every registered project in one round, moved into the repository on
2026-11-11. The work has not started. Where the brief named vault files as targets, the targets are now in
this repository (see Design).

## Goal and non-goals

Goal, three outputs in this order of importance:

1. A ranked findings list: concrete improvements to this repository, each grounded in something that was
   actually read or run. The reader decides what gets built next and wants a shortlist that can be turned
   into plans, plus the small things already done.
2. A branch with the subset of those findings that is safe to implement now, one commit per improvement,
   at most six commits. If nothing qualifies, the branch carries no commits; that is a valid outcome.
3. The project knowledge updated with what a future agent needs and would otherwise get wrong.

Non-goals, they stay findings and are never commits: behaviour changes for package users beyond a bug fix
with its test, anything touching secrets, lock file updates, dependency upgrades, renames across the tree,
and anything that needs a gate that cannot run in a worktree (for example `pi install .`). No pushes and no
pull request without the requester.

## Current state

State on 2026-11-11 (`main` at the template migration):

- Two extensions (`lntrx-header` 90 lines, `lntrx-footer` 79 lines), fifteen skills, one theme,
  `agents/README.md`, an empty `prompts/`.
- No unit tests and no CI. Gates: `nix flake check -L` (git hooks, formatter, `checks.pi-manifest`,
  `checks.skills`) and the `pre_merge` commands in `.workmux.yaml`.
- Known problems are already listed in `docs/exec-plans/tech-debt-tracker.md`; findings must not repeat
  them without new evidence.

## Research

Read first: `AGENTS.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/design-docs/`, the tech debt tracker and
`CHANGELOG.md`. They carry decisions already taken. A proposal that contradicts a settled decision is noise;
an agent who thinks such a decision is wrong says that it knows it is a decision and argues against it.

pi behaviour (`ExtensionAPI`, `pi.on(...)`, `registerTool`, `registerCommand`, theme tokens, skill loading)
is checked against the pi documentation and the installed pi of the dev shell (`pi --help`, its bundled
docs), not recalled from memory. Cite the file or command for every claim.

## Design

Each finding carries, in this order:

1. Where: relative path and line number.
2. What is there now: the two or three lines that matter, quoted.
3. Why it is a problem, in terms of something real: a bug that can occur, a check that does not run, a rule
   enforced in one place and not the neighbouring one, a duplication that can disagree, something that
   breaks on growth, dead code (say how it was established that nothing reaches it).
4. What is proposed, concretely enough that somebody else can implement it without asking.
5. What it costs: one file, a handful, or "touches everything".
6. Status: `implemented on this branch (<sha>)` or `not implemented: <reason>`.

A finding that was not verified is worse than no finding: unverified suspicions go into a separate section
with what would settle each. No style findings that the formatter or linter already handle, and no general
"add more tests": name the untested behaviour and the file.

Where the outputs go:

- Findings: a section "Findings" appended to this plan (5 to 20 findings, ranked most valuable first, with
  one sentence on why the first is first), followed by "Unverified suspicions", "Not looked at" and the
  checks that ran with their result.
- Knowledge: short bullets in `AGENTS.md` "This project", longer material in `docs/`, open problems in the
  tech debt tracker. Only what is true, non-obvious, durable and something an agent would otherwise get
  wrong, with its evidence (a path or a command). Fewer than five new bullets is a success.

A change is allowed on the branch only when it is all of: small (a handful of files), verifiable with this
project's own checks in the worktree, and without effect on package users unless the checks prove the
effect is exactly the intended one. Typical: a broken or missing check, a dead file, a wrong or stale doc,
a missing check for existing behaviour, a bug fix with its check in the same commit.

## Files to touch

- This plan (findings sections).
- `AGENTS.md`, `docs/`, `docs/exec-plans/tech-debt-tracker.md` for knowledge.
- For implemented findings: only the files the finding names; one changelog fragment per user-facing fix.
- Never: `package-lock.json`, dependency fields of `package.json`, `flake.lock`.

## Steps

1. Read the documents listed under Research. Outcome: a list of settled decisions.
2. Read every file under `extensions/`, `skills/`, `themes/`, `agents/`, `package.json`, `.npmignore`,
   `README.md`. Outcome: candidate findings with locations.
3. Verify each candidate (run the command, read the pi source or docs). Outcome: findings with all six
   parts; the rest moved to "Unverified suspicions".
4. Implement the safe subset, one commit each, at most six. Outcome: every implemented finding has its
   commit and every commit names its finding.
5. Update the knowledge targets. Outcome: new bullets each name a path, command or identifier.
6. Run the checks. Outcome: green on the branch head, with the sha recorded.

## Verification

- The findings section holds 5 to 20 findings with all six parts, and every quote matches the base branch
  at the cited line.
- Every commit maps to exactly one finding marked implemented, and the other way round.
- `nix flake check -L` and the `pre_merge` commands of `.workmux.yaml` pass on the branch head; the report
  names the sha they ran on.
- No lock file, secret or dependency field changed: `git diff main --stat` lists none of them.
- `git status` is clean at the end.

## Risks and rollback

- A skill or extension change is live for the maintainer as soon as the main checkout switches to the
  branch. Keep changes on the branch in a worktree; revert per commit.
- Bounded commands only: never `find /`, bound long commands with `timeout`; do not crawl public sites.

## Progress log

- 2026-10-15: brief written, task ready, not dispatched.
- 2026-11-11: moved into the repository as an active plan during the template migration.

## Open questions

- None yet. The report (German) names the findings count, the implemented count, the commits, the checks
  with their result, whether a reviewer ran, what was added to the project knowledge, and the one finding
  the agent would act on first and why.
