# #1101 size-delta fixture row

Proof-only. `scripts/size-prove.mjs` is unchanged: index allowance stays `400 + 480` (880 B), the index ceiling stays 125200 B, and the TradeSlot ceiling stays 1000 B.

| File | Old | New | Why |
|---|---|---|---|
| `scripts/fixtures/size/*.json` | No `TradeSlot` key. `size-prove` exits 1 with `FAIL TradeSlot: no chunk named`. | Every fixture includes `"TradeSlot": 800` (under the 1000 B ceiling, same on base and PR, growth 0). `base-old.json` still omits `VictoryTargetSelect`. `base-with-legacy.json` still has `legacy`. | The one-PR TradeSlot ceiling is already in `size-prove`. The self-test fixtures never named that chunk, so every case failed before the growth lines ran. |
| `scripts/size-delta-prove.mjs` pass case | Expects `allowance 400 B` on `+300 B`. | Expects `allowance 880 B` on the same `+300 B`. | The expected line now matches the approved `400 + 480` exception. The allowance in `size-prove.mjs` did not move. |
| `scripts/fixtures/size/fail.json` and its expected line | Index `122600` (`+600 B`) expected to fail as `allowance 400 B (200 B over)`. After 880 B, `+600 B` is inside the allowance, so that case would pass. | Index `123080` (`+1080 B`) must exit 1 with `allowance 880 B (200 B over)`. | The over-allowance case stays a real failure, 200 B over the approved exception. No ceiling or allowance number changed. |
