# Five and six players

Design for [#666](https://github.com/jarrodjohnson-gif/emberisle/issues/666), researched against main at `d6f6ef38c6216eed80025196fbb28924d929ffe2`.
This document proposes implementation contracts; it changes no game behavior.
Names introduced under **Proposed state** do not exist in the source yet.
Jarrod must answer the questions before child issues are filed.

## Scope and owner decisions

- Support three through six seats. Never offer seven or more.
- Include extra cards and distinct seat colours.
- Include watchtowers. Their meaning still needs confirmation.
- Prefer official CATAN colour families initially. Profile colour preferences remain a separate proposal.

Sources: Jarrod's [seat-limit comment](https://github.com/jarrodjohnson-gif/emberisle/issues/666#issuecomment-6225521294)
and [cards-and-colours comment](https://github.com/jarrodjohnson-gif/emberisle/issues/666#issuecomment-6225549530).

## Official rules: identify the edition

The current [2025 rulebook, pages 3–4][current] replaces the older special building phase with paired turns.
The [2021 announcement][announcement] explains the change.
The [older rulebook, pages 3–4][legacy] remains useful for comparing the requested special building phase.
These are alternatives, not phases to combine.

| Rule | Older special building phase | Current paired turns |
|---|---|---|
| Extra actor | Each opponent, clockwise after the normal turn | The seat three places after the primary player |
| Extra actions | Build pieces or buy fortunes | Build, buy fortunes, bank/dock trade, play one eligible fortune |
| Player trades | Forbidden during extra actions | Forbidden for the partner |
| Bank/dock trades | Forbidden during extra actions | Allowed for the partner |
| Fortune play | Forbidden during extra actions | Allowed; cards bought as partner become playable on the next primary activation, and vice versa |
| Production | Normal player only | Primary player only |

Paired turns can end immediately when either actor reaches ten points.
The dice then advance one seat after both actors finish.
Legacy special builders wait for their normal turn to claim victory.
Recommendation: use paired turns for new five/six-seat games, subject to question 1.

### Expanded board and components

Use the same expanded island for five and six players.
The [older component list and layout][legacy] supply the following totals when combined with the base game.
The [current component diagram][current] confirms the additional cards and token frequencies.

| Item | Three/four seats today | Five/six-seat total |
|---|---:|---:|
| Terrain hexes | 19 | 30: timber/wool/grain 6 each, clay/ore 5 each, waste 2 |
| Number tokens | 18 | 28: 2/12 twice each; 3/4/5/6/8/9/10/11 three times each |
| Docks | 9 | 11: five generic 3:1, two wool 2:1, one of each other resource 2:1 |
| Bank supply | 19 per resource | 24 per resource; 120 cards overall |
| Fortune deck | 25 | 34: knight 20, points 5, path/plenty/monopoly 3 each |
| Pieces per seat | 15 paths, 5 outposts, 4 strongholds | Unchanged; six-seat maximum is 90/30/24 |
| Added piece colours | — | Green and brown |

The island has seven staggered rows: 3, 4, 5, 6, 5, 4, 3 hexes.
The extension's tokens replace the base tokens; do not concatenate both sets.
Official variable setup follows a counterclockwise inward letter sequence, skipping both wastes.
Place eleven docks on distinct coastal edges, with two land corners each.
Preserve the documented extra generic and wool docks.
When the wayfarer is enabled, start it on one waste; the second waste starts unblocked.
When disabled, keep both wastes unblocked.
The normal discard threshold remains seven cards.

### Watchtowers

`makeJellyStronghold` in `src/lib/scene/pieces-jelly.ts` already draws a watchtower keep.
The owner approved that silhouette in `docs/design/pieces-jelly-prompt.md`, under **The stronghold**.
Recommendation: reuse that stronghold, including its cost, two points, and four-piece supply.
This interpretation requires confirmation; separate tower mechanics have no approved cost or effect.

## Changes in this repository

### Rules, setup, turns, and scoring

Current anchors: `GameState`, `Phase`, `Action`, and `PlayerState` in `src/lib/game/types.ts`;
`createGame` and `makePlayer` in `src/lib/game/board.ts`;
`setupAdvance`, `rollOffRoll`, `applyActionInternal`, `checkWin`, and `playable` in `src/lib/game/rules.ts`.

`createGame` clamps the player count to four.
`setupAdvance` already derives its snake from `players.length`.
Retain roll-off ordering, winner-first rematches, and goods from the second outpost only.
Verify six-seat setup as 1–2–3–4–5–6–6–5–4–3–2–1.
Do not replace Emberisle's roll-off with the physical game's seating procedure.

**Proposed state:** add a versioned variant descriptor for classic versus expanded games.
Persist its board/supply configuration and selected turn rule before setup.
Store the primary player's identity and the current activation role separately.
Keep `current` as the sole actor permitted to build or roll.
Use a persisted activation counter to distinguish primary and partner opportunities.
These are proposed fields, not source symbols.

For paired turns, primary seat index `i` acts first; partner index `(i + 3) % n` acts next.
Then primary index becomes `(i + 1) % n`, regardless of the partner's index.
Only primary activations roll or resolve production and sevens.
Partners enter the action phase directly and can end it without taking an action.
Reject player offers and acceptances during partner activations, including stale offers.
Close existing offers before either actor changes.

Reset `playedCard` at each actor activation.
Expire that actor's `boughtThisTurn` restriction at their next activation, rather than only a normal-turn ending.
Keep fresh purchases locked during their purchase activation.
Check victory for the acting primary or partner immediately after qualifying actions.
Keep the existing `victoryTarget` option and award thresholds.
Three/four-seat games retain their current turn and card behavior.

If Jarrod selects legacy special building instead, persist an ordered opponent queue and its next normal player.
Allow only piece builds, fortune purchases, and pass in that queue.
Defer a special builder's victory until their normal turn.
Do not implement both expanded turn systems in the first child series.

### Board generator, coast, docks, and camera

Current anchors: `createGame` and `adjacentPips` in `src/lib/game/board.ts`;
`hexesInRadius`, `hexCorners`, `vertexId`, and `edgeId` in `src/lib/game/hex.ts`.

Select an explicit 30-coordinate fixture for expanded games.
Radius three contains 37 hexes and cannot substitute for the extension shape.
Use these axial rows, then center the rendered world bounds:

| `r` | Inclusive `q` range | Hexes |
|---:|---|---:|
| -3 | 1 through 3 | 3 |
| -2 | 0 through 3 | 4 |
| -1 | -1 through 3 | 5 |
| 0 | -2 through 3 | 6 |
| 1 | -2 through 2 | 5 |
| 2 | -2 through 1 | 4 |
| 3 | -2 through 0 | 3 |

Keep coordinate-derived IDs and generate shared vertices and edges through the existing helpers.
Keep the classic seed path unchanged; selecting the expanded variant must be explicit.
Deal the expanded terrain, token, dock, bank, and deck inventories from the table above.
No bank card or piece appears merely because an additional player joins.

For official token placement, encode the checked extension spiral as fixture data.
Record both skipped wastes and the chosen starting corner in the generated board.
Question 6 selects this approach versus Emberisle's existing randomized, red-separated token assignment.
Do not describe the latter as the official letter layout.
Generate docks from a traced boundary, rather than interpolating nine evenly spaced selections.
Assert eleven distinct edges, twenty-two distinct endpoint corners, and the exact dock-type multiset.

`coastLoop` in `src/lib/scene/isle-renderer.ts` independently uses `hexesInRadius(2)`.
`ISLE_HALF`, `COAST`, and `OUTER_RING` in `src/lib/scene/mobile-fit.ts` also assume the classic island.
Feed actual board geometry into coast generation and both camera fits.
Update `fitOrtho` and `fitDiorama` to accept measured extents, including docks and piece height.
Recenter the expanded island before fitting it.
Recheck picking, water/coast effects, harbor placement, and free-view zoom limits against those bounds.
Extra terrain alone is insufficient: the shoreline and projection must expand together.

### Six seats at 440×956

Current anchors: `SeatRail`, `SeatStrip`, `SeatLine`, and `shortNames` in `src/components/game/SeatRail.tsx`;
`playHole` in `src/lib/scene/mobile-fit.ts`.
There is no separate phone-strip source file.

Recommendation: keep one 44-pixel-high strip, with six equal cells and existing four-pixel gaps.
Within 416 available pixels, each cell gets 66 pixels; no second row consumes the board hole.
Each cell keeps its seat identifier, short name, points, and current-actor indicator.
Keep full names and counts accessible through each existing player-menu trigger.
Hide secondary counts before shrinking targets or wrapping the strip.
Use `shortNames` collision handling for six names, including identical initials.
Keep the normal-turn owner distinct from the acting partner in the phase instruction.
For example: “Tide's extra build turn. Trade with the bank or build.”
Do not add another persistent banner or shrink the current map hole.

Desktop keeps the existing rail width and renders six cards vertically.
At short heights, scroll within the rail rather than extending over the hand controls.
Test 440×956, 956×440, 390×844, and 1280×720 with safe-area insets.
Assert six visible, nonoverlapping 44-pixel targets and reachable menus.

### Colours and non-colour identification

Current anchors: `PLAYER_COLORS` and `PLAYER_NAMES` in `src/lib/game/types.ts`;
`SeatDot` in `src/components/game/SeatDot.tsx`; `seatColor` in `server/host.mjs`.

Today's palette is red, blue, cream, and purple.
Recommendation: use six official colour families for new expanded games: red, blue, white, orange, green, and brown.
That adds green/brown and substitutes orange for purple in those new games only.
Keep existing game colours exactly as stored.
Use the classic palette for classic rooms, including restored lobbies.
Do not make changing a display name silently change a seat's colour.

Candidate digital swatches are Emberisle choices, not official CATAN RGB values:

| Family | Candidate |
|---|---|
| Red | `#e23d2e` |
| Blue | `#2d6ee8` |
| White/cream | `#f3ecd9` |
| Orange | `#dd6b20` |
| Green | `#216d3c` |
| Brown | `#805532` |

Keep labels in `#1c1915` on `#efeae0`, measuring 14.61:1 contrast.
Seat swatches remain indicators, never small coloured text.
Keep the dark outline on light pieces and the light rim on dark pieces.
Extend seat identification with stable seat numbers 1–6, beside colour indicators and in accessible names.
Repeat the identifier on piece bases and player-menu headings.
Colour uniqueness alone does not distinguish red/green or orange/brown under colour-vision deficiencies.
Reject duplicate palette slots on the host; do not accept arbitrary similar hex values.
Profile first/second colour preferences are deferred to the profile design, with host-assigned unique fallback slots.

`scripts/contrast-prove.mjs` currently exercises four colours and cannot certify this proposed palette.
Extend its winner, rail, menu, and chip cases to all six.
Run `npm run contrast-prove` on the implemented palette, plus simulated colour-vision and grayscale screenshots.
Require 4.5:1 for small text and 3:1 for meaningful indicator boundaries against their immediate background.
Do not claim new rendered colours pass before those checks exist.

### Lobby and network limits

Current anchors in `server/host.mjs`: `openTable`, `sitDown`, `startGame`, `addBot`, `rematch`, and `seatColor`.
Client anchors: `Lobby` in `src/components/game/Lobby.tsx`;
`TableClient` in `src/lib/net/table.ts`; `PROTO` in `src/lib/net/proto.ts`.

Send the selected classic or expanded variant with the host's room-opening request.
Freeze it before `openTable` assigns the first seat, including the host's colour.
Expanded rooms start with five or six seats; classic rooms retain three/four limits.
Changing variants requires creating another room; never evict seats or recolour an existing room.
Enforce the room's capacity in joins, bot additions, game start, and rematch.
Use the room's palette for peek responses and taken-colour validation.
Never auto-fill a five-human game to six.
An expanded rematch requires five or six participating seats and retains its expanded board.
Validate that count before removing disconnected seats or replacing the finished game.
If fewer than five remain, refuse without changing the finished game or its seats.
Players may return to the lobby to recruit seats or create a separate classic room.

Advertise an expanded-rules capability during hello, join, watch, and rejoin.
Refuse incompatible clients before sending expanded state; show an update instruction while preserving their saved seat.
Keep old clients usable in classic rooms.
`PROTO` currently permits older protocol versions; increasing its constant alone cannot enforce expanded support.
Gate every admission path, including spectators and persisted-seat rejoin.
Keep player hands private in `viewFor` and `watchView`.
Public variant, role, and actor metadata may be shared; private fortunes and deck order may not.

`waitedOn`, `armTurns`, and `turnOut` must follow the actual actor, including partner activations.
Reuse configured inactivity windows and persist the remaining deadline.
Do not reset a turn budget by reconnecting or restarting during an extra activation.
Keep simultaneous discard waits separate from build opportunities.

### Bots and local modes

Current anchors: `chooseBotAction` and `chooseRecoveryAction` in `src/lib/game/ai.ts`;
`runBots` in `server/host.mjs`; `startAi`, `startHotseat`, and `playAgain` in `src/lib/game/store.ts`.

Let bots occupy any permitted seat without requiring six humans.
Pass the persisted role to action selection; partner bots may bank trade but never offer player trades or roll.
Legacy special builders, if selected instead, may neither bank trade nor play fortunes.
Make an unaffordable or blocked bot pass so an extra activation cannot loop forever.
Keep disconnected-human forced moves distinct from discretionary bot building.
Exercise every seat index as primary, partner, discard victim, and reconnecting human.
If local modes are approved, expose five/six-seat selectors while keeping the existing default practice game.
Use the same variant descriptor and transition code locally and online.
Extend `PLAYER_NAMES` with two unique defaults; never create an undefined bot name or reuse the fallback red colour.

### Save, restart, and rejoin compatibility

Current anchors: `ROOM_SHAPE`, `snapshot`, `load`, and `takeOver` in `server/host.mjs`;
`savedSeat` in `src/lib/game/store.ts`.

`ROOM_SHAPE` is currently 2; `load` deletes room files carrying a different shape.
Therefore, merely bumping the constant would violate this issue's compatibility requirement.
Implement an explicit shape-2 reader before changing the writer.
Recommended writer version: shape 3, with atomic migration after successful validation.
Treat unknown future formats as unsupported; retain their files for recovery rather than deleting them.

- Shape-2 games and lobbies become classic without regenerating boards, decks, colours, hands, or player identities.
- Preserve existing seat secrets, room codes, deadlines, host identity, and rejoin holds.
- Keep today's restart behavior: restored human lobby seats become unready and remain held for rejoin.
- Persist expanded geometry, inventories, turn role, primary owner, activation counter, and fortune purchase eligibility.
- Preserve game options such as `wayfarerMode` and `victoryTarget`.
- Replace all three `recoveryPids` truncations to four with bounds appropriate to the actual room.
- Rematches preserve the room variant; they never reinterpret an old game because six colours now exist.
- An absent variant in legacy local state means classic; never infer an expanded game from the new global maximum.

Validate before committing migration; a failed conversion must preserve the original file.
Restart halfway through both primary and partner activations, with purchases and an outstanding discard.
Rejoin seats five and six with their original secrets and remaining timers.
Resume saved three/four-seat fixtures from main and compare exact boards, hands, deck order, colours, and progress.
If durable local game saves are added separately, give them the same explicit legacy default.
The current client stores seat recovery credentials; that is not a durable local game snapshot.

## Questions for Jarrod

Recommendations are proposals, not approvals.
Reply with numbered choices on #666.

1. Recommended: current official paired turns. Use that, or the older special building phase described above?
2. Recommended: five/six seats online and in hotseat, with optional expanded practice; keep today's practice default.
   Enable all three modes, or online only initially?
3. Recommended: watchtowers mean today's stronghold keep, with unchanged cost, points, and supply.
   Is that the intended meaning, or do you want a separate piece and rule?
4. Recommended: official six colour families for expanded games, with fixed seat identifiers and no profile chooser yet.
   Approve those families, or choose a contrasting alternative such as yellow/black?
5. Recommended: the extension's official token spiral for expanded games; retain today's classic generator.
   Use that, or keep randomized red-separated token placement on both board sizes?

## Child implementation specifications, after decisions

These are proposed deliverables, not a live task queue.
No child issues have been filed.
Each row becomes one S-sized issue and PR with its own proof.
Each child rechecks active file reservations before claiming work.

| Lane | Proposed child | Deliverable and completion proof | Size |
|---|---|---|---|
| `lane:rules` | Variant data and board inventory | Create 30-hex fixtures and expanded supplies; prove topology, token/dock counts, six unique seats, and classic-seed parity. | S |
| `lane:rules` | Expanded turn state | Implement the approved actor sequence; prove five/six-seat cycles, permissions, purchase cooldowns, and immediate win behavior. | S |
| `lane:rules` | Expanded bot policy | Prove legal extra actions, pass when blocked, mixed human/bot completion, and termination across seeded five/six-seat games. | S |
| `lane:board` | Expanded coast and camera | Derive shoreline, docks, and camera bounds from geometry; prove every extreme coast corner fits and remains pickable. | S |
| `lane:hud` | Six-seat identity | Implement the approved palette, stable identifiers, and six-cell strip; prove touch targets, collision-free names, and contrast. | S |
| `lane:hud` | Extra-turn controls and local selectors | Show the actual actor and legal controls; prove hotseat/practice selection and primary/partner interaction where approved. | S |
| `lane:net` | Compatible room persistence | Add validated shape-2 migration and expanded snapshots; prove unchanged classic restoration and fifth/sixth-seat recovery after restart. | S |
| `lane:net` | Expanded lobby and admission | Enforce capacity, unique palettes, and client capabilities; prove joins, watchers, bots, start, rematch, and old-client behavior. | S |
| `lane:net` | Actor timers and end-to-end play | Prove six-tab setup, both activation roles, discard privacy, countdown continuity, finish, and rematch against the host. | S |

Ship rules and save compatibility before enabling expanded lobbies.
Land board/HUD support before admitting expanded clients.
Wire each implementation proof into package scripts and CI when those shared files become available.

## Validation boundary

This PR validates source references, rules citations, inventory arithmetic, and question/child requirements.
Runtime acceptance remains part of the child specifications above.
Use existing classic proofs as regression gates, then extend them with five/six-seat fixtures.
The CI workflow treats this single documentation file as docs-only.

[current]: https://www.catan.com/sites/default/files/2025-03/CN3082%20CATAN%20%E2%80%93%205-6%20Rulebook%202025%20reduced.pdf
[legacy]: https://www.catan.com/sites/default/files/2021-08/catan_5-6_basegame_rules.pdf
[announcement]: https://www.catan.com/catan-fans/news/catan-universe-5-6-player-extension-new-rule-now-available
