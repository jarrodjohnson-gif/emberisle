# Design: fixes for the rules-audit gaps (issue #82)

Source: [docs/research/rules-audit.md](../research/rules-audit.md). Decisions #97 and #98 follow the official rules.
Every fix lives in `src/lib/game/rules.ts` (the only rules). The host and the browser pick it up unchanged.

## #94 + #97: longest path as a real trail, and ties with no holder

**`roadLength(state, pid)`**: a depth-first search over **corners**, not segments.

```
walk(corner, used):              // used = set of your segment ids already on this trail
  best = 0
  if corner has an opponent building and used is not empty: return 0   // the trail stops here
  for each of your segments s touching corner, s not in used:
    best = max(best, 1 + walk(other end of s, used + s))
  return best
roadLength = max over every corner touching one of your segments of walk(corner, {})
```

- A trail enters a segment at one end and leaves at the other, so a fork is never walked as one line.
- An opponent's building ends a trail at that corner but does not stop a trail that starts there.
- Size: at most 15 segments per player, so the search stays tiny.

**`updateLongest(state)`**:
1. Compute every player's length.
2. If the current holder is still at 5 or more and nobody is strictly longer, they keep it (ties keep it).
3. Otherwise the award goes to the one player who is strictly longest at 5+. If two or more tie for longest, **nobody** gets it (#97).

## #95: an outpost that cuts a path

Call `updateLongest(state)` in `buildOutpost` and `setupSettle` after the building is placed, then `checkWin`
(a cut can hand the award to the builder).

## #96: fortunes bought this turn

- Add `boughtThisTurn: Record<DevKind, number>` to `PlayerState` (all zero in `makePlayer`).
- `buyCard`: also increments `boughtThisTurn[card]`.
- Each `play*` checks `me.hidden[k] - me.boughtThisTurn[k] > 0` instead of `me.hidden[k] > 0`.
- `endTurn`: resets the mover's `boughtThisTurn` to zeros.
- Hidden points (`vp`) are never played, so they are unaffected. The host's `viewFor` redaction also zeroes `boughtThisTurn`
  for other players (it would otherwise leak what they bought).
- `legalFor` in host.mjs uses the same "held since before this turn" count for `play:*` actions.

## #100: no path past an opponent's building

`connectedToNetwork(state, pid, eid)`: an end corner connects if you have a building there, **or** you have a path
there **and** no opponent has a building there.

## Proof (step 3 adds it; step 4 runs it)

`server/rules-prove.mjs`, run by `npm test`, has one check per fix:

| Check | Expect |
|---|---|
| 6-segment star (3 spokes plus 3 ends) | length 4, no award |
| Straight line of 5 | award |
| Two players at 5, no holder | `longestRoad` null |
| Holder at 5, other player reaches 5 | holder keeps it |
| Outpost placed mid-line on the holder's 5 | holder's length drops, award removed |
| Buy a knight, play it the same turn | error |
| Pass, then play it next turn | works |
| Path from a corner holding an opponent's outpost | rejected |
