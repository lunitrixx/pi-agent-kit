---
name: version-management
description: "Bump version, write changelog entries, and create git tags following Keep a Changelog + SemVer"
---

# Version

Manage semantic versioning and changelogs for this project.

## Rules

- **SemVer**: `MAJOR.MINOR.PATCH` (https://semver.org).
- **Pre-1.0**: Everything is allowed. Bump MINOR for substantial work, PATCH for fixes.
- **1.0+**: MAJOR = breaking API, MINOR = new feature (backward compat), PATCH = fixes.
- **Changelog**: Keep a Changelog format (https://keepachangelog.com/en/1.1.0/).
- **Tags**: `v0.2.0` format. Annotated: `git tag -a v0.2.0 -m "v0.2.0"`.
- **Dates**: ISO-8601 (`2026-06-28`).

## Changelog Sections

- `## Unreleased` — pending changes (top of file, replaced on version bump)
- `Added` — new features
- `Changed` — changes in existing functionality
- `Deprecated` — soon-to-be removed features
- `Removed` — removed features
- `Fixed` — bug fixes
- `Security` — vulnerability fixes

## Workflow

### Bump version

1. Read `CHANGELOG.md` and `package.json`.
2. Determine bump type (major/minor/patch) from changes since last release.
3. If a `## Unreleased` section exists, replace `## Unreleased` with `## <version> (<YYYY-MM-DD>)`. If not, insert the new version heading above the topmost release.
4. Add a fresh empty `## Unreleased` section above the new version.
5. Update `package.json` version.
6. Commit: `chore(release): bump to vX.Y.Z`.
7. Tag with annotation.

### Write changelog from commits

1. Run `git log <last-tag>..HEAD --oneline --no-merges`.
2. Group commits by conventional commit type:
   - `feat` → `Added`
   - `fix` → `Fixed`
   - `refactor`, `chore`, `test` → `Changed`
   - `BREAKING CHANGE:` footer or `!` after type → `Changed` + breaking note
3. Write entries in past tense, user-facing language.
4. Do NOT list every commit - curate notable changes.

## Example

```markdown
## [0.2.0] - 2026-06-28

### Added
- Config extension with project-scoped getProject/setProject
- Per-risk guard enable/disable with /safety risk subcommand
- Memory extension rewritten with SQLite+FTS5 backend
- Project anatomy scanner with auto-scan on session start
- Structured bug tracking (symptoms, solutions, states)

### Changed
- Guard: project config now has priority over global
- Lang: supports per-project language override
- Rules: banner visibility is now per-project
- Rules block header: mandatory wording instead of informational

### Fixed
- YAML colon in skill description broke parser
- Em dash replaced with plain hyphen in .npmignore
```
