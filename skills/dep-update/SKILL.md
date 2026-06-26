---
name: dep-update
description: >-
  Check and update project dependencies across any package manager.
  Use when the user asks to "update dependencies", "upgrade packages",
  "check for outdated deps", or "bump versions".
---

# Dependency Updater

Updates project dependencies safely, across any package ecosystem.

## Supported Package Managers

| Manager | Detect by | Update command | Changelog |
|---------|-----------|----------------|-----------|
| npm | `package.json` | `npm outdated` / `npm update` | `npm view <pkg>` |
| yarn | `yarn.lock` | `yarn outdated` / `yarn upgrade` | `yarn info <pkg>` |
| pnpm | `pnpm-lock.yaml` | `pnpm outdated` / `pnpm update` | `pnpm info <pkg>` |
| bun | `bun.lock` | `bun outdated` / `bun update` | — |
| composer | `composer.json` | `composer outdated` / `composer update` | — |
| pip | `requirements.txt` / `pyproject.toml` | `pip list --outdated` | `pip show <pkg>` |
| cargo | `Cargo.toml` | `cargo update` | — |
| go | `go.mod` | `go list -u -m all` / `go get -u` | — |

## Process

1. **Detect** — find all package manifests in the project.
2. **Check** — list outdated dependencies with current vs latest versions.
3. **Review** — read changelogs for breaking changes in major updates.
4. **Update** — one package at a time. Test after each update.
5. **Commit** — conventional commit per update group.
6. **Optionally** — open PR if this is a team repo.

## Rules
- Never update all at once — one package, test, commit, repeat.
- Skip major versions with breaking changes unless explicitly approved.
- Don't update if tests fail — report the failure.
- Summarize what was updated and why.
