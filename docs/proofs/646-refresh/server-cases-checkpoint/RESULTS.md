# Focused validation results

All positive checks ran in a fresh `git clone --no-local` of the private branch, followed by `npm ci --prefix server` from the server lockfile. Node was v24.19.0 and npm v11.9.0. The final proof run used exact head `ce4ff81dad7fec37faa1fe85337258c4bda8a664`; `npm --prefix server run needs-prove` exited 0 and printed `needs server prove ok` after the four added cases passed.

| Check | Head | Result |
|---|---|---|
| `npm --prefix server run needs-prove` | `ce4ff81` | exit 0; start reset, post-game rejection/state preservation, rematch reset, and bot-owner expiry passed |
| Remove `startGame` need reset | `77d0e4f` | exit 1 at `startGame clears prior needs in the host public seat projection` |
| Remove `rematch` need reset | `77d0e4f` | exit 1 at `rematch clears every previous public need` |
| Permit post-game need ACT | `ce4ff81` | exit 1 at `need ACT after game over is rejected before publishing seat changes` |
| Remove `advanceRoomNeeds` from `runBots` | `77d0e4f` | exit 1 at `the bot need expires on its second own completed turn` |
| `node --check server/needs-prove.mjs` | `ce4ff81` | exit 0 |
| `npm run registered-prove` | `ce4ff81` | exit 0; all 148 proofs registered |
| `npm run loosen-prove` | `ce4ff81` | exit 0; one changed proof against `9bde98614906`, none loosened |

The three controls run at `77d0e4f` cover start reset, rematch reset and bot-owner expiry; those case paths are unchanged by later edits. The post-game mutant passed at predecessor `ce4ff81` with a response filter, but root review found that filter insufficient because it could leave delayed seat frames in the inbox. The current source replaces it with an ordered `ready:false` projection barrier and clears the inbox after that unique projection. Results for that correction are pending and supersede the earlier post-game result. In every prior control, `server/host.mjs` was restored to SHA256 `540ccd1a2e0e259d8547459c01790ef81ed76c32c7435bed7dac9862959aec5e`.

Raw positive, mutation, syntax, registration and loosen outputs are in `logs/`. `server-positive-debug-capture.log` retains the actual post-game error response that was printed by the temporary DEBUG line before it was removed. `candidate-host-start.log` retains the earlier sandbox startup failure.
