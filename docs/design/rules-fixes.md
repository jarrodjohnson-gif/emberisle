# Design: fix for the rules-audit gap (issue #82)

Source: [docs/research/L15-rules-audit.md](../research/L15-rules-audit.md), row 13. That research is the
full re-check of every README "Rule set" sentence against `rules.ts`/`board.ts`; it found exactly **one**
real gap. Its second candidate from #71 (18 harbor vertices) is disproven in the same note — 9 docks × 2
corners each is correct, so **this design does not touch docks.**

The one gap is already tracked as its own leaf bug, **#96** ("Block playing a fortune on the turn it was
bought"), with its own Deliverable and Completion test. This design is the technical spec #83
(Implementation) builds from; #96 stays the tracker issue for that Implementation step.

## The gap

`buyCard` (rules.ts:494-503) adds the drawn card to `me.hidden[card]` with no record of *when* it was
acquired. Every `play*` case (`playKnight` 505-524, `playRoad` 525-549, `playPlenty` 550-561,
`playMonopoly` 562-577) only checks `me.hidden[card] > 0` (do I hold one at all) and `state.playedCard`
(have I already played a fortune this turn). Nothing stops playing a card bought moments earlier in the
same turn.

The fix must key off **this player's current turn** (their roll phase through their own `endTurn`), not
"this roll" — row 14 of the research (a knight bought on an earlier turn may legally be played before the
current roll) is existing, correct behavior and must keep working.

## The fix

**`PlayerState` (types.ts:69-80):** add a field next to `hidden`:

```ts
boughtThisTurn: Record<DevKind, number>;
```

**`makePlayer` (board.ts, next to the existing `hidden: { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 }`
at board.ts:46):** initialize `boughtThisTurn` the same way, all zero.

**`buyCard` (rules.ts:500, right after `me.hidden[card] += 1`):** also do
`me.boughtThisTurn[card] += 1`.

**Every `play*` case:** change the "do I hold one" check from `me.hidden.X <= 0` to
`me.hidden.X - me.boughtThisTurn.X <= 0` — i.e. require at least one copy held since before this turn.
Concretely:
- `playKnight` (rules.ts:507): `me.hidden.knight - me.boughtThisTurn.knight <= 0`
- `playRoad` (rules.ts:527): `me.hidden.road - me.boughtThisTurn.road <= 0`
- `playPlenty` (rules.ts:552): `me.hidden.plenty - me.boughtThisTurn.plenty <= 0`
- `playMonopoly` (rules.ts:564): `me.hidden.monopoly - me.boughtThisTurn.monopoly <= 0`

Playing a card still only decrements `me.hidden[...]` (unchanged). `boughtThisTurn[...]` is **not**
decremented on play — it only marks how many of the currently-held cards are still "new"; a played card
always comes from the pre-existing (non-`boughtThisTurn`) pool because the play is rejected otherwise, so
the counts stay consistent without touching `boughtThisTurn` on play.

**`endTurn` (rules.ts:629-641):** reset the acting player's counter — `me.boughtThisTurn = { knight: 0,
road: 0, plenty: 0, monopoly: 0, vp: 0 }` — alongside the existing `state.playedCard = false`. Once their
turn ends, every card they hold was, by definition, held since before their *next* turn, so the whole
record can zero out rather than tracking per-card ages.

Hidden points (`vp`) are counted in `boughtThisTurn` for consistency but are never played by any `play*`
case, so this has no visible effect.

**`server/host.mjs`:**
- `legalFor` (line 95) currently gates the `play:${card}` button on `me.hidden[card] > 0`. Change to
  `me.hidden[card] - me.boughtThisTurn[card] > 0` so the button doesn't appear for a card that would be
  rejected.
- `viewFor`'s redaction branch (lines 108-116) zeroes `hidden` for every seat but your own. Add
  `boughtThisTurn: { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 }` to that same redacted object so a
  client can't infer what an opponent bought this turn from the raw state.

## Proof (#83 adds it; #84 runs it)

One check, matching #96's own completion test:

| Check | Expect |
|---|---|
| Buy a knight, play it the same turn | error ("No wayfarer cards.") |
| Pass (`endTurn`), then play that same knight next turn | works |
| A knight bought on an earlier turn, played before the current roll | still works (row 14, unchanged) |

## What this design does not do

- No change to docks/harbors — #71's second candidate gap is disproven in L15-rules-audit.md.
- No change to longest-path, largest-army, or trade code — the research found those rows all `Match`.
