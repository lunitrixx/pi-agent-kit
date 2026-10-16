---
name: version-management
description: Bump the version, write changelog entries and create git tags (Keep a Changelog + SemVer).
---

# Version

- SemVer. Pre-1.0: MINOR for substantial work, PATCH for fixes. 1.0+: MAJOR breaking, MINOR feature, PATCH fix.
- Keep a Changelog 1.1.0 sections: Added, Changed, Deprecated, Removed, Fixed, Security. Entries sit under a `## YYYY-MM-DD` heading per day, newest on top; never `## Unreleased`.
- Tags `vX.Y.Z`, annotated: `git tag -a vX.Y.Z -m "vX.Y.Z"`. Dates ISO-8601.

## Bump

1. Read `CHANGELOG.md` and `package.json`; pick major/minor/patch from changes since the last release.
2. Insert `## X.Y.Z - YYYY-MM-DD` above the day headings since the last release, or turn today's `## YYYY-MM-DD` heading into it.
3. Update the `package.json` version.
4. Commit `chore(release): bump to vX.Y.Z`, then tag.

## Changelog from commits

`git log <last-tag>..HEAD --oneline --no-merges`; map feat -> Added, fix -> Fixed, refactor/chore/test -> Changed, `!` or `BREAKING CHANGE:` -> Changed with a breaking note. Past tense, user-facing, curated - not every commit.
