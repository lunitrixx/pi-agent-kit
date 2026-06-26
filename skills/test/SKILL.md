---
name: test
description: >-
  Write unit and integration tests for existing code. Use when the user asks
  to "add tests", "write tests for", "test this", or "increase coverage".
---

# Test Generation

Write tests for existing code following the project's test conventions.

## Process

1. Read the source file to understand what it does.
2. Check existing tests for patterns and conventions.
3. Find the test runner command.
4. **Delegate to the `build` agent:** `/parallel worker` with the task "Write tests for <file> covering happy path, edge cases, and error paths."
5. Verify the agent's output — run tests yourself to confirm.

## Rules

- Match existing test patterns (framework, naming, structure).
- One assertion concept per test.
- No mocking unless already established in the project.
- Test behavior, not implementation.
