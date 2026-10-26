# Checkpoint status

- Scope: finish the interrupted server-proof continuation for existing PR #873.
- Private branch: `codex-p/873-server-cases`.
- Validated code head: `685acf7d9ddb4d9401e812e98d40e7e8ca96c03d`.
- Original base: `76ceddf43db9f48e369aab3427ed6e9695d9236e`.
- Server runtime: unchanged; `server/host.mjs` SHA256 stayed `540ccd1a2e0e259d8547459c01790ef81ed76c32c7435bed7dac9862959aec5e` through every temporary mutation.
- Fresh no-local clone, `npm ci --prefix server`, then focused server proof: exit 0 on three consecutive runs.
- All four temporary mutants exited 1 at their intended assertions; see the provenance below.
- `node --check server/needs-prove.mjs`: exit 0.
- `npm run registered-prove`: exit 0, all 148 proofs registered.
- `npm run loosen-prove`: exit 0, one changed proof against `9bde98614906`, none loosened.
- No broad server suite or browser suite was run in this continuation.

## Mutation provenance

The start reset, rematch reset and bot-owner expiry controls ran in a fresh clone at `77d0e4f7316e4b1c3f91074cbbc884e4ef117c24`. Each exited 1 at its named new assertion. The bot seat-projection count was captured after the first bot turn and checked after the explicit second-own-turn expiry assertion, preserving the original count predicate while keeping the failure at the expiry assertion. Those case paths are unchanged at the validated code head.

The post-game guard control ran in a fresh clone at the validated code head `685acf7d9ddb4d9401e812e98d40e7e8ca96c03d`. Before the ACT, the test sends the real `ready:false` message and awaits the matching public seat projection. It verifies the existing `grain` need, then clears all queued frames and sends the post-game need ACT. This ordered barrier prevents a delayed initial seat projection from being mistaken for the response while preserving the assertion that the rejected ACT sends no seat update. The mutant exited 1 at that post-game rejection assertion.

For every mutant, the temporary host edit was restored byte-for-byte and its SHA256 matched the original. The final positive proof ran three times at the validated code head and passed each time.

## Earlier environment/setup attempt

Before the reviewed listening permission was used, the default sandbox rejected the host's `0.0.0.0` bind with `EPERM` before any case assertion. The output is kept in `candidate-host-start.log`. That shell command used `tee` without `pipefail`, so its pipeline status was 0 and npm's separate exit status was not captured. The child host's exit 1 appears in the log. No fixture edits were made in response to that environment failure.

## Remaining integration gates

This private branch has not been merged into the live #873 branch. Root will integrate it normally and rerun the focused server proof against the latest main behavior, including the newer rematch-listing assertions. The independent review and existing owner-pictures acceptance remain separate PR #873 gates.
