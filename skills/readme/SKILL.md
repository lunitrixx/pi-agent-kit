---
name: readme
description: Generate or update README.md from the actual codebase. Use for "write a README", "update the README", "document the project", "make a readme for this".
---

# README

1. Read manifests (`package.json`, `pyproject.toml`, `go.mod`, ...), entry points, exported APIs, CLI commands. Never guess or template-fill.
2. Read the existing README. Keep every hand-written section; only add what is missing.
3. Fill this structure:

```markdown
# <Name>
<one-line description>
<badges: license, version, and the stack's own (shields.io npm/pypi/crates/go-mod, CI workflow badge)>

## Quick Start      clone, install, run
## Usage            real, copy-pasteable examples
## Architecture     ASCII or Mermaid: components and data flow
## API Reference    link to docs/source or the key exports
## Development      install dev deps, test, build
## Contributing     short; link CONTRIBUTING.md if it exists
## License          <name> - see [LICENSE](LICENSE)
```

4. Run every command in the README; if one fails, fix the README.

Scannable: short paragraphs, code blocks. One README unless the project already uses multi-doc. Link instead of duplicating.
