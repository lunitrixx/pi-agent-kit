---
name: readme
description: >-
  Generate or update a project README.md from the actual codebase. Use when
  the user asks to "write a README", "update the README", "document the project",
  or "make a readme for this".
---

# README Generator

Generate a comprehensive, accurate README.md from the project's actual code.
Never guess — read the codebase, test every command, preserve existing content.

## Process

1. **Read the codebase** — check manifests (`package.json`, `pyproject.toml`,
   `go.mod`, etc.), entry points, exported APIs, CLI commands.

2. **Read existing README** — preserve all hand-written sections. Only add
   what's missing, never delete what's there.

3. **Generate structure:**

   ```markdown
   # <Project Name>

   <One-line description>

   [![License](https://img.shields.io/badge/license-<LICENSE>-blue)](LICENSE)
   [![Version](https://img.shields.io/badge/version-<VERSION>-green)](https://github.com/<owner>/<repo>/releases)
   <!-- Add stack-specific badges: npm version, PyPI, crates.io, Go report card -->

   ## Quick Start

   ```bash
   git clone <repo-url> && cd <project>
   <install-command>
   <run-command>
   ```

   ## Usage

   <!-- Concrete examples from the actual codebase. Copy-pasteable. -->

   ## Architecture

   <!-- ASCII or Mermaid diagram showing components and data flow. -->

   ## API Reference

   <!-- Either link to docs or inline the key endpoints/exports. -->

   ## Development

   ```bash
   git clone <repo-url> && cd <project>
   <install-dev-deps>
   <test-command>
   <build-command>
   ```

   ## Contributing

   <!-- Brief: how to set up, run tests, open a PR. -->

   ## License

   <LICENSE-NAME> — see [LICENSE](LICENSE) file.
   ```

4. **Add badges** — pick the right ones for the detected stack:

   | Stack | Badge source |
   |---|---|
   | npm | `https://img.shields.io/npm/v/<package>` |
   | Python/PyPI | `https://img.shields.io/pypi/v/<package>` |
   | Rust/Cargo | `https://img.shields.io/crates/v/<crate>` |
   | Go | `https://img.shields.io/github/go-mod/go-version/<owner>/<repo>` |
   | License | `https://img.shields.io/badge/license-<LICENSE>-blue` |
   | CI | `https://github.com/<owner>/<repo>/actions/workflows/<workflow>/badge.svg` |

5. **Verify** — actually run every command in the README. If a command fails,
   fix the README. Never commit untested instructions.

## Rules

- **Read the actual code — never guess or template-fill.** Every command, every
  API example, every configuration snippet must come from the real codebase.
- **Preserve hand-written content.** Only add missing sections. Never delete
  existing prose.
- **Every command must be tested.** `git clone`, `npm install`, `npm test`,
  everything. If it doesn't work, the README is a lie.
- **Keep it scannable.** Developers scan, they don't read. Use clear headers,
  short paragraphs, and code blocks.
- **One README per project.** No split across multiple files unless the
  project explicitly uses a multi-doc setup.
- **Link, don't inline.** API reference links to docs or source. Contributing
  links to CONTRIBUTING.md if it exists. Don't duplicate.
