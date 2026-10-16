---
name: changelog
description: Write or update CHANGELOG.md from git history. Use for "write a changelog", "update CHANGELOG.md", "summarize recent changes".
---

# Changelog

1. `git log` since the last release tag.
2. Group into Added / Changed / Fixed / Removed; omit empty groups.
3. Describe each change for users, without technical jargon.
4. Update or create `CHANGELOG.md` with this heading:

```
## <version> (<YYYY-MM-DD>)

### Added
- ...
```
