---
name: extend-pi
description: >-
  Decide and create the right Pi extension type for a given task. Use when
  the user asks to "extend Pi", "add a feature to Pi", "build something for
  Pi", "create a skill/extension/agent/prompt", or "how do I add X to Pi".
---

# Extend Pi

Decide what Pi needs — skill, extension, agent, or prompt — then build it.

## Decision tree

Ask yourself: does this need...

| Need | Use | Example |
|---|---|---|
| Only instructions for the agent | **Skill** | "how to write commits" |
| State, tools, events, TUI, blocking | **Extension** | "block rm -rf", "show LSP errors" |
| Isolated worker with model+tool limits | **Agent** | "review this code", "plan a feature" |
| User-facing text template | **Prompt** | "PR template", "commit format"
| _(Prompts are usually redundant — skills auto-detect)_ | | |

## Common patterns

### Skill + Agent
Skill tells main agent to delegate to a subagent.
- Skill: `debug/SKILL.md` → "use /parallel planner, then /parallel worker"
- Agent: `plan.md` + `build.md` → worker personas with constrained tools

### Skill + Extension
Skill tells what, extension enforces it.
- Skill: `grill-me/SKILL.md` → "interview until full understanding"
- Extension: `lntrx-grill-me` → blocks writes, registers `grill_finish` tool, persists state

### Extension only
When the agent can't be trusted to follow instructions alone.
- `lntrx-safety` — blocks dangerous commands before they execute
- `lntrx-lsp` — subprocess management, file watching

### Prompt only
Pure text template, no logic needed. Skills auto-detect, so standalone prompts are rarely needed — but they exist for explicit `/prompt:name` invocation.

## Building

### Skill: `skills/<name>/SKILL.md`
```markdown
---
name: my-skill
description: What it does and when Pi should activate it.
---

# Title
Step-by-step instructions.
```

### Extension: `extensions/<name>/`
```
package.json → { name, type: "module", pi: { extensions: ["./src/extension.ts"] } }
src/extension.ts → export default function(pi: ExtensionAPI) { ... }
```

### Agent: `agents/<name>.md`
```markdown
---
name: my-agent
description: What it does
tools: read, grep, find, ls
model: claude-sonnet-4-5
---
# Instructions
```

### Add to package.json
New extensions go in `pi.extensions` array. Skills auto-discover from `skills/`. Agents from `agents/`.
