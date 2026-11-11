# Pi Agent Kit

Pi-native toolkit providing extensions, skills, themes, prompts, and specialized agents for [pi-coding-agent](https://github.com/badlogic/pi-mono).

## Install

```bash
pi install npm:@lunitrixx/pi-agent-kit
```

### Extensions (2)

| Extension | What |
| :--- | :--- |
| `lntrx-header` | Rainbow LUNITRIXX banner + system info |
| `lntrx-footer` | Token/cost/speed footer |

### Skills (15)

Auto-detected by Pi from your prompt.

| Skill | Triggers on |
| :--- | :--- |
| `changelog` | "update changelog" |
| `commit` | "write a commit message" |
| `debug` | "fix this bug" |
| `dep-update` | "update dependencies" |
| `docs-gen` | "write documentation" |
| `extend-pi` | "build an extension" |
| `grill-me` | "roast this", "review this code" |
| `merge-pr` | "merge PR 81" |
| `pi-project-setup` | "initialize a project", "scaffold", "migrate to AGENTS.md" |
| `pr` | "write a PR description" |
| `project-onboarding` | "what does this project do" |
| `readme` | "generate README" |
| `refactor` | "clean up this code" |
| `test` | "add tests for" |
| `version-management` | "bump version", "release" |

### Agents

Install `pi-subagents` for the `subagent` tool (see companion packages above).

### Theme

`/theme lunitrixx`: dark amber theme with nerd font symbols.

## Optional companion packages

These Pi packages integrate well but are not bundled. Install them separately:

```bash
# Web access: web_search and fetch_content tools, librarian skill
pi install npm:pi-web-access

# MCP adapter: connect to MCP servers
pi install npm:pi-mcp-adapter

# Subagents: subagent delegation (reviewer, planner, worker, scout, oracle)
pi install npm:pi-subagents
```

Without `pi-subagents`, the `subagent` tool is unavailable.

## Development

The repository is built on the headfirst-msp project template: a reproducible Nix dev shell with the
coding agents, the agent rules in `AGENTS.md`, shared skills, the documentation layout under `docs/` and
secret handling with SecretSpec.

### Getting started

1. Install [Nix](https://nixos.org/download/) with flakes enabled (`experimental-features = nix-command flakes`
   in `nix.conf`) and an SSH key that can read `headfirst-msp/nix-base` on `git.headfirst.cloud`. In the
   repository run `nix develop`. Optional: [nix-direnv](https://github.com/nix-community/nix-direnv) with
   `use flake` in a personal `.envrc` enters the shell on `cd` and caches it.
2. Run `secrets-setup` once: it signs in to OpenBao, sets the keyring as default provider and asks for
   your Forgejo token. Details: `docs/SECRETS.md`.
3. Install the workspaces: `npm ci`.
4. Try a skill without installing the package: `pi --skill skills/<name>`. To load the whole checkout in
   your own pi, run `pi install .`; it adds the checkout to your global pi settings, so the branch you have
   checked out is what pi runs.
5. Check before a pull request: `nix flake check -L` (git hooks, formatter, the `pi` manifest paths and the
   skill frontmatter). `npm pack --dry-run` lists what the npm package publishes.

There is no build step: pi loads `extensions/*/src/extension.ts` directly. How the package is put together:
`docs/ARCHITECTURE.md`. Changes are recorded as fragments in `changelog.d/` with `changelog-add`.

### What the dev shell provides

The dev shell is the output `devShells.default` of `flake.nix`, and everything is pinned in `flake.lock`.
The tools come from the shared base repository `headfirst-msp/nix-base` (input `nix-base`, imported as
`inputs.nix-base.flakeModules.default`). This repository adds `git`, Node.js 24 and the checks
`pi-manifest` and `skills`.

| Tool | Module in `nix-base` | Notes |
| :--- | :--- | :--- |
| Pi | `agents` (`llm-agents`, package `pi`) | |
| Claude Code | `agents` (`llm-agents`, package `claude-code`) | |
| Forgejo MCP server | `agents` (`lunitrixx`, `mcp.forgejo-mcp`) | Registered for both agents in `.mcp.json` |
| OpenBao CLI and scripts | `secrets` | `bao`, `bao-login`, `secrets-setup`, see `docs/SECRETS.md` |
| SecretSpec | `secrets` | Provides the secrets declared in `secretspec.toml` |
| Git hooks | `git-hooks` | prek with markdownlint, lychee (offline link check), no em dash, betterleaks (secret scan), no commit on `main` |
| Formatter | `formatter` | `nix fmt` with nixfmt, deadnix and statix, also run as the `treefmt` git hook |
| Changelog fragments | `changelog` | `changelog-add`, `changelog-render`, `changelog-check` |

The shell writes `.mcp.json`, `.pi/settings.json`, `.claude/` and `.pre-commit-config.yaml` on entry.
They are not committed.

### workmux

`.workmux.yaml` runs `nix develop -c true` and `npm ci` in `post_create` of every worktree that
`workmux add <branch>` creates beside the repository (`<repo>__worktrees/<branch>`), before the agent
starts. `pre_merge` runs `nix flake check -L` and `npm ci`. Agent profiles such as `coder-qwen` are defined
per machine in `~/.config/workmux/config.yaml`, not in the repository.
