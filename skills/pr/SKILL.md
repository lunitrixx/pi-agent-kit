---
name: pr
description: Write a pull request description from the branch's changes. Use for "write a PR", "create a pull request description", "prepare PR".
---

# PR description

1. `git log main..HEAD --oneline` and `git diff main..HEAD --stat`; read the diff for new env vars, config changes, breaking API changes.
2. Run the test command if there is one; paste command and output.
3. Show the description. **Do NOT open the PR.** Never self-approve or merge (that is `merge-pr`).

```markdown
## Summary
<one sentence: what problem this solves>

## Changes
- <one bullet per logical change, WHAT not how>

## Testing
- <exact commands + output; "tested locally" is not evidence>

## Notes
- [ ] No breaking changes
- [ ] Documentation updated
<breaking changes, migrations, new env vars, deploy order>

## Issue References
Closes #N   (one per line)
```

One PR, one purpose: if refactoring and a feature are mixed, or the diff exceeds ~400 lines, propose a split. Do not paste commit messages as the description. Do not force-push once review has started.
