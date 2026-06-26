---
name: merge-pr
description: Squash-merge a GitHub PR by number, placing the PR number to the right of the title. Removes the remote and local branch after merge. Use when the user asks to merge or land a PR, e.g. 'merge PR 81'. If no number is given, merges the PR for the current branch.
metadata:
  author: headfirst-msp
  version: "1.1.0"
---

# Merge PR

Squash-merges a GitHub PR by its number via `gh pr merge`, then deletes the
remote and local branch, and pulls the updated `main`.

## Usage

```
merge PR <N>
merge <N>
land <N>
```

Example: `merge PR 81`

If no number is given, the PR associated with the current branch is merged.

## Workflow

### 1. Merge by PR number (preferred)

Look up the PR details, merge, then clean up the local branch:

```bash
N=81  # the PR number from the user

PR_TITLE=$(gh pr view "$N" --json title --jq .title)
BRANCH=$(gh pr view "$N" --json headRefName --jq .headRefName)
echo "Merging PR #${N}: ${PR_TITLE} from branch ${BRANCH}"

gh pr merge "$N" --squash --delete-branch --subject "${PR_TITLE} (#${N})"

# Clean up local branch
git checkout main
git pull --ff-only
git branch -d "$BRANCH" 2>/dev/null || true
```

### 2. Merge PR of current branch (fallback)

```bash
BRANCH=$(git branch --show-current)
PR_NUM=$(gh pr view --json number --jq .number)
PR_TITLE=$(gh pr view --json title --jq .title)
echo "Merging PR #${PR_NUM}: ${PR_TITLE} from branch ${BRANCH}"

gh pr merge --squash --delete-branch --subject "${PR_TITLE} (#${PR_NUM})"

git checkout main
git pull --ff-only
git branch -d "$BRANCH"
```

## Notes

- Always squash-merge in this project (see CLAUDE.md).
- `--delete-branch` removes the remote branch; the local branch is deleted afterwards.
- `--subject` ensures the commit message has the PR number on the right of the title: `fix: something (#81)`.
- Never merge without explicit maintainer approval (CLAUDE.md rule).
