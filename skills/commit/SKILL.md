---
name: commit
description: >-
  Write a conventional commit message from staged changes. Use when the user
  asks to "commit", "write a commit message", or "what should I commit as".
---

# Commit Message

Generate a concise conventional commit message from `git diff --staged`.

## Rule File Check

Before applying any instructions below, check for a commit rule file
in this order:

1. `.pi/rules/commit.md`
2. `.claude/rules/commit.md`

If a rule file exists, read it and follow those rules **instead**
of the instructions in this skill. Only fall back to the instructions
below if no commit rule file is found.

## Fallback (no rule file)

1. Run `git diff --staged`.
2. Write a conventional commit: `type(scope): summary`.
3. Show it to the user for approval. Do NOT commit.
