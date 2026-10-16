---
name: extend-pi
description: Pick and build the right Pi extension type (skill, extension, agent, prompt). Use for "extend Pi", "add a feature to Pi", "create a skill/extension/agent/prompt", "how do I add X to Pi".
---

# Extend Pi

| Need | Build | Example |
|---|---|---|
| Instructions only | Skill | how to write commits |
| State, tools, events, TUI, blocking | Extension | block `rm -rf`, show LSP errors |
| Isolated worker with model/tool limits | Agent | review code, plan a feature |
| User-invoked text template (`/prompt:name`) | Prompt | rarely needed - skills trigger themselves |

Combine when useful: a skill that delegates to an agent; a skill that says what and an extension that enforces it (e.g. blocks writes until a step is done); an extension alone when the model cannot be trusted to follow instructions.

## Layout

- Skill `skills/<name>/SKILL.md`: frontmatter `name`, `description` (what + when to trigger), then step-by-step instructions.
- Extension `extensions/<name>/`: `package.json` `{ name, type: "module", pi: { extensions: ["./src/extension.ts"] } }`, `src/extension.ts` `export default function (pi: ExtensionAPI) { ... }`. Register it in the package's `pi.extensions`.
- Agent `agents/<name>.md`: frontmatter `name`, `description`, `tools` (e.g. `read, grep, find, ls`), `model`, then instructions.

Skills and agents are auto-discovered from `skills/` and `agents/`. Read the Pi docs (path in the system prompt) before writing extension code.
