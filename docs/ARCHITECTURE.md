# Architecture

pi-agent-kit is a pi package: a set of resources that the pi coding agent loads into its own process. It
is not an application and has no server, database or build step.

## How pi loads the kit

- pi reads the `pi` block of the root `package.json`: `extensions` (two directories), `skills` (the
  `skills` directory) and `themes` (the `themes` directory). pi packages know four resource kinds:
  extensions, skills, prompts and themes. There is no `agents` kind.
- A path in that block that does not exist produces no error; the resource is simply missing.
  `checks.pi-manifest` in `flake.nix` fails on such a path.
- Users install the package with `pi install npm:@lunitrixx/pi-agent-kit`. The maintainer's pi loads it
  from the main checkout by a local path in the personal pi settings, so the branch checked out there is
  what runs. A `packages` change is read at session start, not during a session.

## Components

| Path | Kind | Content |
| :--- | :--- | :--- |
| `extensions/lntrx-header/` | extension | Banner and host, CPU and memory info on `session_start` |
| `extensions/lntrx-footer/` | extension | Footer with thinking level, token and cost totals, token speed, context use and session duration |
| `skills/<name>/SKILL.md` | skills | Fifteen workflow skills (commit, pr, changelog, debug, ...), listed in `README.md` |
| `themes/lunitrixx.json` | theme | Dark amber theme |
| `agents/README.md` | reference | How to use the `pi-subagents` personas; no agent definitions |
| `prompts/` | empty | Kept for the convention `prompts/<name>.md`; nothing ships |

### Extensions

Each extension is an npm workspace with its own `package.json` (`"private": true`, `"type": "module"`,
`"pi": { "extensions": ["./src/extension.ts"] }`). The entry point default-exports
`function (pi: ExtensionAPI)` and registers handlers with `pi.on(...)`, tools and commands with
`pi.registerTool` and `pi.registerCommand`. pi runs the TypeScript source directly, so there is no `dist/`.

Header and footer are TUI features: in RPC mode (`pi --mode rpc`, as used by headless agents)
`setHeader()` and `setFooter()` are no-ops, so they do nothing for a dispatched agent.

npm links every workspace into `node_modules` by its package name. A `node_modules` shared between
worktrees would therefore resolve an extension to another checkout's source.

### Skills

pi sends the `name`, `description` and path of every skill with each request; the body is read only when
the skill triggers. Measured on 2026-10-16: the fifteen descriptions cost about 5.5 KB per request, the
bodies 23 KB in total after the rewrite in #38 (54 KB before). Short descriptions with trigger phrases and
short bodies keep that cost down. All skill files are ASCII only since #37; `checks.skills` enforces it
together with the frontmatter.

### Theme

pi validates a theme against the token list built into the running pi version. Since pi 1.3 that schema
has `additionalProperties: false`: tokens of other harnesses (for example `statusLine*`, `pythonMode`, a
`symbols` block) make the whole theme invalid ("Invalid theme", `/<token>: schema is false`), and pi 1.3
requires `scrollbarTrack`, `scrollbarThumb`, `searchMatchBg`, `searchMatchText` and `thinkingMax` without a
fallback. Validate a theme change against the pi that runs it, not against a published schema URL.

A theme with the same name in the user's pi agent directory wins over the packaged one and is reported as
a collision. The kit's copy is the source; a duplicate in the agent directory is removed.

## What ships to npm

`package.json` has no `files` field, so npm publishes the repository minus `.npmignore`. `.npmignore`
excludes the repository's own tooling (agent config, docs, Nix files, changelog fragments). Check with
`npm pack --dry-run`.

## History

The kit once shipped twelve extensions (memory, permissions, git hooks, health, local models, project
rules, subagent audit and others). On 2026-09-25 the package was reduced to header and footer and the other
sources were removed (#34): durable agent conventions had moved into the global system prompt, and
cross-session memory was covered by the `context-mode` package. `CHANGELOG.md` lists the removed extensions. The direction behind it is in
[design record 0002](design-docs/0002-kit-stays-an-extension-package.md).
