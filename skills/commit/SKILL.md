---
name: commit
description: >-
  Write a conventional commit message from staged changes. Use when the user
  asks to "commit", "write a commit message", or "what should I commit as".
---

# Commit Message

Generate a concise conventional commit message from `git diff --staged`.

1. Run `git diff --staged`.
2. Write a conventional commit: `type(scope): summary`.
3. Show it to the user for approval. Do NOT commit.
