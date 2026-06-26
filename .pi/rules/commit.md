# Commit Rules

_Mandatory - additions allowed, removal or weakening is not._

## Format

```
type(scope): present-tense summary

Why this change, not what (code shows what).
```

## Rules

- Type: feat, fix, chore, docs, refactor, test, perf
- Scope: optional, lowercase, the affected module/component
- Summary: max 72 chars, imperative mood ("add" not "added")
- Body: explain motivation, not implementation
- Skip body if summary is self-explanatory
- ONE commit message per change - no bullet lists of unrelated changes

## Process

1. Run `git diff --staged` to see what changed.
2. Stage all changes with `git add` if nothing is staged.
3. Write ONE commit message and commit directly.
