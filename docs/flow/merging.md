# Merging

The auto-merge workflow decides every merge. No chat decides one. The map is [`../DESK.md`](../DESK.md).

`.github/workflows/auto-merge.yml` squashes a PR at its checked head when all of these hold:

- GitHub says the PR merges cleanly (`mergeable` is true);
- `checks` and `loosen` are completed and green on the head;
- the newest review comment is clean at that head, and its reviewer differs from its builder. A docs-only PR under 400 changed lines needs only the clean marker, but in the newest review;
- `needs-owner` is absent and the newest review does not ask for Jarrod's look, or `owner-ok` counts. `owner-ok` counts only when the dispatch thread's `Owner answer` comment carries `<!-- owner-ok: <head SHA> -->` for the PR's head;
- the PR touches no governance file: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.mcp.json`, `README.md`, the rule documents in `docs/` (`docs/flow/`, `docs/OWNER.md` and `docs/DECISIONS-archive.md` included), `.claude/`, `.github/` apart from `workflows/ci.yml`, the merge scripts themselves, and `scripts/loosen-prove.mjs`, `scripts/registered-prove.mjs` and `scripts/size-prove.mjs`. Those merge only on Jarrod's own yes: the `owner-merge` label, below;
- in `.github/workflows/ci.yml` and `package.json` the PR only adds lines. Every new proof is registered there, so adding is allowed. A removed or changed line needs `owner-merge`.

**`owner-merge` is his yes to one rule-file PR.** He taps "merge it" on that PR's card in the project dispatch thread. The thread adds the label, and its `Owner answer` comment carries `<!-- owner-merge: <head SHA> -->`. Only a comment that starts `Owner answer (Desk page` counts, so a review that quotes the marker is not his yes. The prefix is historical: the Desk page is retired, but `scripts/auto-merge-eligible.mjs` reads that exact prefix. The label counts only while that SHA is the PR's head. It lifts only the governance rule above: the checks and the clean review by a different model still apply. Any push to the PR takes it off, with `owner-ok`, `merge-by-chat` and `signal:green`, so he is asked again about the new head. Only the project dispatch thread adds it, to carry his tap or under the standing delegation below. `owner-ok` never stands in for it. He can still merge on GitHub himself. Under his 2026-11-28 standing delegation (`docs/DECISIONS.md`), the project dispatch thread also adds this label without a tap. It adds `owner-merge` only after a clean review at the head by a model other than the builder's. Its comment starts `Owner answer (Desk page, standing delegation 2026-11-28)` and carries the marker. It lists each such PR in its daily list for Jarrod.

Two repo variables switch it off. `AUTO_MERGE` is `on` today; anything else stops all auto-merging, the dispatch thread's hand-over merges included: no PR is green then, a PR that would have merged turns red for Jarrod, and `merge-by-chat` comes off. Setting `AUTO_MERGE_CODE` to `off` stops it for code PRs only, and leaves small docs PRs merging. To re-check one PR, run the auto-merge workflow by hand with its number.

**The workflow can't merge a PR that changes `ci.yml`.** GitHub refuses that to a workflow's own token, and every PR that registers a proof changes `ci.yml`. Only for that refusal, the workflow reads the head again. If it has not moved, the workflow posts `<!-- merge-by-chat: <head SHA> -->` and labels the PR `merge-by-chat`, and the dispatch thread merges it at its next tick ([`dispatcher.md`](dispatcher.md), step 2). A merge made with the workflow token starts no CI run on `main`, so the workflow starts one itself. `pr-signal` removes that label as soon as the PR is no longer green. If Jarrod adds a repo secret `AUTO_MERGE_TOKEN` (a token with the workflows permission), the workflow merges these itself and the label is never used.

Red on `main` after a merge is `prio:p0`. The dispatch thread starts a builder for it first.

## A red `loosen` the owner approved

A PR that replaces check lines under the 2026-10-25 rule in [`../DECISIONS.md`](../DECISIONS.md) keeps `loosen` red, and so does a new size ceiling in `scripts/size-prove.mjs`. Such a PR merges only when Jarrod's `Owner answer` comment names every line `loosen` reported, for the PR's exact head. Each proof file gets one marker on a line of its own:

```
<!-- owner-replaced: {"head":"<head SHA>","file":"scripts/table-menu-prove.mjs","lines":["<old line>"]} -->
```

Each old line is copied exactly from the `loosen` job log, everything after `removed or edited check line: `. A line reported twice is named twice. The marker needs no label. It counts only in a comment that starts `Owner answer (Desk page`, from a trusted account, and only the newest such comment with an `owner-replaced` marker is read. Posting the comment re-checks the PR.

The workflow reads the red `loosen` job's own log for the head. `loosen` counts as met only when all of these hold:

- the head has one `loosen` run, and it completed as a failure;
- the base's copy of `loosen-prove` failed by itself, so the PR's own copy never ran;
- every reason it gave is `removed or edited check line` in a proof file. A lower check count, a new `.skip`, an added `process.exit(0)` or a deleted proof still refuses;
- the log holds one run line and one summary, so a second report can't hide the real one;
- the PR changes no file under `.github/`, old paths of renamed files included. A `pull_request` run uses the PR's own `ci.yml`, which could print a fake report into that log;
- the markers cover every reported line in its own file.

So a PR that replaces check lines and also registers a proof in `ci.yml` has to be split. Land the `ci.yml` change in its own PR first. In the same PR, the marker never counts, even with `owner-merge`, and only Jarrod can merge it on GitHub.

It lifts nothing else. The review, `checks`, the head pin and the governance rule still apply, so a change to `scripts/size-prove.mjs` also needs `owner-merge`. Any push makes the marker stale, because it names one head.
