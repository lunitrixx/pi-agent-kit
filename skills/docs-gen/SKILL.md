---
name: docs-gen
description: Generate a documentation site under docs/ (guides, API reference, examples). Use for "write docs", "generate documentation", "build docs site", "create API docs".
---

# Docs site

```
docs/
  index.md            overview + quick start, links to all sections
  guide/              getting-started.md, usage.md, configuration.md, one page per major workflow
  api/README.md       every public function, class, endpoint - complete
  examples/           copy-pasteable, tested code
  contributing.md
```

1. Read entry points, key modules, public APIs.
2. Write guides, API reference, examples, then `index.md`.

Test every code example in the project. Guides explain why, not just what. Use language-tagged code blocks. Keep prose short.
