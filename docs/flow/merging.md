# Merging

The auto-merge workflow decides every merge. No chat decides one. The map is [`../DESK.md`](../DESK.md).

`.github/workflows/auto-merge.yml` squashes a PR at its checked head when all of these hold:

- `checks` is completed and green on the head;
- the newest review comment is clean at that head, and its reviewer differs from its builder. A docs-only PR under 400 changed lines needs only the clean marker;
- `needs-owner` is absent and the newest review does not ask for Jarrod's look, or `owner-ok` is present;
- the PR touches no governance file: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.mcp.json`, `README.md`, the rule documents in `docs/` (`docs/flow/`, `docs/OWNER.md` and `docs/DECISIONS-archive.md` included), `.claude/`, `.github/` apart from `workflows/ci.yml`, and the merge scripts themselves. Those merge only on Jarrod's own yes: the `owner-merge` label, below. `ci.yml` is allowed because every new proof is registered there, so the reviewer checks that no job in it was weakened.

**`owner-merge` is his yes to one rule-file PR.** He taps "merge it" on that PR's card on the Desk page. The clerk adds the label, and its `Owner answer` comment carries `<!-- owner-merge: <head SHA> -->`. The label counts only while that SHA is the PR's head. It lifts only the governance rule above: the checks and the clean review by a different model still apply. Any push to the PR takes the label off, so he is asked again about the new head. No agent adds it except the clerk carrying his tap, and `owner-ok` never stands in for it. He can still merge on GitHub himself.

Two repo variables switch it off. `AUTO_MERGE` is `on` today; anything else stops all auto-merging, the dispatcher's hand-over merges included: no PR is green then, a PR that would have merged turns red for Jarrod, and `merge-by-chat` comes off. Setting `AUTO_MERGE_CODE` to `off` stops it for code PRs only, and leaves small docs PRs merging. To re-check one PR, run the auto-merge workflow by hand with its number.

**The workflow can't merge a PR that changes `ci.yml`.** GitHub refuses that to a workflow's own token, and every PR that registers a proof changes `ci.yml`. The workflow then labels the PR `merge-by-chat`, and the dispatcher merges it at its next tick. `pr-signal` removes that label as soon as the PR is no longer green. If Jarrod adds a repo secret `AUTO_MERGE_TOKEN` (a token with the workflows permission), the workflow merges these itself and the label is never used.

Red on `main` after a merge is `prio:p0`. The dispatcher starts a builder for it first.
