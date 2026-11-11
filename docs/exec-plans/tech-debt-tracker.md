# Tech debt tracker

Known problems that are not fixed yet. One entry per item.

| Area | Problem | Impact | Owner | Status |
| :--- | :--- | :--- | :--- | :--- |
| Theme | `themes/lunitrixx.json` is invalid under pi 1.3 (foreign tokens, five required tokens missing). The fix is on the open PR #40 (`fix/theme-pi-1.3-schema`). | pi rejects the theme and falls back to the default | maintainer | fix open in #40 |
| Theme | On 2026-10-24 pi did not load the theme from the package and needed a copy in the user's pi agent directory (`Theme not found`), while on 2026-10-18 pi saw both copies and reported a collision. Not verified which behaviour the current pi has. | `/theme lunitrixx` may fail for package users | maintainer | to verify |
| Product docs | `agents/README.md` names the persona `planner`, the commands `/parallel` and `/chain` and a model example; per the research for #38 `pi-subagents` has no `/parallel` command and ships `worker`, `reviewer`, `oracle`, `scout` and others. | Users follow commands that do not exist | maintainer | open |
| Layout | The 2026-09-20 plan decided to delete `agents/` and the empty `prompts/` and move the subagent reference into `README.md`; not done. `README.md` and the description in `package.json` still advertise prompts and agents. | Package promises content it does not ship | maintainer | open |
| Footer | The token arithmetic of `lntrx-footer` was reported as wrong in a 2026-09 roadmap; not re-checked against the current code. | Footer may show wrong totals | maintainer | to verify |
| Dependencies | `npm audit` reported two high advisories in `undici`, reached through `@earendil-works/pi-coding-agent` (state 2026-10). Peer dependency, not upgradable here. | None in the kit itself; deliberately not a gate | upstream | watch |
