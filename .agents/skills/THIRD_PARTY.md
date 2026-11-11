# Third-party skills

These skills are copied from upstream and adapted. Each directory keeps the upstream `LICENSE` (MIT).

| Skill | Upstream | Commit |
| :--- | :--- | :--- |
| `verification-before-completion` | `obra/superpowers` `skills/verification-before-completion` | `22f0b463e7a5e579904dd6211a520321035526f7` |
| `systematic-debugging` | `obra/superpowers` `skills/systematic-debugging` | `22f0b463e7a5e579904dd6211a520321035526f7` |
| `test-driven-development` | `obra/superpowers` `skills/test-driven-development` | `22f0b463e7a5e579904dd6211a520321035526f7` |
| `receiving-code-review` | `obra/superpowers` `skills/receiving-code-review` | `22f0b463e7a5e579904dd6211a520321035526f7` |
| `grilling` | `mattpocock/skills` `skills/productivity/grilling` | `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d` |

## Changes against upstream

- Emojis replaced by words: check and cross marks become "Good:" and "Bad:" (or are dropped where "WRONG", "RIGHT", "BEFORE" or "AFTER" already say it), the warning sign becomes "Warning:", the arrow in `grilling` becomes "Recommended:", the question mark and other decorative symbols are removed.
- Em and en dashes replaced by a hyphen-minus.
- Cross-references in the form `superpowers:<name>` point to the skill by plain name. The reference to `writing-skills`, which is not included, is removed.
- `systematic-debugging`: `find-polluter.sh` is not included because it hard-codes `npm test`. The section in `root-cause-tracing.md` that used it now describes the bisection in tool-neutral words.
- `grilling`: the Codex metadata directory `agents/` is not included.

These directories are excluded from markdownlint in `flake.nix`, so their upstream formatting stays unchanged. The em dash hook still checks them. When a skill is added to or removed from this table, change that exclude list as well.

To update a skill, copy the new upstream version, apply the same changes, and update the commit in this table.
