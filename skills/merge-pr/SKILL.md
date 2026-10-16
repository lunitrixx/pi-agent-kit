---
name: merge-pr
description: Squash-merge a GitHub PR as "<title> (#N)" and delete its branches. Use for "merge PR 81", "land 81"; without a number, merges the current branch's PR.
metadata:
  author: headfirst-msp
  version: "1.2.0"
---

# Merge PR

Only with explicit maintainer approval. GitHub only (`gh`).

```bash
N=81   # omit the number in all gh calls to use the current branch's PR
TITLE=$(gh pr view $N --json title --jq .title)
BRANCH=$(gh pr view $N --json headRefName --jq .headRefName)
NUM=$(gh pr view $N --json number --jq .number)
gh pr merge $N --squash --delete-branch --subject "${TITLE} (#${NUM})"
git checkout main && git pull --ff-only
git branch -d "$BRANCH" 2>/dev/null || true
```
