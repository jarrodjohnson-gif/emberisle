# PR #883 narrow ARIA follow-up

Parent builder: Codex-p (GPT-6.1 Sol), continuing the existing #831 claim. Luna (GPT-6 Luna) contributed only the bounded, nonvisual tab-to-panel ARIA fix and its proof assertions. No layout, labels, styling, behavior, dependency, lockfile, or design changed.

## Commits

- `b018e59a887079c67c706cd7c6cf0cdbf7387047` adds assertions to the existing registered `trade-tabs-prove` proof.
- `3c5f8bccac9f08d54061cbac83b77ca9245fbbee` gives the one rendered route panel the stable ID `trade-route` and points both tabs to it. `aria-labelledby` still names the active tab.

Both commits were pushed normally to the existing `codex/831-option-a-complete` branch. Their author and committer are Codex-p <codex-p@users.noreply.github.com>.

## Fail-first result

The proof-only change was run against the old runtime. The registered command exited 1 at the new assertion because the inactive Bank tab's target did not exist. The exact Playwright output came from the tool transcript rather than a redirected shell log; see `old-runtime-tool-transcript.md`. A first sandboxed server start separately stopped at `listen EPERM` before browser launch. Re-running with the reviewed local-process permission succeeded; the initial error was a sandbox permission limit, not a network outage.

## Frozen validation

The source was cloned with `git clone --no-local` at exact runtime commit `3c5f8bccac9f08d54061cbac83b77ca9245fbbee`, then installed with `npm ci` under Node 24.19.0. The passing serial Playwright log is `trade-tabs.log`.

- `npm run trade-tabs-prove`: exit 0; six viewport and motion contexts, including the new assertions.
- `npm run typecheck`: exit 0.
- `npm run registered-prove`: exit 0; all 147 proofs registered.
- `node scripts/loosen-prove.mjs --base beafd405d6be29c7f25dd8c99fed8750b5b184e9`: exit 0; three changed proofs, none loosened. This is the PR merge base.
- `npm run build`: exit 0.
- `node scripts/size-prove.mjs --base /workspace/emberisle/work/p-luna883-main52bd`: exit 0 against a fresh build of actual `main` at `52bd2df30981d944f8c1d3596299db7731c8982c`.

The two size baselines are distinct: the PR merge base is `beafd405d6be29c7f25dd8c99fed8750b5b184e9`; the actual main size baseline is `52bd2df30981d944f8c1d3596299db7731c8982c`. All chunks remain within their existing ceilings and growth allowances. No allowance changed.

Against actual main, the index measured 124361 B on main and 124338 B on the PR (-23 B); sheets measured 7119 B and 7289 B (+170 B); `BankTradePicker` measured 1.46 kB gzip against its unchanged 1.65 kB ceiling. The complete measured comparison is in `validation.log`.

Fresh independent Opus review and the owner's design decision remain pending. This follow-up makes no design or owner-acceptance claim.

— Codex-p; parent:Codex-p
