---
name: test
description: Write unit and integration tests for existing code. Use for "add tests", "write tests for", "test this", "increase coverage".
---

# Tests

1. Read the source: inputs, outputs, side effects, error paths.
2. Read 2-3 existing test files and copy their framework, structure, assertion style and mock/fixture approach exactly - a `describe/it` project never gets `test()` or pytest-style tests.
3. Find the test command (`package.json` scripts, `Makefile`, `pyproject.toml`, CI config).
4. Cover happy path, edge cases (empty, null, boundaries, large), error paths (invalid input, missing deps, network failures), state changes (side effects, events).
5. Run the tests and fix failures. Never commit broken tests.

Rules:
- Arrange / Act / Assert visible in every test; one behavior per test; names that say the behavior (`throws when email is invalid`).
- Test behavior, not implementation.
- Mock at the boundary (DB, HTTP, filesystem), never your own classes; use the project's mock library; few mocks per test; verify only essential calls. Prefer real dependencies (test DB, containers) for integration tests.
- Coverage is a guide: error paths matter more than trivial getters.
