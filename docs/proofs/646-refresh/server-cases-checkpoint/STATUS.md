# Checkpoint status

- Scope: finish the interrupted server-proof continuation for existing PR #873.
- Private branch: `codex-p/873-server-cases`.
- Code head with final focused positive run: `ce4ff81dad7fec37faa1fe85337258c4bda8a664`.
- Original base: `76ceddf43db9f48e369aab3427ed6e9695d9236e`.
- Server runtime: unchanged; `server/host.mjs` SHA256 remained `540ccd1a2e0e259d8547459c01790ef81ed76c32c7435bed7dac9862959aec5e` through temporary mutations.
- Positive focused server proof: exit 0 on a fresh no-local clone after `npm ci --prefix server`.
- Negative controls: all four mutants fail at their intended assertions; host source is restored byte-for-byte after each.
- `node --check server/needs-prove.mjs`: exit 0.
- `npm run registered-prove`: exit 0, all 148 proofs registered.
- `npm run loosen-prove`: exit 0, one changed proof against `9bde98614906`, none loosened.
- No broad server suite or browser suite was run in this continuation.

## Mutation provenance

The start reset, rematch reset and bot-owner expiry controls ran in the fresh clone at `77d0e4f7316e4b1c3f91074cbbc884e4ef117c24`. Each exited 1 at its named new assertion. The bot seat-projection count was captured after the first bot turn and checked after the explicit second-own-turn expiry assertion, preserving the original count predicate while keeping the failure at the expiry assertion.

The post-game guard control ran again in the fresh clone at `ce4ff81dad7fec37faa1fe85337258c4bda8a664`, after adding a predicate that ignores delayed unchanged seat projections and accepts only the error or the changed `ore` projection. It exited 1 at the intended post-game rejection assertion. Root review found that this could leave delayed frames in the inbox and weaken the no-broadcast check. The current fixture replaces that filter with a causal barrier: it toggles the real seat's `ready` flag, awaits the matching public seat projection, verifies the prior `grain` need, then clears the inbox before the post-game ACT. This preserves the no-seat-update assertion and adds no wait. Final verification of this barrier is pending.

## Earlier environment/setup attempt

Before the reviewed listening permission was used, the default sandbox rejected the host's `0.0.0.0` bind with `EPERM` before any case assertion. The output is kept in `candidate-host-start.log`. That shell command used `tee` without `pipefail`, so its pipeline status was 0 and npm's separate exit status was not captured. The child host's exit 1 appears in the log. No fixture edits were made in response to that environment failure.

## Remaining integration gates

This private branch has not been merged into the live #873 branch. Root will integrate it normally and rerun the focused server proof against the latest main behavior, including the newer rematch-listing assertions. The independent review and existing owner-pictures acceptance remain separate PR #873 gates.
