# #1215: desk-board inbox permission, 2026-10-30

Builder: Codex-p. Model: GPT-6.1 Sol. Parent: Codex-p. Base main: `9a38ae268db9e92894f236f65a940b4e9b3b2f74`. Final source: `3034654`. Usage percentages unavailable.

## Cause and smallest fix

The inbox #699 is an unlocked **pull request**. `desk-board` had `issues: write` for the #916 issue body, but only `pull-requests: read`. Posting an issue-comment endpoint to the inbox PR returned 403 with that token. The working `review-desk-inbox` workflow already uses `pull-requests: write`.

The final workflow changes only that PR scope from read to write. Issues write remains for #916; contents/checks stay read. The script, algorithms, daily cap, deduplication, triggers, concurrency, default-branch trusted checkout, sparse checkout, no persisted credentials, and all other security guards remain unchanged. No new credential, secret, app, review-writing or merge behavior.

## Actual hosted before/after

| Run / job | Actual result |
| --- | --- |
| Historical 41045962562 / 124030000735 | `Issues: write`, `PullRequests: read`; actual inbox POST fails403 `Resource not accessible by integration`. |
| Requested ordinary main dispatch 41096414998 / 124203275280 | Completed/success, but does **not** prove PR posting. Today's inbox already had at least 25 counted wake lines, exceeding the unchanged 24 notification cap, so the write was skipped. |
| Isolated original-scope dispatch 41097047591 / 124205286254 | `Issues: write`, `PullRequests: read`; the explicit signed non-wake inbox POST fails 403, exit 1. No probe comment created. |
| Isolated fixed-scope dispatch 41097275367 / 124206139499 | `Issues: write`, `PullRequests: write`; identical POST succeeds, creating exactly one signed bot comment 6528826702. The unchanged trusted full board sweep also completes/success. |

[The one successful permission probe](https://github.com/jarrodjohnson-gif/emberisle/pull/699#issuecomment-6528826702) starts `Permission probe for #1215`, names the run/model/parent, and is signed `— Codex-p <codex-p@users.noreply.github.com>`. It matches neither `review-desk: ` nor `To desk: desk-board `, so the existing notification-budget regex does not count it. No cap or dedup rule was bypassed or changed, and no extra successful probe was run.

The explicitly authorized hosted probe lives only on the separate branch `codex-p/1215-permission-probe`: original-scope commit `f396f6141cd979a4e7c011a839ee92f49042098c`, then fixed-scope commit `bc39970472d2bcba7b34d9baf06b76bfb152d12b`. Their entire diff is the one permission line. Both use the ordinary `github.token` source, retain the trusted default-branch checkout and run no untrusted code. Token values were never inspected or printed. The final PR branch has no probe step or probe commits. The auxiliary branch is retained as an auditable test record, without a PR.

Full actual logs for all four cases are retained beside this note. The before/after hosted logs record the effective permission headers, failed/successful POST, successful comment ID and final trusted sweep output. No estimated result is used.

## Regression and local checks

- Original `desk-board-prove`: 84 assertions pass.
- An additive guard requiring the workflow's PR write scope fails against the original YAML (exit 1); retained in `missing-pr-write-control.log`.
- Fixed proof: 85 assertions pass. Every original proof line remains in order, including all trust/security checks; no assertion replacement or deletion.
- Typecheck, registered-prove 160, committed-head loosen (one changed proof, none loosened) and whitespace pass. The existing proof remains registered in package.json and CI; no new proof command was added.
- `source-audit.json` verifies the final workflow differs from main only by that permission value, all original proof lines remain, and the script/production/registration/lock diffs are empty. No product source or bundle budget changed; browser and bundle builds are unrelated to this workflow-only fix.

Jarrod's standing finish-one-then-next direction and explicit fifth/sixth-slot authorization, including “Take another one”, authorize reuse of the sixth slot after #1217 merged. Existing #1104/#883/#873/#905/#706 remain untouched. Fresh exact-head CI and independent Claude review remain required. This builder never merges, pushes main, force-pushes or rebases others.

— Codex-p <codex-p@users.noreply.github.com>
