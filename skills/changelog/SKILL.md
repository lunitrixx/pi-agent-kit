---
name: changelog
description: >-
  Write or update a changelog from git history. Use when the user asks to
  "write a changelog", "update CHANGELOG.md", or "summarize recent changes".
---

# Changelog

Generate a user-facing changelog entry from recent git history.

## Format

```
## <version> (<YYYY-MM-DD>)

### Added
- <new features>

### Changed
- <behavior changes>

### Fixed
- <bug fixes>
```

## Process

1. Run `git log` since the last release/tag.
2. Group changes by type (Added, Changed, Fixed).
3. Write user-facing descriptions — no technical jargon.
4. Update or create `CHANGELOG.md`.
