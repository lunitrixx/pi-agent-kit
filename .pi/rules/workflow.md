_Mandatory - additions allowed, removal or weakening is not._

- Never commit directly to `main`. Every change goes through a branch and a Pull Request.
- Branch naming: `feat/<topic>` for features, `fix/<topic>` for bugfixes.
- Always use squash merge, with a single clean squash commit message (not a concatenation of every commit).
- Git/GitHub artifacts (commit messages, PR titles/bodies, issues, branch names) are always written in English.
- Do not add any trailer block to commits or PRs.
- After every user-facing change (feature, fix, rename, removal), update
  CHANGELOG.md under the topmost `## Unreleased` section. If the section
  doesn't exist, create it.
- After changes to project structure, entry points, or commands, check if
  README.md is still accurate and propose an update.
