---
name: refactor
description: >-
  Systematically refactor code without breaking anything. Use when the user
  asks to "refactor", "clean up", "simplify", or "improve this code".
---

# Refactoring

Systematic code improvement without changing behavior.

## Process

1. **Understand** — read the code and its callers.
2. **Test baseline** — run existing tests, ensure they pass.
3. **Plan with agent:** `/parallel planner` — "Plan refactoring for <file>:: avoid these patterns, apply these patterns."
4. **Execute with agent:** `/parallel worker` for each refactoring step.
5. **Verify** — run full test suite, check no warnings.

## Refactoring Catalog

- Extract function (long function → smaller ones)
- Rename (unclear name → clear name)
- Remove dead code (unreachable, unused)
- Simplify conditionals (nested if → guard clause)
- Replace magic numbers with constants
- Inline variable (used once, adds no clarity)
- Split large class/module

## Rules

- Never change behavior. If tests change, you're doing it wrong.
- One refactoring at a time. Commit between steps.
- Stop if tests break — fix before continuing.
