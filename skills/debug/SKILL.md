---
name: debug
description: Systematic debugging. Use when the user reports a bug or error, "this doesn't work", "why does this fail", "something is broken".
---

# Debug

1. **Reproduce** reliably.
2. **Isolate** to file, function, line. Read the full error and stack trace; check `git log` for recent changes there.
3. **Search known issues** in the project's vault ledger and `stack-knowledge/`.
4. **Plan, then fix** - delegate via the `subagent` tool (`worker`) for larger fixes.
5. **Verify** the fix and add a regression test.

One fix at a time, no shotgun changes. After 3 failed attempts, report what you tried and ask.
