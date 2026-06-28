---
name: test
description: >-
  Write unit and integration tests for existing code. Use when the user asks
  to "add tests", "write tests for", "test this", or "increase coverage".
---

# Test Generation

Write tests for existing code following the project's test conventions.
Match the project's patterns exactly — a Jest `describe/it` project should
never get pytest-style tests.

## Process

1. **Read the source file** — understand inputs, outputs, side effects, error paths.
2. **Find existing tests** — read 2-3 test files to learn patterns:
   - Framework (Jest, pytest, go test, cargo test, etc.)
   - Structure (describe/it, test functions, table-driven, parameterized)
   - Assertion style (expect, assert, should)
   - Mock/fixture strategy (jest.mock, pytest fixtures, factory functions)
3. **Find the test command** — check `package.json` scripts, `Makefile`,
   `pyproject.toml`, or CI config.
4. **Write tests covering:**
   - **Happy path** — normal inputs produce expected outputs
   - **Edge cases** — empty input, null/undefined, boundary values, large inputs
   - **Error paths** — invalid input, missing dependencies, network failures
   - **State changes** — side effects, mutations, event emissions
5. **Run the tests** — execute the test command. If anything fails, fix it.
   Never commit broken tests.

## Test Structure (AAA Pattern)

```
Arrange   — set up data, mocks, fixtures
Act       — call the function/method under test
Assert    — verify the result
```

Every test should follow this pattern. If the three phases aren't clearly
visible, the test is too complex.

## Per-Framework Guidance

### Jest / Vitest (JavaScript/TypeScript)

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('UserService', () => {
  describe('createUser', () => {
    it('returns a user with an id on valid input', () => {
      // Arrange
      const service = new UserService(mockDb);
      // Act
      const user = service.createUser({ name: 'Alice' });
      // Assert
      expect(user).toHaveProperty('id');
      expect(user.name).toBe('Alice');
    });

    it('throws ValidationError when name is empty', () => {
      // Arrange
      const service = new UserService(mockDb);
      // Act & Assert
      expect(() => service.createUser({ name: '' })).toThrow(ValidationError);
    });
  });
});
```

### pytest (Python)

```python
import pytest

class TestUserService:
    def test_create_user_returns_user_with_id_on_valid_input(self):
        # Arrange
        service = UserService(mock_db)
        # Act
        user = service.create_user(name="Alice")
        # Assert
        assert user.id is not None
        assert user.name == "Alice"

    def test_create_user_raises_valueerror_when_name_empty(self):
        service = UserService(mock_db)
        with pytest.raises(ValueError):
            service.create_user(name="")
```

### Go (go test)

```go
func TestCreateUser(t *testing.T) {
    // Arrange
    service := NewUserService(mockDB)
    // Act
    user, err := service.CreateUser("Alice")
    // Assert
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if user.ID == "" {
        t.Error("expected user to have an ID")
    }
    if user.Name != "Alice" {
        t.Errorf("expected name Alice, got %s", user.Name)
    }
}

func TestCreateUser_EmptyName(t *testing.T) {
    service := NewUserService(mockDB)
    _, err := service.CreateUser("")
    if err == nil {
        t.Error("expected error for empty name, got nil")
    }
}
```

### Rust (cargo test)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_user_returns_user_with_id_on_valid_input() {
        // Arrange
        let service = UserService::new(mock_db());
        // Act
        let user = service.create_user("Alice").unwrap();
        // Assert
        assert!(user.id.is_some());
        assert_eq!(user.name, "Alice");
    }

    #[test]
    fn create_user_errors_on_empty_name() {
        let service = UserService::new(mock_db());
        let result = service.create_user("");
        assert!(result.is_err());
    }
}
```

## Mocking Rules

- **Mock at the boundary, not internally.** Mock the database, HTTP client,
  file system — not your own service classes.
- **Use the project's mocking library.** Don't introduce a new one.
- **One mock per test where possible.** Too many mocks = the code under test
  has too many dependencies.
- **Verify mock interactions sparingly.** Only verify calls that are
  essential to the behavior — not every internal call.
- **Prefer real dependencies for integration tests.** Test DB via Docker,
  in-memory SQLite, or test containers. Fake data beats mocked data.

## Rules

- **Match existing patterns exactly.** Same framework, same structure, same
  assertion style. A project with `describe/it` should never get `test()`.
- **One assertion concept per test.** "It creates a user" is one concept.
  "It creates a user AND sends a welcome email" is two — split it.
- **Test behavior, not implementation.** Test what the function returns and
  what side effects it has. Don't test that it called `console.log`.
- **Never commit broken tests.** Run the test command before finishing.
- **Coverage is a guideline, not a goal.** 100% coverage of trivial getters
  is noise. Missing coverage on error paths is a gap.
- **Name tests clearly.** `it("throws when email is invalid")` is better than
  `it("test 3")`. The test name is documentation.
