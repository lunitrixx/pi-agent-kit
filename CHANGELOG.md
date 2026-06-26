# Changelog

## 0.1.0 (2026-06-26)

### Added
- 13 Pi extensions: config, context, fmt, footer, grill-me, guard, header, health, lang, localmodels, lsp, memory, project-rules
- 14 auto-detect skills: grill-me, merge-pr, project-onboarding, scratchpad, commit, changelog, pr, debug, refactor, test, readme, docs-gen, dep-update, extend-pi
- 3 subagents: review, plan, build
- lunitrixx theme: dark amber with nerd font symbols
- Cross-session memory system (lntrx-memory) with cerebrum, anatomy, buglog, daily log, scratchpad
- Socratic planning extension (lntrx-grill-me) with 3-phase model
- Project rules injection (lntrx-project-rules) from .pi/rules/ and .claude/rules/
- Git guard (lntrx-guard): secret scanning, dangerous command confirmation, git hook management
- Pre-commit hook auto-install blocking direct commits to main (/guard-hook)
- Per-project and global hook config via .pi/pi-agent-kit.json
- Response language switching (/lang de|en)
- Auto-provisioned web-search config
- Bundled pi-web-access + pi-mcp-adapter + pi-subagents
