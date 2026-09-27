# L15.1 — README rule set against the engine

- step: 1 Research (issue #81, level #71)
- date: 2026-09-27
- agent: Claude

## What I read

README.md "Rule set" (lines 26-78: Land, Pieces, Points, Setup, A turn, A seven, Docks, Bank).
`src/lib/game/rules.ts` (all of `applyAction` and every `legal*`/helper function), `src/lib/game/board.ts`
(`createGame`), `src/lib/game/types.ts` (`COST`, `RESOURCES`, `DevKind`). `server/host.mjs` (`viewFor`,
the `pass`→`endTurn` mapping, the knight-availability check). The four existing proofs that touch rules:
`server/prove.mjs`, `server/trade-prove.mjs`, `server/table-prove.mjs`, `server/net-prove.mjs`,
`server/harden-prove.mjs` (read in full, not just grepped).

## What is true

One row per rule sentence/clause. **Proof** is Y only where an existing script makes an explicit
assertion on that exact behavior — not just "a game ran and this code path executed."

### Intro

| # | README rule | Code | Match/GAP | Proof |
|---|---|---|---|---|
| 1 | Three or four players | board.ts:165 `Math.min(4, Math.max(3, humans.length+bots))` | Match | N |
| 2 | First to 10 points wins | rules.ts:243-250 `checkWin` (`totalVP >= 10`) | Match | N — no proof plays a game to completion |
| 3 | One island of 19 hexes | board.ts:73 `hexesInRadius(2)` (19 cells) | Match | N |

### Land

| # | README rule | Code | Match/GAP | Proof |
|---|---|---|---|---|
| 4 | 6 terrains: forest/clay hills/pasture/fields/mountains/wastes | board.ts:74-84 (4 timber, 4 wool, 4 grain, 3 clay, 3 ore, 1 waste = 19); types.ts:25-32 `TERRAIN_LABEL` | Match | N |
| 5 | A token 2-12 on every hex except the wastes | board.ts:95 pips `[2,3,3,4,4,5,5,6,6,8,8,9,9,10,10,11,11,12]` assigned only to `land` (non-waste) hexes, one each | Match | N |
| 6 | There is no 7 token | Same pips array — no `7` in it | Match | N |
| 7 | The wastes produce nothing | rules.ts:278 `produce()` skips `h.terrain === "waste"` (also always `blocked`, board.ts:92) | Match | N |

Bonus, not a README rule either way: board.ts:54-62 `adjacentPips` reshuffles up to 40 times so two 6/8
tokens never sit next to each other. Harmless fairness extra, not a spec violation.

### Pieces

| # | README rule | Code | Match/GAP | Proof |
|---|---|---|---|---|
| 8 | Path: 1 timber, 1 clay; 15 to start | types.ts:38 `COST.path`; board.ts:48 `pathsLeft: 15` | Match | N |
| 9 | Outpost: 1 timber, 1 clay, 1 wool, 1 grain; 5 to start | types.ts:39; board.ts:49 `outpostsLeft: 5` | Match | N |
| 10 | Stronghold: 2 ore, 3 grain, on an outpost you own; 4 to start | types.ts:40; rules.ts:483 `legalCities` (must own an `outpost`); board.ts:50 `strongholdsLeft: 4` | Match | N |
| 11 | Fortune: 1 wool, 1 grain, 1 ore; shared deck of 25 | types.ts:41 `COST.card`; board.ts:172-181 deck length 14+5+2+2+2=25 | Match | N |
| 12 | Deck is 14 knight, 2 path-building, 2 plenty, 2 monopoly, 5 hidden points | board.ts:172-181 | Match | N |
| 13 | **A fortune bought this turn cannot be played this turn** | rules.ts:494-504 `buyCard` stores the card with no turn stamp; rules.ts:505-577 (`playKnight`/`playRoad`/`playPlenty`/`playMonopoly`) only check `state.playedCard` (one-fortune-per-turn) and the hidden count, never when the card was acquired | **GAP** | N |
| 14 | A knight may be played before the roll | rules.ts:508 `state.phase !== "roll" && state.phase !== "main"` — "roll" phase is exactly "waiting to roll" | Match | N |

Row 13 is the real gap from #71's "known gaps." A player can `buyCard` then immediately `playKnight` /
`playRoad` / `playPlenty` / `playMonopoly` in the same turn today. Left for #82 to design the fix — the
fix has to key off "this player's turn" (roll phase through their own `endTurn`), not "this roll", since
row 14 legitimately lets a knight bought on an *earlier* turn be played in the current roll phase.

### Points

| # | README rule | Code | Match/GAP | Proof |
|---|---|---|---|---|
| 15 | Outpost = 1, stronghold = 2 | rules.ts:227-236 `publicVP` | Match | **Y** — server/prove.mjs:47-54 (bank-of-3 case pays outpost 1, stronghold 2 — production amount, not VP directly, but exercises the same kind check) |
| 16 | Longest path = 2, needs ≥5 segments **in one real trail** | rules.ts:157-187 `roadLength` (rewritten in #99, merged after this row was first written — see correction below), 233 (`+2`) | **Was a confirmed gap, now fixed** | **Y** — server/rules-prove.mjs (star of 6 → trail 4, no award) |
| 17 | Largest army = 2, needs ≥3 knights | rules.ts:220-225 `updateArmy`, 234 (`+2`) | Match | N |
| 18 | A tie does not take either award away; a tie with no holder gets it | rules.ts:189-197 `updateLongest` (holder keeps it on a tie; a tie with nobody currently holding it goes to nobody, decided in #97/#99); rules.ts:224 (army: `>` not `>=`, so a tie never replaces the holder) | Match | **Y** — server/rules-prove.mjs (holder keeps a tie; two players tied with no holder → nobody) |
| 19 | Hidden points stay hidden until the end | server/host.mjs:101-118 `viewFor` zeroes every other seat's `hidden` (and sends only a `fortunes` total) while `phase !== "over"` | Match | N (no proof script touches `viewFor`) |

### Setup

| # | README rule | Code | Match/GAP | Proof |
|---|---|---|---|---|
| 20 | Seat order, then the reverse | rules.ts:252-272 `setupAdvance` (`goingBack` mirrors the index for the second `n` steps) | Match | N |
| 21 | One outpost + one path from it, per turn | rules.ts:255-256, 390-401 `setupRoad`; rules.ts:127-131 `legalRoads` setup case requires touching `lastSetupVertex` | Match | N |
| 22 | Only the second outpost pays starting goods | rules.ts:345-349 `setupOrderNote`, 300-309 `grantSecondSettlement` | Match | **Y** — server/prove.mjs:73-99 (`firstRound` goods all 0, `secondRound` all >0) |
| 23 | An outpost must not touch another building, including your own | rules.ts:78-82 `distanceOk` (checks the vertex and every neighbor, regardless of owner) | Match | **Y** — server/prove.mjs:101-115 (re-placing on an occupied vertex is rejected); the neighbor-distance half is exercised by `table-prove.mjs`'s "setup glow and neighbor rule" per the README Tests table |
| 24 | After setup, a new outpost must touch one of your paths | rules.ts:116-118 `legalSettle` (non-setup branch) | Match | N |
| 25 | A path must touch your own path or building | rules.ts:88-97 `connectedToNetwork` | Match | N |

### A turn

| # | README rule | Code | Match/GAP | Proof |
|---|---|---|---|---|
| 26 | Roll two dice, the server rolls | rules.ts:7-14 `rollDie` (`crypto.getRandomValues`, not the seeded board RNG) | Match | **Y** — server/prove.mjs:56-71 (600-roll histogram, sum 7 lands 80-120 times) proves the dice are real 2d6, not that the client can't influence it (that's `tabs-prove.mjs`, which only ever reads `state.dice`) |
| 27 | Sums pay every building on that hex, unless the wayfarer is there | rules.ts:274-298 `produce` (`h.blocked` skips the robber's hex) | Match | N |
| 28 | Outpost takes 1, stronghold takes 2 | rules.ts:284 | Match | **Y** — server/prove.mjs:47-54 |
| 29 | If the bank can't pay everyone for a resource, nobody gets it | rules.ts:289-297 (`short` set, computed before any grant) | Match | **Y** — server/prove.mjs:37-45 |
| 30 | Then: trade, build, buy, and play fortunes bought earlier | `state.phase === "main"` gates `buildPath/buildOutpost/buildStronghold/buyCard/bankTrade/offerTrade` and the `play*` cases | Match, modulo row 13 | N |
| 31 | Pass ends the turn | rules.ts:629-641 `endTurn`; server/host.mjs:298-299 maps client message `{type:"pass"}` → `{type:"endTurn"}` | Match | N |

### A seven

| # | README rule | Code | Match/GAP | Proof |
|---|---|---|---|---|
| 32 | >7 cards discards half, rounded down | rules.ts:410-416 `Math.floor(c / 2)` | Match | **Y** — server/trade-prove.mjs:32-58 (8 cards → must discard exactly 4; 3 is rejected) |
| 33 | Wayfarer moves to a different hex | rules.ts:328 `applyRobber` rejects `hexId === state.robberHex` | Match | N |
| 34 | May steal one random card from a player with a building there | rules.ts:141-153 `stealTargets`, 311-321 `stealOne` (uniform over the victim's actual cards) | Match | **Y** — server/trade-prove.mjs:60-77 (steal moves exactly 1 card) proves the transfer; randomness itself is untested (the victim in that test holds only one card) |

The client always sends `stealFrom: null` today (`pickHex` in `store.ts`), so with 2+ targets nothing is
stolen even though the engine supports choosing. That is a client gap, already filed as **#92** from the
#91 review — not re-filed here.

### Docks

| # | README rule | Code | Match/GAP | Proof |
|---|---|---|---|---|
| 35 | 9 docks, on the coast, spaced around the island | board.ts:140-161: `coastal` = edges touching exactly 1 hex, sorted by angle; loop `for (i=0;i<9;i++)` picks 9 of them at `step = coastal.length/9` apart | Match | N |
| 36 | You do not get one for sitting down | rules.ts:99-109 `harborRate` only reads vertices where you actually have a `building` | Match | N |
| 37 | 5 are 2-for-1, one per resource | board.ts:149-152 `harborTypes` has one each of timber/clay/wool/grain/ore | Match | N |
| 38 | 4 are 3-for-1, any resource | board.ts:149-152 has 4 `"any"` | Match | N |
| 39 | You get the rate only from a building on one of the dock's two corners | board.ts:157-160 marks **both** `va` and `vb` of each of the 9 dock edges with that harbor kind | Match | N |
| 40 | Otherwise the bank is 4-for-1 | rules.ts:108 `harborRate` default `return 4` | Match | **Y** — server/trade-prove.mjs:4-30 (all harbors nulled, 4 wool → 1 ore; 3 wool rejected) |
| 41 | Specific dock beats 3-for-1, 3-for-1 beats the bank | rules.ts:99-109 (`specific` checked before `any` before the `4` default) | Match | N — no proof exercises an actual harbor; trade-prove.mjs deliberately zeroes them all |
| 42 | A new game keeps nine docks and may rotate types; never adds docks or grants a personal 2-for-1 | board.ts:149 `shuffle(harborTypes, rand)` reorders a fixed 9-item array; nothing keys a rate off player identity | Match | N |

**#71's second "known gap" — 18 harbor vertices — is not a bug.** 9 docks × 2 corners each = 18 marked
vertices, which is exactly rule 39 ("one of the dock's two corners"). I re-read board.ts:140-161 looking
for a reason the count would be wrong (an off-by-one in the `step` spacing, two docks landing on the same
edge, a vertex getting two harbor kinds) and found none: the 9 loop iterations pick 9 distinct edges
(`coastal.length` for a 19-hex board is 30, so `step≈3.33` and `Math.round(i*step)` never repeats), and
`if (va && !va.harbor)` means no vertex is overwritten. **#82 does not need to touch docks.**

### Bank

| # | README rule | Code | Match/GAP | Proof |
|---|---|---|---|---|
| 43 | The bank starts with 19 of each resource | board.ts:201 `{ timber:19, clay:19, wool:19, grain:19, ore:19 }` | Match | N |

## Correction (added after #99 merged)

Row 16 as first written here said "Match" for longest-path — wrong. I'd only read `roadLength` and
reasoned about it; I never constructed a case where 3+ of a player's own segments meet at one corner.
A second, independent session (issue #81 was claimed concurrently by three sessions — see #103) did
construct that case, found that the old segment-adjacency DFS could chain all three spokes of a star
through their shared corner as if it were one line, and shipped a tested fix in #99 (now merged): walk
corner to corner instead, so a trail can only pass through a given corner as part of one continuous
route. I reproduced the pre-fix bug myself before trusting it — a 6-segment star (3 spokes, each with one
more segment) got awarded Longest Road on old `main`, when the real longest trail through it is 4 — then
confirmed the fix. Rows 16 and 18 below are corrected to match reality instead of my first read of the code.

The lesson for future Research steps here: read the code for a graph/topology rule, then also construct
the adversarial topology (a fork, a loop, a tie) and run it, rather than stopping at "the logic looks
right."

## Gaps found

One rules gap remains open, already known from #71:

1. **Row 13 — a fortune bought this turn can be played this turn.** `buyCard` (rules.ts:494-504) never
   records the turn a card was acquired, and every `play*` case only checks `state.playedCard` (already
   played *a* fortune this turn) and the hidden count. #99's `docs/design/rules-fixes.md` already designed
   this fix (its own #96) — track which of a player's hidden fortunes were bought during their *current
   turn* (roll phase through their own `endTurn`, not "this roll" — row 14 must keep working) — so
   Implementation (#83) can build it directly from that design rather than #82 redesigning it.

One rules gap was found and fixed during this node (see Correction above):

2. **Row 16 — longest path counted a fork as one line.** Fixed in #99, merged to `main`. No further
   action needed here.

Not a gap: **the docks/harbor count is correct.** #71's second listed gap does not reproduce — see the
Docks section above.

Test-coverage gaps for #83/#84 to close (engine looks correct by inspection, nothing asserts it yet): the
specific 2:1/3:1 harbor rates (rows 37-38, 41 — trade-prove.mjs zeroes all harbors on purpose), deck/bank
starting counts (rows 12, 43), and reaching exactly 10 points to end a game (row 2). Longest-path/largest-
army (rows 16-18) are now covered by server/rules-prove.mjs, added in #99.

## What I am not sure about

- rules.ts:517-519 (`playKnight`) has a dead `if (state.phase === "roll") { /* comment only */ }` block —
  `applyRobber` already forces `phase = "main"` via `afterRobber`, and the very next line
  (`if (prev.phase === "roll") state.phase = "roll"`) is what actually restores it. Behavior is correct
  (traced by hand), the empty branch is just leftover. A cleanup nit for whoever next touches that
  function, not worth its own issue.
- Whether `hasCost`/`pay` (rules.ts:33-44) round-trip correctly when `COST` has a `0` or missing key for a
  resource — not exercised by anything I read, and no README line depends on it either.

## Handoff

```
done: docs/research/L15-rules-audit.md — every "Rule set" sentence has a row (43 rows). One gap remains
      open (row 13, fortune same-turn play; design already written in #99's docs/design/rules-fixes.md).
      One gap this doc first missed (row 16, longest-path fork) was found and fixed by a concurrent
      session in #99, merged; rows 16/18 corrected above instead of silently rewritten. #71's docks
      gap disproven, not real.
left: #83 Implementation for row 13, from #99's existing design (no new Design step needed — #82's design
      work is done). #83/#84 can also seed server/rules-prove.mjs's remaining coverage from the
      "Test-coverage gaps" list above.
next agent: #83
```
