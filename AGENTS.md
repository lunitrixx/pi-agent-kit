# AGENTS.md

Map of this repository for AI coding agents. Keep this file short. Details live in `docs/`.

## Project

- Name: `lunitrixx-pi-agent-kit`
- Purpose: Pi-native toolkit of extensions, skills and a theme for the pi coding agent, published on npm as `@lunitrixx/pi-agent-kit`.
- Stack: TypeScript ES modules loaded by pi without a build step, Markdown skills, a JSON theme; npm 11 workspaces (`extensions/*`, `package-lock.json` v3); Node.js 24 from nixpkgs `nixos-26.05` in the dev shell; peer dependencies `@earendil-works/pi-coding-agent`, `pi-ai` and `pi-tui` (0.80.2 in the lock file), `typebox` 1.3, `zod` 4.4. Package version 0.4.0.

## Commands

- Setup: `nix develop` (run first; it also generates `.mcp.json`, `.pi/settings.json` and `.claude/` and installs the git hooks; none of these are committed). One command in the shell: `nix develop -c <command>`.
- Secrets are declared in `secretspec.toml`. Run a command that needs them as `secretspec run --reason "<why>" -- <command>`; SecretSpec asks for a reason in a session it detects as an agent and logs it. Never read a secret out of the environment into files, logs or replies. Setup per person: `docs/SECRETS.md`.
- Install: `nix develop -c npm ci` (from the lock file; run it in every worktree).
- Test: `nix flake check -L`. Besides the hooks and the formatter it runs `checks.pi-manifest` (every path in the `pi` block of `package.json` exists) and `checks.skills` (every `skills/*/SKILL.md` has `name` and `description` frontmatter and only ASCII). There are no unit tests.
- Lint: `nix develop -c prek run --all-files` (all git hooks on all files) and `nix fmt` (format). `nix flake check -L` runs both as checks.
- Build: none. pi loads `extensions/*/src/extension.ts` directly. `nix develop -c npm pack --dry-run` lists what the npm package would publish.
- Try a skill change: `pi --skill skills/<name>` in the dev shell. Never `pi install .` (see below).

## This project

- The repository is the product. `extensions/`, `skills/`, `themes/`, `prompts/` and `agents/` are what the npm package ships; they are not agent configuration of this repository. Skills for agents working here live in `.agents/skills/`.
- A new or renamed extension, skill directory or theme is not loaded until the `pi` block of the root `package.json` names it. pi reports no error for a missing path. Change the directory and the block in the same commit; `checks.pi-manifest` catches the miss.
- An extension lives in `extensions/<name>/` with its own `package.json` (`"type": "module"`, `"pi": { "extensions": ["./src/extension.ts"] }`) and a default export `function (pi: ExtensionAPI)`. `extensions/lntrx-header` is the model for a new one.
- A skill is `skills/<name>/SKILL.md` with `name` and `description` frontmatter. pi sends every description with each request, so keep it one short line plus trigger phrases, keep bodies short, and use ASCII only.
- `agents/` holds only a README and `prompts/` only a `.gitkeep`. Subagents come from the external `pi-subagents` package through its `subagent` tool. pi packages have no `agents` resource kind.
- pi on the maintainer's machine loads the kit from the main checkout by local path, so the branch checked out there is live. Work in a worktree.
- Never run `pi install .`: it writes the user's global pi configuration. `pi install . -l` writes `.pi/settings.json`, which the dev shell generates as a link; do not use it either.
- `node_modules` is never shared or linked between worktrees. The workspaces link each extension into it by name, so a shared one resolves to another checkout's source.
- Do not change `package.json` dependencies or `package-lock.json` without approval. `npm audit` is not a gate: its advisories sit in the pi peer dependencies, which this repository does not control.
- There is no CI. The gates are `nix flake check -L` and the `pre_merge` commands in `.workmux.yaml`.
- A change to extensions, skills or commands updates the tables in `README.md` in the same commit.
- Changelog fragments describe what changes for users of the package (for example compatibility with a new pi version), not repository housekeeping.
- Do not describe the global system prompt in `AGENTS.md`; it is always loaded and not part of this project.
- A theme change is validated against the pi version that runs it; details in `docs/ARCHITECTURE.md`, "Theme".
- The repository is on GitHub: use `gh` where the rules below name `fj`. Pull requests are squash-merged as `type(scope): summary (#N)`.

## Where knowledge lives

- Architecture and layers: `docs/ARCHITECTURE.md`
- Product behaviour: `docs/product-specs/index.md`
- Design decisions: `docs/design-docs/index.md`
- Plans: `docs/PLANS.md`. Active plans in `docs/exec-plans/active/`, finished ones in `docs/exec-plans/completed/`
- Known tech debt: `docs/exec-plans/tech-debt-tracker.md`
- Security rules: `docs/SECURITY.md`
- Secrets (SecretSpec, declared secrets, setup): `docs/SECRETS.md`

## Orga wiki (shared knowledge)

Shared standards and decisions across all projects live in the Forgejo repo
`headfirst-msp/orga-wiki-en`. Access it only through the MCP server `forgejo`.
Do not clone it, and do not assume a local path.

- Read `index.md` at the wiki root first, then only the pages you need.
- Read the wiki's `AGENTS.md` before proposing a change. Its rules override anything here.
- To propose a change: create a branch `wiki/<topic>` from `main`, write the page, update
  `index.md` and `CHANGELOG.md` on the same branch, open a pull request against `main` only after
  the user confirms, and return its URL. Never write to `main`.
- Write only what applies beyond this project. Project-specific details stay in `docs/`.
- If the `forgejo` MCP server is not available, tell the user. Do not fall back to a clone.

## Plans, skills and tools

- Multi-step work gets a plan in `docs/exec-plans/active/` before implementation, as described in `docs/PLANS.md`. Move it to `docs/exec-plans/completed/` when the work is done.
- A plan is detailed and researched: goal, sources with versions, rejected alternatives, steps and verification. Its required sections are listed in `docs/PLANS.md`.
- Plans and skills never open with a role line such as "You are an expert in ...". State the purpose and the procedure directly.
- Skills are written once in `.agents/skills/<name>/SKILL.md`. `nix develop` links each skill directory into `.claude/skills/` on shell entry. An edit of a skill is visible at once; a new skill needs a new shell entry.
- Some skills are adapted copies of upstream skills. Before changing or updating one, read `.agents/skills/THIRD_PARTY.md`.
- Pi and Claude Code are installed by `nix develop` through the shared base `headfirst-msp/nix-base` (input `nix-base` in `flake.nix`). `.pi/settings.json` and `.claude/` are generated and not committed. Personal Pi settings go to `~/.pi/agent/settings.json`, personal Claude settings to `.claude/settings.local.json`.

## Time tracking

Agents have no Clockodo access, so they record the time of their work in `timesheet.md` at the repository root. The file is gitignored and stays local; the requester copies the entries into Clockodo.

- At the end of each working session, append one entry; never rewrite older ones. Create the file with the heading `# Timesheet` if it is missing.
- One entry per session and day: `- YYYY-MM-DD HH:MM-HH:MM | <org> / <project> | <description> | <PRs or branches>`. The times are local time, taken from the session's own timestamps (commits, logs), never guessed; when only an approximate span is known, mark it with `ca.`.
- The description is German, one or two sentences of what was done for the customer, as it would appear in Clockodo. No secrets, no internal paths beyond the repository name.
- Never commit `timesheet.md`, never copy it into docs, a PR or a commit message.

## Boundaries

- Never commit to `main`. Branches: `feat/<topic>` or `fix/<topic>`.
- Delete a branch once its pull request is merged: on Forgejo (`fj pr merge ... -d` or the checkbox in the merge dialog) and locally (`git branch -d <branch>`, `git fetch --prune`).
- Never commit secrets. `.env` is never read into docs or commits.
- Never bypass git hooks (`--no-verify`, `-n`) on commit or push. When a hook fails, fix the cause. A false positive of the secret scan is silenced with a `betterleaks:allow` comment or an entry in `.betterleaksignore`, and only after the user confirms it is not a secret.
- Secrets are declared in `secretspec.toml` and provided by SecretSpec from each person's own store. Never write a secret value into the repository, and never read it out of the environment into files, logs or replies.
- Update the matching doc in the same change when behaviour changes.
- Record architecture decisions in `docs/design-docs/` as short records.
- Every lock or pin file of any tool or package manager is committed. Never add one to `.gitignore`.
- Change dependencies only through the tool that owns the lock file. Never edit a lock file by hand.

## Changelog (mandatory)

Record every user-facing change as one fragment in `changelog.d/`, never by editing `CHANGELOG.md`.

- Create it with `changelog-add "What changed for the reader, and why"`. It writes
  `changelog.d/YYYYMMDD-<hex>.md` with one Markdown bullet. The date is the day of the change. There
  are no versions and no `Unreleased` heading.
- A branch with `feat`, `fix` or `perf` commits needs a fragment. The hook `changelog-required`
  checks it on push.
- `CHANGELOG.md` is rendered from the fragments on `main` with `changelog-render`. A branch never
  edits it, so parallel branches do not conflict.
- Full rule: `headfirst-msp/orga-wiki-en` at `standards/changelog.md`.

## Language (mandatory)

All code, in any programming or markup language (PHP, JavaScript, TypeScript,
Shell, PowerShell, HTML, CSS, SQL, Nix, Terraform, YAML, ...), and all Git
artifacts are written in English only, never in German:

- Identifiers, file and directory names, tests and test names
- Comments of every kind (line, block, doc comments, PHPDoc, JSDoc, HTML and CSS comments)
- Log messages and exception or error texts in code
- Commit messages, branch names, PR titles and bodies, issues, review comments
- CHANGELOG.md entries and tags

German is allowed only in chat replies to the user. User-visible product texts
(UI labels, mails, PDFs) follow the product's language, not this rule; translation
keys stay English. Before every commit and PR, check your own text; if it contains
German, rewrite it in English first.

This block is binding on its own. The full canonical rule, with the detailed scope,
lives in `headfirst-msp/orga-wiki-en` at `standards/language-code-and-git.md`. Read it
via the MCP server `forgejo` (`get_file_contents`) when it is available. If it is
not, follow this block anyway and tell the user.

## Writing and comments (mandatory)

Applies to code, comments, commit messages, PR texts, docs and the CHANGELOG.

- No em dashes or en dashes. Use the plain hyphen-minus `-`.
- No emojis, decorative symbols or emoji bullets. No filler such as "Certainly",
  "Great question" or marketing wording.
- Keep prose short and factual.

Comments:

- Write a comment only where the code does not explain itself: a non-obvious
  decision, a workaround, a constraint, an edge case.
- Explain why, not what. Never restate the code.
- Doc comments follow the language standard (PHPDoc, JSDoc, docstrings, ...) with one
  summary line. Document parameters only when names and types do not make them obvious.
- Do not comment trivial code. A variable named `$user` needs no comment.
- No banner comments, section dividers, commented-out code or change logs in code.

Full rule with examples: `headfirst-msp/orga-wiki-en` at `standards/writing-and-comments.md`.
