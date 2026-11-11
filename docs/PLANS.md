# Plans

Work that spans several steps gets a plan before implementation. A plan is the
record that lets another agent or a reviewer continue the work without asking.

## Where plans live

- Active plans: `docs/exec-plans/active/<YYYY-MM-DD>-<topic>.md`. The date is the day the plan was written.
- Finished plans: move the file unchanged to `docs/exec-plans/completed/`.
- Both directories are kept in Git with a `.gitkeep` file.

## Required sections

1. **Goal and non-goals.** One paragraph for the goal. List what is explicitly out of scope.
2. **Current state.** What exists today, with measured facts, the date of the measurement and the source.
3. **Research.** Sources consulted, with versions taken from the lock files and manifests. Official documentation first. Cite the URLs. Name the rejected alternatives and why they were rejected.
4. **Design.** Components, interfaces, data flow and the decisions taken. Constraints from `docs/ARCHITECTURE.md` and `docs/SECURITY.md` are stated explicitly. A decision that outlives the plan is recorded in `docs/design-docs/` as a short record.
5. **Files to touch.** Every path, and what changes in it.
6. **Steps.** Ordered. Each step ends with a checkable outcome.
7. **Verification.** Exact commands, expected results, tests and acceptance criteria.
8. **Risks and rollback.** What can break, how it is detected and how it is reverted.
9. **Progress log.** Dated entries. Update it while working, not only at the end.
10. **Open questions.** Each with the person who has to answer it.

## Quality bar

- Detailed enough that an agent who has not seen the conversation can execute it.
- Architecturally sound: the plan names the trade-offs and why the chosen option wins.
- Well researched: every version, API and flag is checked against the project or the official documentation, not recalled from memory.
- Plain, factual prose. No marketing wording and no filler.

## Form

A plan starts with its goal. It does not open with a role statement such as
"You are an expert in ...". The same applies to skills. Such a line adds no
information and costs context on every read.
