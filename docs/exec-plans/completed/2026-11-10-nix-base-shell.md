# Plan: dev shell from nix-base instead of devenv

## Goal and non-goals

Goal: the template and every project created from it get the dev environment from a Nix flake that imports
`headfirst-msp/nix-base` and is entered with `nix develop`. devenv and `headfirst-msp/devenv-base` are no
longer used. Everything the template configured in devenv keeps working.

Non-goals:

- No change to the agent rules beyond the Commands section and the lines that name devenv.
- No app code, no CI pipeline. The template has none today.
- Historical entries (`CHANGELOG.md`, the changelog fragment of 2026-11-07) stay as they are.
- nix-direnv is not configured in the template; it stays an optional, personal choice.

## Current state

Measured on 2026-11-10 on branch `main` at `8dd925a`:

- `devenv.yaml`: input `base` (`git+ssh://forgejo@git.headfirst.cloud/headfirst-msp/devenv-base`,
  `flake: false`), `imports: [ base/modules/standard ]`.
- `devenv.nix`: `packages = [ pkgs.git ]`, `git-hooks.hooks.markdownlint.excludes` with two entries (the
  five third-party skills, `.forgejo/pull_request_template.md`). No env, scripts, enterShell or enterTest.
- `devenv.lock`: pins devenv-base and through it nixpkgs and the agent inputs.
- `orca.yaml`: setup runs `devenv allow` and `devenv shell -- true`, `setupAgentStartupPolicy: wait-for-setup`.
- `.gitignore`: devenv block (`.devenv*`, `devenv.local.nix`, `devenv.local.yaml`), `.pre-commit-config.yaml`,
  the generated agent files.
- devenv is named in `AGENTS.md`, `README.md`, `docs/SECRETS.md`, `docs/SECURITY.md`,
  `.agents/skills/THIRD_PARTY.md`, `.forgejo/pull_request_template.md`, `.forgejo/ISSUE_TEMPLATE/bug_report.yaml`.
- No `flake.nix`. The checks on `main` are the devenv git hooks (`devenv test`, `prek run --all-files`).
- The skill `adopt-project-template` does not live in this repository (it is not under `.agents/skills`).

## Research

- nix-base, branch `feat/nix-base` (PR headfirst-msp/nix-base#1, not merged): `README.md` (mapping table
  devenv-base to nix-base), `docs/design-docs/0001-flakes-replace-devenv.md` (decision and migration steps),
  `modules/*.nix` (options `headfirst.devShell.{packages,env,shellHook,files}`), `tests/consumer/flake.nix`.
- nixpkgs `nixos-26.05`, flake-parts `hercules-ci/flake-parts` as in the nix-base README; exact revisions
  are in `flake.lock` after `nix flake lock`.
- git-hooks.nix: `pre-commit.settings.hooks.<name>` takes the same options as devenv `git-hooks.hooks.<name>`;
  list options such as `excludes` are concatenated with the base.

Rejected alternatives:

- Keep devenv and import nix-base through the devenv flake integration: keeps the dependency the org drops
  (nix-base design doc 0001).
- Point the input at `main` of nix-base now: the modules are not merged yet; `?ref=feat/nix-base` is used until
  headfirst-msp/nix-base#1 is merged.
- Set `systems` in the template flake: the template had no system list (devenv used the host system), so the
  nix-base default (`x86_64-linux`, `aarch64-linux`, `aarch64-darwin`) applies.

## Design

`flake.nix` uses flake-parts, imports `inputs.nix-base.flakeModules.default` and adds only what `devenv.nix`
added. Mapping of every item:

| devenv item | New place |
| :--- | :--- |
| `devenv.yaml` input `base` + `imports: [ base/modules/standard ]` | flake input `nix-base` (`?ref=feat/nix-base`, `inputs.nixpkgs.follows = "nixpkgs"`), `imports = [ inputs.nix-base.flakeModules.default ]` |
| nixpkgs pin from devenv-base | flake input `nixpkgs` `nixos-26.05`, pinned in `flake.lock` |
| `devenv.lock` | `flake.lock` |
| `packages = [ pkgs.git ]` | `headfirst.devShell.packages = [ pkgs.git ]` |
| `git-hooks.hooks.markdownlint.excludes` (third-party skills) | `pre-commit.settings.hooks.markdownlint.excludes`, same regex |
| `git-hooks.hooks.markdownlint.excludes` (PR template) | `pre-commit.settings.hooks.markdownlint.excludes`, same regex |
| env, scripts, enterShell, enterTest | none existed |
| `orca.yaml` setup `devenv allow` + `devenv shell -- true` | `nix develop -c true` |
| `.gitignore` `.devenv*`, `devenv.local.*` | replaced by `.direnv/` (nix-direnv, optional) |
| `devenv test` | `nix flake check -L` |

The decision is recorded in `docs/design-docs/0001-nix-base-dev-shell.md`, linking nix-base design doc 0001.

## Files to touch

- `flake.nix`, `flake.lock`: new.
- `devenv.nix`, `devenv.yaml`, `devenv.lock`: deleted.
- `.gitignore`: devenv block replaced, comment on generated files updated.
- `orca.yaml`: setup `nix develop -c true`.
- `AGENTS.md`: Commands (Setup, Lint), skill links and agent install lines.
- `README.md`: Getting started, dev shell section, Orca, Skills, Starting a new project.
- `docs/SECRETS.md`, `docs/SECURITY.md`: devenv references.
- `.agents/skills/THIRD_PARTY.md`: exclude list now in `flake.nix`.
- `.forgejo/pull_request_template.md`, `.forgejo/ISSUE_TEMPLATE/bug_report.yaml`: `nix flake check -L`, Nix version.
- `docs/design-docs/0001-nix-base-dev-shell.md`, `docs/design-docs/index.md`: new record.
- `changelog.d/`: one fragment.

## Steps

1. Write `flake.nix`, run `nix flake lock`. Outcome: `flake.lock` exists and pins nix-base on `feat/nix-base`.
2. Delete the devenv files, update `.gitignore` and `orca.yaml`. Outcome: `nix develop -c true` exits 0.
3. Update docs, templates and the design record. Outcome: `git grep -n devenv` only hits historical files,
   the design record and this plan.
4. Verify (below), commit, push, open the WIP PR.

## Verification

- `nix flake check -L` exits 0 (checks `pre-commit` and `treefmt`, dev shell build).
- `nix develop -c true` exits 0 and creates `.mcp.json`, `.pi/settings.json`, `.claude/settings.json`, the skill
  links and `.git/hooks/pre-commit`.
- `nix develop -c prek run --all-files` is clean.
- A test commit on a scratch branch runs the hooks; the scratch branch is deleted afterwards.
- `git grep -n devenv` lists only `CHANGELOG.md`-style history, the design record and this plan.

## Risks and rollback

- nix-base PR #1 changes before merge: `nix flake update nix-base` picks it up; after the merge the `?ref` is
  dropped in a follow-up.
- The new `treefmt` hook formats `flake.nix`; it is formatted with `nix fmt` before the commit.
- Rollback: revert the PR; devenv files come back from Git.

## Progress log

- 2026-11-10: plan written, devenv items listed.
- 2026-11-10: `flake.nix` and `flake.lock` added (nixpkgs `nixos-26.05` `ac588ef`, nix-base `feat/nix-base`),
  devenv files deleted, docs and templates updated, design record 0001 written.
- 2026-11-10: verified. `nix flake check -L` exits 0 (`pre-commit` and `treefmt` checks, x86_64-linux),
  `nix develop -c true` exits 0, `nix develop -c prek run --all-files` passes every hook, `nix fmt` changes
  nothing. A commit with an em dash on a scratch branch was rejected by `no-em-dash`, the fixed commit passed
  all hooks; the scratch branch was deleted.
- 2026-11-10: a terminal that is still inside a devenv shell exports `PREK_HOME` into `.devenv/`, which is no
  longer ignored. Leave the devenv shell and delete `.devenv` before working in a migrated checkout.

## Open questions

- None. headfirst-msp/nix-base#1 was merged on 2026-11-10 and the input now points at `main` of nix-base.
