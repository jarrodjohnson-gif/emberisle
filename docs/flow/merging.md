# Merging

The auto-merge workflow decides every merge. No chat decides one. The map is [`../DESK.md`](../DESK.md).

`.github/workflows/auto-merge.yml` squashes a PR at its checked head when all of these hold:

- GitHub says the PR merges cleanly (`mergeable` is true);
- `checks` and `loosen` are completed and green on the head;
- the newest review comment is clean at that head, and its reviewer differs from its builder. A docs-only PR under 400 changed lines needs only the clean marker, but in the newest review;
- `needs-owner` is absent and the newest review does not ask for Jarrod's look, or `owner-ok` counts. `owner-ok` counts only when the clerk's `Owner answer` comment carries `<!-- owner-ok: <head SHA> -->` for the PR's head;
- the PR touches no governance file: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.mcp.json`, `README.md`, the rule documents in `docs/` (`docs/flow/`, `docs/OWNER.md` and `docs/DECISIONS-archive.md` included), `.claude/`, `.github/` apart from `workflows/ci.yml`, the merge scripts themselves, and `scripts/loosen-prove.mjs`, `scripts/registered-prove.mjs` and `scripts/size-prove.mjs`. Those merge only on Jarrod's own yes: the `owner-merge` label, below;
- in `.github/workflows/ci.yml` and `package.json` the PR only adds lines. Every new proof is registered there, so adding is allowed. A removed or changed line needs `owner-merge`.

**`owner-merge` is his yes to one rule-file PR.** He taps "merge it" on that PR's card on the Desk page. The clerk adds the label, and its `Owner answer` comment carries `<!-- owner-merge: <head SHA> -->`. Only a comment that starts `Owner answer (Desk page` counts, so a review that quotes the marker is not his yes. The label counts only while that SHA is the PR's head. It lifts only the governance rule above: the checks and the clean review by a different model still apply. Any push to the PR takes it off, with `owner-ok`, `merge-by-chat` and `signal:green`, so he is asked again about the new head. No agent adds it except the clerk carrying his tap, and `owner-ok` never stands in for it. He can still merge on GitHub himself.

Two repo variables switch it off. `AUTO_MERGE` is `on` today; anything else stops all auto-merging, the dispatcher's hand-over merges included: no PR is green then, a PR that would have merged turns red for Jarrod, and `merge-by-chat` comes off. Setting `AUTO_MERGE_CODE` to `off` stops it for code PRs only, and leaves small docs PRs merging. To re-check one PR, run the auto-merge workflow by hand with its number.

**The workflow can't merge a PR that changes `ci.yml`.** GitHub refuses that to a workflow's own token, and every PR that registers a proof changes `ci.yml`. Only for that refusal, the workflow reads the head again. If it has not moved, the workflow posts `<!-- merge-by-chat: <head SHA> -->` and labels the PR `merge-by-chat`, and the dispatcher merges it at its next tick. A merge made with the workflow token starts no CI run on `main`, so the workflow starts one itself. `pr-signal` removes that label as soon as the PR is no longer green. If Jarrod adds a repo secret `AUTO_MERGE_TOKEN` (a token with the workflows permission), the workflow merges these itself and the label is never used.

Red on `main` after a merge is `prio:p0`. The dispatcher starts a builder for it first.
