# Secrets

How this project provides secrets to people, agents and tools. The rules are in `SECURITY.md`.

## How it works

The project uses [SecretSpec](https://secretspec.dev/), which the dev shell provides through the `secrets`
module of `headfirst-msp/nix-base` (`secretspec` 0.21.1 from its `nixpkgs-unstable` input). SecretSpec
separates two things:

- **What** the project needs: `secretspec.toml` in the repository root declares each secret with a
  name and a description. It never contains values and is committed.
- **Where** the value lives: the provider. Personal secrets live in the system keyring of each person.
  Secrets shared by a team live in OpenBao. The personal choice is stored in
  `~/.config/secretspec/config.toml` and is never part of the repository.

Which provider a secret uses is decided per secret in `secretspec.toml`:

| Secret in `secretspec.toml` | Provider |
| :--- | :--- |
| without `providers` | The personal default provider of each person (the system keyring) |
| with `providers = ["team"]` | OpenBao, through the alias `team` declared in `[providers]` |

`secretspec run -- <command>` reads the values from the provider and starts the command with them in
its environment. Nothing is written to the shell, a file in the repository or the Nix store.

## Declared secrets

| Name | Used by | Notes |
| :--- | :--- | :--- |
| `FORGEJO_TOKEN` | Forgejo MCP server (`git.headfirst.cloud`) | Personal API token. Create it at `https://git.headfirst.cloud/user/settings/applications` with the scopes your work needs. |

`FORGEJO_TOKEN` has a fixed reference (`ref = { item = "FORGEJO_TOKEN" }`). For the keyring, `item` is
the keyring service name. Without a reference, SecretSpec stores a value per project under
`secretspec/<project name>/<profile>/<name>`, and every project would need the token stored again. With
the reference, one stored token serves every project that declares it the same way.

## Personal secrets: the system keyring

Once per person, not per project. The keyring is the macOS Keychain or the Linux Secret Service
(GNOME Keyring, KWallet). It needs no extra files.

```sh
secretspec config global init --provider keyring --profile default
secretspec set FORGEJO_TOKEN    # asks for the value without echoing it
secretspec check                # confirms every required secret is set
```

Never pass a value as a command-line argument. It ends up in the shell history and the process list.
To read a value from a file or stdin, use `secretspec set <NAME> --from-file <path>` or
`--from-file -`. A bare `-` as argument is stored literally as the value.

When a project adds a secret to `secretspec.toml`, run `secretspec check` and set the missing value.

Platform notes:

- Linux: a Secret Service must be running, for example `gnome-keyring`. Headless machines without one
  cannot use the keyring.
- macOS: builds without an Apple signature (Nix, Homebrew) get a new signature with every release, so
  macOS asks for the login keychain password once after an update. Choose **Always Allow**.

Plain `.env` or `file` providers store the value in clear text. Do not use them for tokens.

## Shared secrets: OpenBao

Secrets that belong to a repository and are shared by the team live in OpenBao at
`https://openbao.headfirst.cloud`, namespace `team`, KV v2 mount `repo-secrets`. SecretSpec stores them
at `secretspec/<project>/<profile>/<name>` in the field `value`, so every repository has its own prefix.

The alias `team` is already declared in `[providers]` of `secretspec.toml`. A secret opts in with
`providers = ["team"]`:

```toml
[profiles.default]
DB_PASSWORD = { description = "Database password", required = true, providers = ["team"] }
```

Sign in with OIDC. The OpenBao CLI stores the token in `~/.vault-token`, which SecretSpec reads when no
other token is set:

```sh
export BAO_ADDR=https://openbao.headfirst.cloud
bao login -method=oidc
secretspec set DB_PASSWORD
```

Do not set `BAO_NAMESPACE` globally. The OIDC login happens in the root namespace. The namespace
belongs only in the provider URI (`team@`). The token expires; sign in again when `secretspec check`
reports a permission or token error.

Access is decided by the OpenBao policies `secrets-editor-team-repos` (read and write on
`repo-secrets`), attached to the identity group `openbao-team`. Members of that group in Keycloak get
access. Everything in `repo-secrets` is visible to the whole team and to OpenBao admins. Do not put
personal secrets there.

For CI, OpenBao supports AppRole and JWT/OIDC (`?auth=approle`, `?auth=jwt&role=<role>`), so no personal
token is needed. See `https://secretspec.dev/providers/openbao/`.

OpenBao rejects `ref` without a `field` and refuses `secretspec set` for referenced secrets. Do not use
a `ref` for secrets with the `team` provider.

## Shell start and OpenBao scripts

`nix develop` sets `BAO_ADDR` and provides the `bao` CLI and four scripts. The shell start never
prompts and never blocks, because it also runs for `nix develop -c` and workmux's `post_create`:

- `secretspec-init-provider` runs first. If `~/.config/secretspec/config.toml` does not exist, it runs
  `secretspec config global init --provider keyring --profile default`. An existing config is never
  changed.
- It then prints a hint when the OpenBao token is missing or expired, or when `secretspec check`
  reports a missing secret. When all is fine it prints nothing.

Login and prompts need input, so they are not part of the shell start. Run `secrets-setup` once per
person, and again when the token has expired:

1. `bao-login`: if `bao token lookup` fails, it runs `bao login -method=oidc`. The CLI uses the `token`
   method by default, so the method is set here.
2. `secretspec-init-provider`, as above.
3. `secretspec check`. It asks for missing values, so the first run also stores `FORGEJO_TOKEN`.

Other scripts:

- `bao-login`: logs in only when the token is missing or expired.
- `get-bao-ssh-cert [name ...]`: signs `~/.ssh/<name>.pub` with the OpenBao SSH CA (role `admin`, 24 h)
  and writes `~/.ssh/<name>-cert.pub`. Without arguments it uses the names in `BAO_SSH_KEY_NAMES`
  (space separated basenames under `~/.ssh`).

## Agents

Start agents as usual (`pi`, `claude`, or through `workmux add`). No secret is put into the agent:

- The Forgejo MCP server is registered in `.mcp.json` as `forgejo-mcp-run run --reason "Forgejo MCP server"
  -- forgejo-mcp`, so `FORGEJO_TOKEN` is in the environment of that process only. `forgejo-mcp-run` finds
  the project root with git, sets `SECRETSPEC_FILE` to its `secretspec.toml` and runs the `secretspec` of
  nix-base by its store path, so the definition carries no worktree path. `.mcp.json` is generated by the
  dev shell and is not committed.
- A command that needs secrets is run by the agent as `secretspec run --reason "<why>" -- <command>`.
  SecretSpec refuses to run without a reason in a session it detects as an agent (Claude Code is
  detected, Pi was not in testing). The reason and the access are written to its audit log, `~/.local/state/secretspec/audit.log` (`secretspec audit`).

## Shell completion

`secretspec completions <shell>` prints a completion script (SecretSpec 0.20+). Supported shells: bash, zsh,
fish, elvish, nushell, powershell. Example for zsh, in `~/.zshrc`:

```sh
source <(secretspec completions zsh)
```

For bash use `source <(secretspec completions bash)` in `~/.bashrc`.

## Limits

- This is not a sandbox. An agent runs as your user and can read what your user can read: the keyring
  (unlocked while you are signed in), `~/.vault-token`, and `secretspec get`. The reason that
  SecretSpec asks of agents is a free text and the agent detection is heuristic. Give each token only the
  rights an agent should have, and keep admin access where agents do not run.
- Commands the agent runs with `secretspec run` get the secrets in their environment, and their child
  processes inherit them. Agents must not copy a value into files, logs or replies (`AGENTS.md`).
- Do not resolve secrets at shell start or put them into `headfirst.devShell.env`. That puts the value into
  the whole shell, and a value in `flake.nix` lands in the Nix store.
- Do not read `.env` into the flake (`builtins.readFile` or similar). It copies the whole file into the Nix
  store, which every user on the machine can read.

## Verification status

Checked on 2026-11-06 with dummy values on Linux (secretspec 0.21.0):

- `keyring` provider with `ref = { item = ... }`: `secretspec set` stores the value, and a second project with the same `ref` finds it.
- `keyring` provider with a shared alias `keyring://secretspec/shared/{profile}/{key}`: works across projects as well.
- `file` provider: a value set in one project was found by `get` and `run` in another project through a fixed reference.
- `env` provider: an exported `FORGEJO_TOKEN` reaches the started command. When it is missing, `secretspec check` reports the required secret as not set.
- OpenBao 2.7.2 dev server (token auth, no TLS): without `ref`, `set` and `check` work. With `ref` and no `field`, `check` fails and `set` refuses. With `ref` and `field`, `get` reads the field from another project. A value set with a namespace in the URI is not found without it.
- `team` namespace on `openbao.headfirst.cloud`: `set` and `check` against a KV v2 mount work.

Not checked yet: `secrets-setup` end to end, `get-bao-ssh-cert`, the macOS Keychain, `bao login -method=oidc` together with SecretSpec, and whether the
`openbao-team` policies work for a person who is not an OpenBao admin. All current team members are
admins, so the policies change nothing for them yet.
