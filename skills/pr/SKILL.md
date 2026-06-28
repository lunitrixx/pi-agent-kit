---
name: pr
description: >-
  Write a pull request description from branch changes. Use when the user
  asks to "write a PR", "create a pull request description", or "prepare PR".
---

# Pull Request

Generate a structured PR description that gives reviewers everything they
need to approve quickly — context, changes, testing evidence, and deployment
notes. Never open the PR without explicit confirmation.

## Format

```markdown
## Summary
<!-- One sentence what this PR does and why. -->

## Changes
<!-- Bullet list of WHAT changed. Focus on what, not how (code shows how). -->

-

-

## Testing
<!-- How was this verified? Exact commands, screenshots, test output. -->

-

## Notes
<!-- Breaking changes? Migration steps? New env vars? -->

- [ ] No breaking changes
- [ ] Documentation updated

## Issue References
<!-- Closes #000 / Related to #000 -->
```

## Process

1. Run `git log main..HEAD --oneline` to see commits.
2. Run `git diff main..HEAD --stat` to see changed files.
3. Group changes into a bullet list — one bullet per logical change, not per file.
4. Read the diff for any new env vars, config changes, or breaking API changes.
5. Test the change if a test command exists — include the output in `## Testing`.
6. Show the description to the user. **Do NOT open the PR.**

## Rules

- **Summary sells the PR.** One sentence. What problem does this solve?
- **Changes are WHAT, not HOW.** "Add rate limiting middleware" not "Create RateLimiter class in src/middleware/". The code shows HOW.
- **Testing proves it works.** Paste command + output. "I tested locally" is worthless.
- **Notes flags risk.** Breaking changes, new env vars, migration steps, deployment order. If nothing special, keep the checklist.
- **One PR, one purpose.** If the diff mixes refactoring with a feature, split it first.
- **Issue references use closing keywords.** `Closes #42`, `Resolves #101`, `Fixes #7`. Each on its own line. GitHub auto-closes on merge.
- **Keep it under 400 lines of diff.** PRs over 400 lines get reviewed 2x slower and have 50% more defects. Split if larger.
- **Never self-approve or merge without confirmation.** The `merge-pr` skill handles merge.

## Anti-Patterns (do not do this)

| Don't | Why |
|---|---|
| "Fixed some bugs and added a feature" | No context. Reviewer has to reverse-engineer intent. |
| Empty description, only title | Reviewer has no idea what to expect. |
| Copy-pasting all commit messages | Commits are implementation detail. PR is the big picture. |
| Mixing refactoring + feature in one PR | Reviewer can't separate concerns. Split into two. |
| "Works on my machine" | Not evidence. Show test commands + output. |
| Force-pushing during active review | Orphans comments, confuses reviewers. Only before review starts. |
