---
name: changelog
description: Write or update CHANGELOG.md from git history. Use for "write a changelog", "update CHANGELOG.md", "summarize recent changes".
---

# Changelog

1. `git log` since the last release tag.
2. Group into Added / Changed / Fixed / Removed; omit empty groups.
3. Describe each change for users, without technical jargon.
4. Update or create `CHANGELOG.md`. Entries go under the heading of the day of the change, newest on top; reuse the heading if that day already has one, never `## Unreleased`. A release is `## X.Y.Z - YYYY-MM-DD`.

```
## YYYY-MM-DD

### Added
- ...
```
