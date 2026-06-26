---
name: readme
description: >-
  Generate or update a project README.md from the actual codebase. Use when
  the user asks to "write a README", "update the README", "document the project",
  or "make a readme for this".
---

# README Generator

Generate a comprehensive, accurate README.md from the project's actual code.

## Process

1. **Detect languages** — check manifests (package.json, pyproject.toml, go.mod, etc).
2. **Read entry points** — main files, exported APIs, CLI commands.
3. **Read existing README** — preserve hand-written sections, add what's missing.
4. **Generate structure:**
   - Project name + one-line description
   - Badges (language, version, license, build)
   - Quick start (install, run, test) — language-appropriate commands
   - Architecture overview (Mermaid diagram or ASCII)
   - API reference (link to docs or inline examples)
   - Contributing guide
   - License
5. **Verify** — test every command in the README.

## Rules
- Read the actual code — never guess or template-fill.
- Keep hand-written content from existing README.
- Every command in the README must be tested.
