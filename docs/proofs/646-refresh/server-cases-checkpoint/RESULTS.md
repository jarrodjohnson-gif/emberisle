# Focused validation results

Validation used a fresh `git clone --no-local` of private branch `codex-p/873-server-cases` at code head `685acf7d9ddb4d9401e812e98d40e7e8ca96c03d`, followed by `npm ci --prefix server` from the server lockfile. Node was v24.19.0 and npm v11.9.0. The final positive command was run three times, each exiting 0 and printing `needs server prove ok` after the four added cases passed.

| Check | Code head | Result |
|---|---|---|
| `npm --prefix server run needs-prove` (3 runs) | `685acf7` | All exited 0; start reset, post-game rejection/state preservation, rematch reset, and bot-owner expiry passed |
| Remove `startGame` need reset | `77d0e4f` | Exit 1 at `startGame clears prior needs in the host public seat projection` |
| Remove `rematch` need reset | `77d0e4f` | Exit 1 at `rematch clears every previous public need` |
| Permit post-game need ACT | `685acf7` | Exit 1 at `need ACT after game over is rejected before publishing seat changes` |
| Remove `advanceRoomNeeds` from `runBots` | `77d0e4f` | Exit 1 at `the bot need expires on its second own completed turn` |
| `node --check server/needs-prove.mjs` | `685acf7` | Exit 0 |
| `npm run registered-prove` | `685acf7` | Exit 0; all 148 proofs registered |
| `npm run loosen-prove` | `685acf7` | Exit 0; one changed proof against `9bde98614906`, none loosened |

The three `77d0e4f` controls cover source paths unchanged at the validated code head. The post-game mutation was rerun at the validated head after adding the causal `ready:false` seat-projection barrier. In every control, `server/host.mjs` was restored to SHA256 `540ccd1a2e0e259d8547459c01790ef81ed76c32c7435bed7dac9862959aec5e` before proceeding.

Raw positive, mutation, syntax, registration and loosen outputs are in `logs/`. `server-positive-debug-capture.log` retains the actual post-game error response printed by the temporary DEBUG line before it was removed. `candidate-host-start.log` retains the earlier sandbox startup failure.
