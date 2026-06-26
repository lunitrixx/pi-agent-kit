# Agents (pi-subagents)

Agents are subagent personas managed by pi-subagents. The system registers
a `subagent` tool — ask in plain language:

```
"reviewer, review this code"
"planner, create a plan for..."
"worker, implement this task"
```

## Built-in Agents

| Agent | Purpose | Read-only |
|---|---|---|
| `reviewer` | Code review | Yes |
| `planner` | Implementation planning | Yes |
| `scout` | Explore codebase | Yes |
| `worker` | Implementation | No |
| `oracle` | Second opinion / rubber duck | Yes |

## Slash Commands

- `/parallel reviewer "task"` — run an agent with a task
- `/chain scout "find X" -> planner "plan Y"` — sequential agents
- `/parallel scout "X" --bg` — run in background

## Model Configuration

Set the default model for all subagents:
```
/agent-model default openrouter/google/gemma-4-26b-a4b-it
```

Per-agent override:
```
/agent-model reviewer claude-sonnet-4-6
```
