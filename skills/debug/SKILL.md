---
name: debug
description: >-
  Systematic debugging workflow. Use when the user reports a bug, an error,
  "this doesn't work", "why does this fail", or "something is broken".
---

# Debugging

Systematically find and fix bugs.

## Process

1. **Reproduce** — can you trigger the bug reliably?
2. **Isolate** — narrow to file, function, line.
3. **Search memory** — check lntrx-memory buglog for known issues.
4. **Plan the fix:** `/parallel planner` — "Fix <bug description> in <file>."
5. **Execute:** `/parallel worker` to implement the fix.
6. **Verify** — does it work? Add regression test.

## Rules

- Read error messages carefully — the answer is often in the stack trace.
- Check git log for recent changes to the failing area.
- Search lntrx-memory (buglog) for known issues.
- One fix at a time. Don't shotgun-debug.
- If stuck after 3 attempts, explain what you've tried and ask for guidance.
