# Security

- Secrets never go into the repository, commits, logs or docs.
- Every secret the project needs is declared in `secretspec.toml` (name and description only).
  Each person stores the value in their own provider and starts tools with `secretspec run -- <command>`.
  Details: `SECRETS.md`.
- Never load `.env` or any secret through Nix (`builtins.readFile`, a dev shell `env` value): it lands in the world-readable Nix store.
- `.env` files stay local. Only `.env.example` is committed, with placeholder values.
- Example values in `.env.example`, docs and config samples are placeholders such as `<db-password>`,
  `${DB_PASSWORD}` or `changeme`, never values that look real such as `secret123`.
- The `betterleaks` git hook scans every commit for secrets (rules and skipped paths: README of
  `headfirst-msp/nix-base`). It skips `tests/`, `test/` and `vendor/`, so fake credentials belong
  in test directories, and real ones belong nowhere in the repository.
- Report security findings in the issue tracker with the label `Kind/Security`.
  Do not describe exploit details in public places.
- Dependencies are updated on a regular cadence and when a security advisory appears.
