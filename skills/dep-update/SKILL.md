---
name: dep-update
description: Check and update dependencies for any package manager. Use for "update dependencies", "upgrade packages", "check for outdated deps", "bump versions".
---

# Dependency update

Detect by manifest: npm `package.json`, yarn `yarn.lock`, pnpm `pnpm-lock.yaml`, bun `bun.lock`, composer `composer.json`, pip `requirements.txt`/`pyproject.toml`, cargo `Cargo.toml`, go `go.mod`. Use the manager's own outdated/update commands (`npm outdated`, `composer outdated`, `pip list --outdated`, `go list -u -m all`, ...).

1. List outdated packages, current vs latest.
2. Read changelogs of major updates for breaking changes.
3. Update one package at a time, run the tests, commit (conventional commit per update group). Repeat.
4. Optionally open a PR in team repos.
5. Summarize what was updated and why.

Skip breaking major versions unless approved. If tests fail, stop and report.
