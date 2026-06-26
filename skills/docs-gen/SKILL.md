---
name: docs-gen
description: >-
  Generate a proper documentation site under docs/ with API reference, guides,
  and examples. Use when the user asks to "write docs", "generate documentation",
  "build docs site", or "create API docs".
---

# Documentation Generator

Generate a proper documentation site — not just a single file.
Language-agnostic: works with any codebase.

## Structure

```
docs/
├── index.md          — Overview + quick start
├── guide/            — How-to guides
│   ├── getting-started.md
│   ├── usage.md
│   └── configuration.md
├── api/              — API reference
│   └── README.md
├── examples/         — Working examples
└── contributing.md   — How to contribute
```

## Process

1. **Analyze the codebase** — read entry points, key modules, public APIs.
2. **Write guides** — one page per major feature/workflow.
3. **Write API reference** — document every public function, class, endpoint.
4. **Write examples** — copy-pasteable, tested code.
5. **Write index.md** — overview with links to all sections.

## Rules
- Every code example must be tested in the actual project.
- API docs cover every public export/endpoint — complete, not partial.
- Guides explain why, not just what.
- Use the project's language for code blocks (```ts, ```py, ```go, etc).
- Keep prose concise — developers scan.
