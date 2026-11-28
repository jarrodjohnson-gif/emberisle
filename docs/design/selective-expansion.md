# Design: table pieces (selective expansion, issue #843)

Design only. Owner idea, 2026-10-18. No code in this step, and no change to the wire protocol or to hidden information.

Jarrod chose two pieces on 2026-10-19 (option 1 of the candidate list on #843): **Beacon docks** and **New fortunes**. Each is a lobby toggle, off by default. Both are original to Emberisle: the names, the effects and the art.

This doc supersedes draft [#853](https://github.com/jarrodjohnson-gif/emberisle/pull/853). That draft ranked six candidates. Four were not chosen and are listed at the end.

Sources: [docks.md](docks.md) and [../HARBORS.md](../HARBORS.md) (dock layout), [wayfarer-modes.md](wayfarer-modes.md) (a rule fixed per table), [six-players.md](six-players.md) (the five and six seat island), `src/lib/game/rules.ts` (`heldRates`, `harborRate`, `bankTrade`), `src/lib/game/fortunes.ts`, README "Docks" and "Fortunes".

## Shared contract

| Rule | Contract |
|---|---|
| Name | "Table pieces". Not "expansion": the 5 and 6 seat island already uses "expanded" in code and the protocol. |
| Default | Every piece is Off. With both Off, the game matches today's rules and the same seed deals the same board and deck. |
| Where | The host lobby, next to the target and number-token controls. Practice and hotseat get the same two rows in their setup, as Wayfarer does. |
| Who | Host only. Guests see the chosen pieces in the lobby, read-only. |
| When | Changeable in the lobby. Fixed at Start. Rematch keeps them. A new table changes them. |
| Combine | The two pieces combine with each other, with Wayfarer On or Off, and on both the classic and the five and six seat island. |
| Turn | "Turn" below means one activation. On the classic island that is a turn. On the five and six seat island it is each primary or partner activation, so a paired round has two. |
| Saves | Two booleans on the room and on game state. A save without them plays Off. |
| Hidden information | No change. Opponents still see only a fortune count. New cards are new kinds of the same hidden hand. |

## Piece 1: Beacon docks

**Idea.** One of the `any` docks becomes a Beacon: a lantern pier that trades 2-for-1 on any good, once per turn.

**Rules**

- The Beacon takes the place of one 3-for-1 dock. The classic island goes from four 3-for-1 docks to three plus the Beacon. The five and six seat island goes from five to four plus the Beacon. The 2-for-1 docks stay as they are.
- A seat holds the Beacon the same way it holds any dock: a building on one of its two corners.
- With the Beacon, a bank trade of any good costs 2 instead of the seat's usual rate. The seat may use it once per turn (one activation).
- Once it is spent, the seat's other docks still apply. The turn's second trade pays the best other rate.
- A seat that holds a specific 2-for-1 dock for the good it gives gets no extra from the Beacon. The Beacon never goes below 2.

**Which `any` dock.** The first `any` dock in the coast walk order. This needs no new random draw. So the Off deal and the deck order stay byte for byte the same. A seed gives the same board On and Off apart from that one dock.

**Art.** A lantern pier with a soft cream lamp. It must read as different from the 2-for-1 jetties and the 3-for-1 boat at 440x956. The art brief is an implementation child.

| Cost | Where | Size |
|---|---|---|
| Rules | `harborRate` needs the per-turn state. `heldRates` already returns a list, so the Beacon adds a 2 while unspent. | Small |
| State | One flag per seat. It clears in `endTurn` on the classic island and in `pairedStep` (`src/lib/game/expanded.ts`) on the five and six seat island, which never calls `endTurn`. | Small |
| Server | A `beacon` harbor kind, the dock swap at deal, and the flag on room and game state. | Small |
| Bots | `ai.ts` calls `harborRate`. It must spend the Beacon on the first trade of the turn only. | Small |
| UI | One dock badge, one rate chip in the trade list, one line when the turn's use is spent. | Medium |

**Risk.** Low. It adds no board graph rule and touches no award.

## Piece 2: New fortunes

**Idea.** Four new fortune cards. The card list is pending the owner's answer to the open Question on the PR. It is written to my recommendation. Each has one sentence of effect and needs no hidden information beyond the card itself.

| Card | Effect |
|---|---|
| Second harvest | Pick a hex you have a building on. Take what your buildings there would get if its token rolled: 1 per outpost, 2 per stronghold. A blocked hex pays nothing. A good the bank lacks is skipped. |
| Harbor favor | Until the end of this turn (activation) your bank rate is at best 3-for-1, with no dock needed. It never raises a better rate. |
| Storm cellar | Until the start of your next activation you do not discard on a seven. Everyone sees the shield on your seat. |
| Steady hand | Take 1 good of your choice from the bank. If the bank lacks it, take nothing. |

Three rules from today's deck apply unchanged: a card bought this turn waits for a later turn, one fortune is played per turn, and the bank only pays what it holds.

**Deck.** The four cards replace four wayfarer entries in the list before the shuffle, one copy each. The deck length and the number of draws stay the same, and the new cards are not biased toward the top. Swapping after the shuffle would bias them early. The deck stays 25 on the classic island and the 5 points cards stay 5. On the five and six seat island the wayfarer count drops by four the same way. Largest army still needs 3 and stays reachable. Adding the cards on top is the other option; see the Question.

**Why these four.** They use only public state: the bank, the board and the dice. No card peeks at a hand, a deck or a hidden point.

- Scout glass became Second harvest. The draft's own text drifted toward peeking at a hidden map, so it now pays a hex you already touch.
- Muster drum is gone. It adds to the army without moving the wayfarer, which changes who can win largest army.
- Second wind is gone. It overlaps the existing path fortune, which already lays two free paths.
- Storm cellar and Steady hand are new. Both use only public state.

The draft #853 set is the other option in the Question.

**Art.** The same fortune card chrome with four new icons. Names appear in the tray and the seat menu breakdown, from `FORTUNES` in `src/lib/game/fortunes.ts`.

| Cost | Where | Size |
|---|---|---|
| Rules | Four card kinds, four play handlers, the shield flag read in the discard step. The shield and Harbor favor clear in `endTurn`, and in `pairedStep` on the five and six seat island. | Medium |
| State | `hidden` and `boughtThisTurn` gain four kind keys. A saved hand without them reads 0. | Small |
| Server | The deck swap at deal, and the play actions for the new kinds. | Medium |
| Bots | Play rules for four cards, with a rule each for when not to play. | Medium |
| UI | Four tray rows, four log lines, the shield mark on a seat. | Medium |
| Size | The `fortunes` chunk has a 600 B ceiling at 543 B today. Four rows will not fit. Decided: the four rows go in a new lazy chunk, loaded only when the piece is On, with its own ceiling. | Small |

**Risk.** Low if each effect stays one sentence. The deck swap changes how often a wayfarer shows up, so a playtest must check largest army.

## Off must match today

- Same seed, both pieces Off: the same board, docks, deck order and bot choices as main.
- No new random draw when Off. The Beacon takes a fixed dock slot. The deck swap changes list entries before the shuffle.
- A client or save from before the pieces reads them as Off.

## Wire note for the implementation issues

This doc changes no message. The build does, in additive ways only: two lobby flags like `setVictoryTarget`, two flags in `welcome`, `state` and `seats` (guests read lobby options from `seats`), and new `card` values in `play`. An older page cannot draw a Beacon or a new card. The build must refuse an older client at a table with a piece On, as the five and six seat island does with `caps`. The planner tiers those children, not this doc.

## Proofs for the build

- `dock-rates-prove` and `bot-harbor-prove` keep passing, and a new proof covers the Beacon: once per turn, cleared in `endTurn` and in `pairedStep`, never below 2, never raising a better rate.
- A host proof for the four cards, each with its bank-empty and blocked-hex edge, and one for the shield on a seven. A paired-game proof checks that each activation gets its own Beacon use and that the flags clear in `pairedStep`.
- An Off regression: a fixed seed with both Off equals main's board and deck.
- Persistence: a save with the flags On survives a restart and a rematch. A legacy save plays Off.
- Two-tab online and a practice game with each piece On.

## Not chosen

Left in the backlog. None is scheduled.

| Piece | One line | Why not now |
|---|---|---|
| Tide lanes | Paths on shallow sea edges. | Touches the path graph that drives longest path. |
| Squall deck | A shared event deck flipped after a seven. | Timing beside the wayfarer and the turn timer is easy to get wrong. |
| Drift isles | Small offshore hexes. | Needs Tide lanes and a new board generator. |
| Ember lookouts | A 0-point lookout piece. | Weak without fog of war ([#842](https://github.com/jarrodjohnson-gif/emberisle/issues/842)). |

## Out of scope

- Copying any published expansion's names, cards or art.
- Player-written cards.
- Changing the 10-point default win target.

## Implementation children (file after the owner answers)

1. Lobby rows and the "Table pieces" layout, with a mock. A new control is a look question for Jarrod.
2. Beacon docks: rules, deal, bots, art, proofs.
3. New fortunes: rules, deck swap, bots, tray rows, proofs.
4. Playtest: Off regression, then each piece On in practice and online.

Each child needs a lane, a tier, a prio and a completion test. The planner files them.
