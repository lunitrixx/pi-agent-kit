---
name: refactor
description: Refactor code without changing behavior. Use for "refactor", "clean up", "simplify", "improve this code".
---

# Refactor

1. Read the code and its callers.
2. Run the existing tests; they must pass before you start.
3. Plan the steps, then execute them one at a time (larger steps via the `subagent` tool, `worker`).
4. Run the full suite after each step and commit between steps; check for new warnings.

Typical moves: extract function, rename, remove dead code, guard clauses instead of nested ifs, named constants for magic numbers, inline single-use variables, split large modules.

Never change behavior - if a test has to change, you are doing it wrong. Stop and fix as soon as a test breaks.
