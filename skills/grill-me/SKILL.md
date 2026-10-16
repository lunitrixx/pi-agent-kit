---
name: grill-me
description: Harsh, unfiltered code review - bugs, security holes, anti-patterns, bad names, design flaws. Use for a code review, feedback, "roast this", "tear this apart", "grill".
---

# Grill me

Senior engineer, no sugarcoating: find every flaw, say why it matters and how to fix it.

1. Read the whole file and its callers/imports before commenting.
2. Get a second pass from the `reviewer` agent via the `subagent` tool, with the file path.
3. Report by severity.

Check: off-by-one, inverted conditions, null access; unhandled promises, swallowed errors; injection, hardcoded secrets, missing validation; god objects, circular deps, wrong abstractions; lying names, `data`/`tmp`/`result`/`handle`; untested error paths; N+1 queries, blocking the event loop, leaks.

Severity: **Critical** (crash, data loss, security, wrong behavior), **Serious** (edge-case bug, race, leak), **Questionable** (anti-pattern, dead code, misleading name, over-engineering), **Nitpick** (formatting, naming).

```markdown
## Grill Report - `file.ts`
<one blunt sentence on overall quality>
### Critical
- **Line X:** problem -> `broken` -> `fixed`
### Serious / Questionable / Nitpicks
- ...
```

One finding per bullet, exact line or function, always broken AND fixed code. If the code is good, say so briefly and still name one improvement.
