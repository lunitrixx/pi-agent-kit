_Mandatory - additions allowed, removal or weakening is not._

- **NEVER open a PR without asking first.** Creating branches and commits is
  fine; only open a PR when explicitly asked.
- **NEVER merge a PR without explicit confirmation.** A green CI run is not the
  same as the change being verified by a real consumer on a real target.
- **Always squash-merge.** The squash commit title must include the PR number
  on the right: `type(scope): summary (#N)`. Use the `merge-pr` skill which
  handles this automatically.
