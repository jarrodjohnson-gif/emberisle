# Research: README rule set vs the engine (issue #81)

- step: 1 Research, node #71 (Make the rules engine match the README rule set)
- date: 2026-09-27
- agent: Claude
- read: README "Rule set"; `src/lib/game/board.ts` (`createGame`); `src/lib/game/rules.ts` (all of it)

Legend: **match** = the code does what the sentence says · **gap** = it does not · **open** = the README does not decide it.
"Proof" names the script that already checks it (`server/*-prove.mjs`); an empty cell means nothing checks it yet.

## Table

| README rule | Code | Verdict | Proof |
|---|---|---|---|
| 3 or 4 players | `createGame`: `total = min(4, max(3, …))` | match | table-prove (3) |
| First to 10 wins | `checkWin`: `totalVP >= 10`, only on your own turn | match | |
| 19 hexes; forest, clay, pasture, fields, mountains, wastes | `hexesInRadius(2)`; 4 timber, 4 wool, 4 grain, 3 clay, 3 ore, 1 waste | match | |
| A token 2–12 on every hex but the wastes; no 7 | `pips` list of 18, no 7; waste gets none | match | |
| The wastes produce nothing | `produce` skips `terrain === "waste"` | match | |
| Path 1 timber 1 clay; outpost T C W G; stronghold 2 ore 3 grain; fortune W G O | `COST` in types.ts | match | |
| Stock 15 paths, 5 outposts, 4 strongholds | `makePlayer`; stronghold returns its outpost to stock | match | |
| Stronghold goes on an outpost you own | `legalCities` | match | |
| Deck 25: 14 knight, 2 path, 2 plenty, 2 monopoly, 5 hidden points | `createGame` deck | match | |
| **A fortune bought this turn cannot be played this turn** | `buyCard` adds to `hidden`; `play*` only checks the count | **gap** | |
| A knight may be played before the roll | `playKnight` allows `roll` phase, returns to `roll` | match | |
| Outpost 1, stronghold 2 | `publicVP` | match | |
| Longest path 2 points, needs 5+ segments | `updateLongest`: `best >= 5` | match, but see the next two rows | |
| **Longest path is a real path** (implied by "segments") | `roadLength` links any two of your paths that share a corner, so a fork is walked as if it were one line | **gap, confirmed** | |
| **A new building can cut an opponent's path** | `roadLength` treats an opponent building as a break, but `buildOutpost` never calls `updateLongest` | **gap** | |
| Largest army 2 points, needs 3+ knights | `updateArmy` | match | |
| A tie does not take either award away | holder is kept on a tie (`updateLongest`, `updateArmy`) | match | |
| Two players tie at 5+ and nobody holds the award yet | `updateLongest` gives it to whoever is first in seat order | **open** | |
| Hidden points stay hidden until the end | engine counts them in `totalVP`; host `viewFor` hides them until `over` | match | table-prove |
| Setup: seat order, then reverse; 1 outpost + 1 path from it | `setupAdvance`, `legalRoads(setup)` uses `lastSetupVertex` | match | prove |
| Only the second outpost pays, 1 card per hex | `grantSecondSettlement` when `setupIndex >= n` | match | prove |
| An outpost must not touch another building, yours included | `distanceOk` | match | table-prove |
| After setup, a new outpost must touch your path | `legalSettle(setup=false)` | match | |
| A path must touch your own path or building | `connectedToNetwork` | match (literally) | |
| A path through an opponent's outpost | allowed: your path that ends at their outpost still counts as touching | **open** (the classic rule forbids it; the README does not say) | |
| The server rolls | `rollDie` uses `crypto`; host only | match | prove (histogram) |
| Matching tokens pay every building unless the wayfarer is there | `produce` skips `blocked` | match | |
| Outpost takes 1, stronghold 2 | `produce` | match | prove |
| Bank short for a resource → nobody gets it | `produce` `short` set | match | prove |
| Then trade, build, buy, play earlier fortunes; pass ends the turn | `main` phase actions, `endTurn` | match (except the fortune gap above) | |
| A seven: more than 7 cards discards half, rounded down | `roll`: `c > 7` → `floor(c / 2)` | match | trade-prove |
| Then the roller moves the wayfarer to a different hex | `applyRobber`: same hex rejected | match | |
| …and may steal one random card from a player with a building there | `stealTargets`, `stealOne` (random) | match | trade-prove |
| 9 docks spaced around the coast | 9 coastal edges spaced by `coastal.length / 9`, 2 corners each (18 dock corners) | match | |
| 5 are 2-for-1 (one per resource), 4 are 3-for-1 | `harborTypes` | match | |
| Dock rate needs your building on one of its corners | `harborRate` via `playerVertices` | match | trade-prove |
| Specific dock beats 3-for-1 beats 4-for-1 | `harborRate` order | match | trade-prove |
| The bank pays only if it has the card | `bankTrade`: `bank[want] <= 0` → error | match | |
| A new game may rotate dock types, never adds docks | types shuffled, positions fixed | match | |
| Bank starts at 19 each | `createGame` | match | |

## The confirmed gap, reproduced

A star of your own paths: three segments out of one corner, each with one more segment on its far end (6 segments).
The longest real path through it is 4 (end, spoke, spoke, end). The engine awards the longest path (needs 5):

```
$ node --import ./register.mjs fork.mjs      (scratch script, not committed)
error: none | a true trail here is at most 4 segments; longestRoad = p0
```

Cause: `roadLength` builds adjacency between *segments* that share an unblocked corner, then does a DFS over segments.
Three segments that meet at one corner are all adjacent to each other, so the DFS walks spoke → spoke → spoke,
which passes through that corner twice. A real path enters a segment at one end and leaves at the other.

## Children filed (Backlog, sub-issues of #71)

- #94 Count the longest path as a real path, not across a fork (confirmed gap)
- #95 Recheck the longest path when a new outpost cuts someone's path
- #96 Block playing a fortune on the turn it was bought
- #97 Decide: who gets the longest path when two players tie at 5+ and nobody holds it yet
- #98 Decide: can a path continue past an opponent's outpost

## Handoff

```
done: one row per README rule; 3 gaps (1 confirmed by script), 2 open questions
left: Design (#82) picks the fix for each gap; Jarrod answers the two Decide issues
next agent: #82
```
