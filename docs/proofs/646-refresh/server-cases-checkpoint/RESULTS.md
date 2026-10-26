# Focused validation results

The original four-case validation used a fresh clone at `685acf7d9ddb4d9401e812e98d40e7e8ca96c03d`, followed by locked `npm ci --prefix server`. The takeover lifecycle validation used a fresh clone at `e0da09e5d4d97ca7dbeeb2c3def5d971c3593c36`, with the same lockfile install. Node was v24.19.0 and npm v11.9.0.

| Check | Code head | Result |
|---|---|---|
| `npm --prefix server run needs-prove` (3 runs) | `685acf7` | All exited 0; start reset, post-game rejection/state preservation, rematch reset, and bot-owner expiry passed |
| `npm run --prefix server needs-prove` | `778fce3` old runtime | Exit 1 at takeover clear; grace/rejoin passed and p0 became a bot, advanced to p1, but public need remained `['ore']` |
| `npm run --prefix server needs-prove` | `e0da09e` | Exit 0; grace retention, pre-takeover same-secret rejoin, takeover public clear, persisted clear, and same-seat return passed |
| Remove only `seat.needs = undefined` in `takeOver` | `e0da09e` | Exit 1 at the intended takeover-clear assertion; actual `['ore']`, expected `[]` |
| Remove `startGame` need reset | `77d0e4f` | Exit 1 at `startGame clears prior needs in the host public seat projection` |
| Remove `rematch` need reset | `77d0e4f` | Exit 1 at `rematch clears every previous public need` |
| Permit post-game need ACT | `685acf7` | Exit 1 at `need ACT after game over is rejected before publishing seat changes` |
| Remove `advanceRoomNeeds` from `runBots` | `77d0e4f` | Exit 1 at `the bot need expires on its second own completed turn` |
| `node --check server/needs-prove.mjs` | `685acf7` | Exit 0 |
| `npm run registered-prove` | `685acf7` | Exit 0; all 148 proofs registered |
| `npm run loosen-prove` | `685acf7` | Exit 0; one changed proof against `9bde98614906`, none loosened |

The three `77d0e4f` controls cover source paths unchanged at the original validated code head. The post-game mutation was rerun at that head after adding the causal `ready:false` seat-projection barrier. Those four controls restored `server/host.mjs` to SHA256 `540ccd1a2e0e259d8547459c01790ef81ed76c32c7435bed7dac9862959aec5e`. The takeover mutation restored it to the final hash `5efb5bff449a39dbea21a6505d0f73f034de9caa224ab4db1052e5f9b8503046`.

Raw positive, mutation, syntax, registration and loosen outputs are in `logs/`. `server-positive-debug-capture.log` retains the actual post-game error response printed by the temporary DEBUG line before it was removed. `candidate-host-start.log` retains the earlier sandbox startup failure.
