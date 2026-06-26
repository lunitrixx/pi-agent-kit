---
name: pr
description: >-
  Write a pull request description from branch changes. Use when the user
  asks to "write a PR", "create a pull request description", or "prepare PR".
---

# Pull Request

Generate a PR description from the branch's changes vs its base.

## Format

```
## Summary
One sentence what this PR does.

## Changes
- bullet list of key changes

## Testing
How to verify this works. Exact commands.
```

## Process

1. Run `git log main..HEAD --oneline` to see commits.
2. Run `git diff main..HEAD --stat` to see changed files.
3. Write the PR description.
4. Show it to the user. Do NOT open the PR.
