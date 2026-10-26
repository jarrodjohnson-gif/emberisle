# Checkpoint status

- Scope: preserve the interrupted server-proof additions for existing PR #873.
- Source: `server/needs-prove.mjs` only, plus this evidence note.
- Base: `76ceddf43db9f48e369aab3427ed6e9695d9236e`.
- Added cases: start reset, post-game rejection, rematch reset, bot-owner turn expiry.
- Validation: **unverified**; no confirmed passing output or mutation results retained for these additions.
- Existing baseline log: `/tmp/p873-main/fresh/server-needs.log`, 2026-10-26 01:22 UTC, covers the prior server proof only.
- No runtime changes, broad tests, or mutation runs in this checkpoint.
- Next: review the cases and run focused validation when directed; keep the historical pass from the earlier proof separate.

## First candidate attempt

On 2026-10-26, `npm --prefix server run needs-prove 2>&1 | tee /tmp/p873-server-cases-candidate.log` stopped before the first real-host case. Host startup failed at `server/host.mjs:1718` with `listen EPERM: operation not permitted 0.0.0.0` (Node v24.19.0). No proof assertion ran and no fixture change or mutation was made.

The command was piped through `tee` without `pipefail`, so the tool reported the pipeline status as 0; npm's exit status was not captured separately. The child host's exit 1 is printed in the raw output. No retry was attempted. The raw output is preserved in `candidate-host-start.log`.

## Mutation-control adjustment in progress

On the fresh clone, the start reset, rematch reset, and post-game guard mutants each failed at their targeted new assertions. The `runBots` mutant initially tripped the new seat-notification count assertion before reaching the bot-expiry assertion. I moved that assertion after the explicit second-own-turn expiry assertion while capturing its original count value immediately after the first bot turn. This preserves the count predicate and lets the negative control demonstrate the intended expiry failure. This fixture-only assertion ordering change still needs fresh-clone positive and mutation verification.
