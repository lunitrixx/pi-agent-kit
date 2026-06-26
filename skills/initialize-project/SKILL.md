---
name: initialize-project
description: >-
  Bootstrap a new project with standard dotfiles and configuration. Use when
  the user says "initialize a project", "setup a new repo", "create a new
  project", "bootstrap", or "scaffold".
---

# Initialize Project

Set up a new project directory with all the standard dotfiles and
configuration that every well-behaved project needs. Generates appropriate
files for whatever ecosystem the user describes - no hardcoded list of
supported types.

## When to Use

- Starting a brand-new project from scratch
- User says "create a new project", "initialize", "bootstrap", "scaffold"
- Converting an existing directory of loose files into a proper project
- User says "set up dotfiles for this project"

## Workflow

Execute these steps in order. If a file already exists, ask before
overwriting.

### Phase 1: Project Identity

1. **Determine the project type.** If the user hasn't specified, inspect the
   working directory for clues (`package.json`, `pyproject.toml`, `Cargo.toml`,
   `go.mod`, `pom.xml`, `CMakeLists.txt`, `Gemfile`, `composer.json`, etc.).
   If nothing is found, ask:

   > What kind of project is this?

   Accept any answer - language, framework, or stack. Don't present a menu
   of options. Use the user's description to decide what goes into the
   dotfiles.

2. **Confirm the project name.** If there's a directory name or the user
   mentioned one, use it. Otherwise ask for the project name.

3. **Check if git is initialized.** Run `git rev-parse --git-dir 2>/dev/null`.
   If not, run `git init`.

### Phase 2: Core Dotfiles (always create)

4. **`.gitignore`** - Always start with these universal entries:

   ```gitignore
   # OS junk
   .DS_Store
   Thumbs.db
   Desktop.ini

   # Editor junk
   *.swp
   *.swo
   *~
   .vscode/
   .idea/

   # Environment
   .env
   .env.local
   .env.*.local
   ```

   Then append patterns specific to whatever ecosystem the user named.
   Generate them from your own knowledge - dependency dirs
   (`node_modules/`, `__pycache__/`, `/target/`, `vendor/`, etc.), build
   output, test artifacts, cache directories, and any tooling-specific
   cruft typical for that stack. When in doubt, err on the side of more
   patterns rather than fewer.

5. **`.gitattributes`** - Normalize line endings. Always create:

   ```gitattributes
   # Auto-detect text files and normalize to LF
   * text=auto

   # Explicit text types
   *.md text
   *.json text
   *.yaml text
   *.yml text
   *.toml text
   *.xml text
   *.sh text eol=lf
   *.bash text eol=lf

   # Source code (adjust extensions based on project type)
   *.ts text eol=lf
   *.tsx text eol=lf
   *.js text eol=lf
   *.jsx text eol=lf
   *.py text eol=lf
   *.rs text eol=lf
   *.go text eol=lf
   *.rb text eol=lf
   *.java text eol=lf
   *.kt text eol=lf
   *.swift text eol=lf
   *.c text eol=lf
   *.h text eol=lf
   *.cpp text eol=lf
   *.hpp text eol=lf
   *.css text eol=lf
   *.html text eol=lf

   # Binary
   *.png binary
   *.jpg binary
   *.jpeg binary
   *.gif binary
   *.ico binary
   *.woff binary
   *.woff2 binary
   *.ttf binary
   *.eot binary
   *.pdf binary
   ```

6. **`.editorconfig`** - Consistent editor settings. Use 2-space indent
   by default; add language-specific overrides where the ecosystem
   convention differs (e.g. Python/Rust/Go use 4, Ruby uses 2,
   Makefiles use tabs):

   ```ini
   # EditorConfig is awesome: https://editorconfig.org
   root = true

   [*]
   charset = utf-8
   end_of_line = lf
   indent_style = space
   indent_size = 2
   insert_final_newline = true
   trim_trailing_whitespace = true

   [*.md]
   trim_trailing_whitespace = false

   [Makefile]
   indent_style = tab
   ```

### Phase 3: Optional but Recommended

Ask the user whether they want these. Default to "yes" if they said
"initialize everything".

7. **`AGENTS.md`** - Project-specific agent instructions. Create a minimal
   stub if none exists:

   ```markdown
   # AGENTS.md

   Canonical source of truth for AI coding agents working in this repository.

   ## Project

   **<project-name>** - <one-line description>

   **Tech stack:** <language/framework>

   ## Workflow

   - Never commit directly to `main`. Use feature branches and Pull Requests.
   - Branch naming: `feat/<topic>`, `fix/<topic>`.
   - Use squash merge with a clean commit message.

   ## Conventions

   - <project-specific conventions>
   ```

8. **`.env.example`** - Document required environment variables:

   ```bash
   # Copy this file to .env and fill in your values
   # cp .env.example .env

   # Required
   # API_KEY=your-api-key-here

   # Optional
   # DEBUG=true
   # PORT=3000
   ```

9. **`Makefile`** or **`justfile`** - Common task shortcuts. Ask which task
   runner the user prefers. Create a minimal one:

   ```makefile
   .PHONY: help install dev test build lint clean

   help: ## Show this help
   	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
   		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

   install: ## Install dependencies
   	@echo "TODO: add install command"

   dev: ## Start development server
   	@echo "TODO: add dev command"

   test: ## Run tests
   	@echo "TODO: add test command"

   build: ## Build for production
   	@echo "TODO: add build command"

   lint: ## Lint code
   	@echo "TODO: add lint command"

   clean: ## Remove build artifacts
   	@echo "TODO: add clean command"
   ```

### Phase 4: Summary

After creating all files, present what was done:

```
## Project Initialized: <project-name>

### Created files
- `.gitignore` (<ecosystem> patterns + OS/editor/env entries)
- `.gitattributes` (LF normalization + binary markers)
- `.editorconfig` (UTF-8, LF, <indent-size>-space indent)
- `AGENTS.md` (agent instruction stub)
- `.env.example` (environment variable template)
- `Makefile` (task shortcuts)
- `git init` (initialized empty repository)

### Next steps
- Review and customize `.gitignore` for your specific tooling
- Fill in `AGENTS.md` with your actual conventions
- Set up your `.env` from `.env.example`
- Add install/dev/test/build commands to `Makefile`
- Run `git add . && git commit -m "chore: initialize project"`
```

## Notes

- Never overwrite existing files without asking. If the user says "initialize"
  in a directory that already has dotfiles, ask for each conflict.
- Always run `git init` if not already a git repo - the dotfiles are useless
  without version control.
- The `AGENTS.md` stub uses the conventions from this kit as sensible defaults
  (branch naming, squash merge). Adjust if the user has different preferences.
- If `lntrx-memory` is available, record the initialization with
  `lntrx_memory_learn` so other agents know the project was bootstrapped.
- Generate `.gitignore` patterns for whatever ecosystem the user names.
  Don't restrict to a predefined list - the agent's general knowledge is
  sufficient to produce reasonable ignores for any stack.
