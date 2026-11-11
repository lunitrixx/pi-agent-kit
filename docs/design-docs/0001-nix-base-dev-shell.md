# 0001: Dev shell from nix-base with nix develop

- Status: accepted
- Date: 2026-11-10

## Context

The template got its dev shell from devenv and the shared base `headfirst-msp/devenv-base`. The org replaces
devenv with Nix flakes: every headfirst.cloud app is a flake, and two Nix entry points with two lock files
and two nixpkgs pins drift apart. `headfirst-msp/nix-base` provides the same dev shell, git hooks, agent
files, SecretSpec setup and changelog tooling as flake-parts modules. The decision and its sources are in
nix-base design record 0001 (`docs/design-docs/0001-flakes-replace-devenv.md` in `headfirst-msp/nix-base`).

## Decision

The template has a `flake.nix` built with flake-parts that imports `inputs.nix-base.flakeModules.default`
and adds only what the template needs on top: `git` and the markdownlint excludes for the third-party skills
and the PR template. The shell is entered with `nix develop`; `flake.lock` pins everything. workmux runs
`nix develop -c true` as `post_create`. Projects created from the template inherit this flake and extend it.

## Rejected alternatives

- Keep devenv with devenv-base: the org drops devenv (nix-base record 0001).
- A `flake.nix` without flake-parts: nix-base ships flake-parts modules, and the project has to extend
  their options (packages, hooks, agent settings) through the module system.

## Consequences

- No devenv CLI; Nix with flakes and SSH access to nix-base are the prerequisites.
- `nix flake check -L` replaces `devenv test` and also runs the formatter check (`nix fmt`).
- `devenv.nix`, `devenv.yaml` and `devenv.lock` are gone. Project tests go into `checks`.
