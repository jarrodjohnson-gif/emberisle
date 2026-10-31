# Five and six players

Design for [#666](https://github.com/jarrodjohnson-gif/emberisle/issues/666), researched against main at `d6f6ef38c6216eed80025196fbb28924d929ffe2`.
Code anchors were refreshed against main at `a180cc8d796d730737e0ada570869dd715db60fe` on 2026-10-31.
This document proposes implementation contracts; it changes no game behavior.
Names introduced under **Proposed state** do not exist in the source yet.
Jarrod accepted seven decisions on 2026-10-31; see **Accepted decisions**.
Four small questions remain open about the rematch prompt; see **Open questions for Jarrod**.

## Scope and owner decisions

- Support three through six seats. Never offer seven or more.
- Include extra cards and distinct seat colours.
- Include watchtowers. Accepted: a watchtower is the existing stronghold.
- Use the official six CATAN colour families. Profile colour preferences pick from the room's palette (accepted decision 6).

Sources: Jarrod's [seat-limit comment](https://github.com/jarrodjohnson-gif/emberisle/issues/666#issuecomment-6225521294)
and [cards-and-colours comment](https://github.com/jarrodjohnson-gif/emberisle/issues/666#issuecomment-6225549530).

## Official rules: identify the edition

The current [2025 rulebook, pages 3–4][current] replaces the older special building phase with paired turns.
The [2021 announcement][announcement] explains the change.
The [older rulebook, pages 3–4][legacy] remains useful for comparing the requested special building phase.
These are alternatives, not phases to combine.

| Rule | Older special building phase (not used) | Current paired turns |
|---|---|---|
| Who gets extra actions | Each opponent, clockwise after the normal turn | The partner: the seat three places after the primary player |
| Allowed extra actions | Build pieces or buy fortunes | Build, buy fortunes, bank/dock trade, play one eligible fortune |
| Player trades | Forbidden during extra actions | Forbidden for the partner |
| Bank/dock trades | Forbidden during extra actions | Allowed for the partner |
| Fortune play | Forbidden during extra actions | Allowed; cards bought as partner become playable on the next primary activation, and vice versa |
| Production | Normal player only | Primary player only |

Paired turns can end immediately when the primary player or partner reaches the victory target.
A victory ends the game at once. The dice never advance, and a pending partner activation never starts.
Otherwise the dice advance one seat after both players finish.
Legacy special builders wait for their normal turn to claim victory.
Accepted: use paired turns for new five/six-seat games.
The older special building phase is not used.

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
Terrain stays random per game: the seed shuffles all 30 terrain hexes, as `createGame` does today.
Place eleven docks on distinct coastal edges, with two land corners each.
Preserve the documented extra generic and wool docks.
When the wayfarer is enabled, start it on one waste; the second waste starts unblocked.
When disabled, keep both wastes unblocked.
The normal discard threshold remains seven cards.

### Watchtowers (existing strongholds)

`makeJellyStronghold` in `src/lib/scene/pieces-jelly.ts` already draws the stronghold with a tower silhouette.
The owner approved that silhouette in `docs/design/pieces-jelly-prompt.md`, under **The stronghold**.
Accepted: a watchtower is the existing stronghold, with the same cost and two points.
The rest of this document says "stronghold" only.
The per-seat supply stays four strongholds, as the official component list gives.

## Changes in this repository

### Rules, setup, turns, and scoring

Current anchors: `GameState`, `Phase`, `Action`, and `PlayerState` in `src/lib/game/types.ts`;
`createGame` and `makePlayer` in `src/lib/game/board.ts`;
`setupAdvance`, `rollOffRoll`, `applyActionInternal`, `checkWin`, and `playable` in `src/lib/game/rules.ts`.

`createGame` clamps the player count to four (`src/lib/game/board.ts:196`).
`setupAdvance` already derives its snake from `players.length`.
Retain roll-off ordering, winner-first rematches, and goods from the second outpost only.
Verify six-seat setup as 1–2–3–4–5–6–6–5–4–3–2–1.
Do not replace Emberisle's roll-off with the physical game's seating procedure.

**Proposed state:** add a versioned variant descriptor for classic versus expanded games.
Persist its board/supply configuration and selected turn rule before setup.
Store the primary player's id and the activation role (primary or partner) as new fields.
Use a persisted activation counter to distinguish primary and partner activations.
These are proposed fields, not source symbols.

`current` always names the seat that may act now, as it does today.
During a partner activation, `current` holds the partner's id, not the primary player's.
The new primary field keeps the primary player's id for the phase instruction and dice order.
So `applyActionInternal` keeps its single `state.current !== actor` check for turn actions.
`legalFor` already returns nothing for a seat that is not `current`, except a seat that owes a discard.
Partner activations never create discards, because partners never roll.

For paired turns, the primary player at `players` position `i` acts first.
The partner at position `(i + 3) % n` acts next.
The partner's `endTurn` makes the player at position `(i + 1) % n` the new primary player and `current`.
Increase `turn` only when the primary position wraps to zero.
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

The older special building phase is not used (accepted decision 1).
Build no opponent queue and no second turn system.

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

Accepted: the official extension token spiral is the default for expanded games.
Encode the checked extension spiral as fixture data, starting from each of the island's six corner hexes.
The game seed picks the starting corner and the spiral direction.
The classic official layout in `createGame` already picks both from the seed this way.
That classic branch runs only when `hexes.length === 19`, so expanded games need their own branch.
Record both skipped wastes and the chosen starting corner in the generated board.
The random token layout stays a setting (`numberTokens: "random"`).
Source: decision `q1141-default`, as cited in Jarrod's comment 6540477629 on #709.
Do not describe the random layout as the official letter layout.
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
Each cell keeps its seat identifier, short name, points, and a marker on the `current` seat.
Keep full names and counts accessible through each existing player-menu trigger.
Hide secondary counts before shrinking targets or wrapping the strip.
Use `shortNames` collision handling for six names, including identical initials.
Name the primary player and the partner separately in the phase instruction.
For example: “Tide's partner turn. Trade with the bank or build.”
Do not add another persistent banner or shrink the current map hole.

Desktop keeps the existing rail width and renders six cards vertically.
At short heights, scroll within the rail rather than extending over the hand controls.
Test 440×956, 956×440, 390×844, and 1280×720 with safe-area insets.
Assert six visible, nonoverlapping 44-pixel targets and reachable menus.

### Colours and non-colour identification

Current anchors: `PLAYER_COLORS` and `PLAYER_NAMES` in `src/lib/game/types.ts`;
`SeatDot` in `src/components/game/SeatDot.tsx`; `seatColor` in `server/host.mjs`.

Today's palette is red, blue, cream, and purple.
Accepted: use the six official colour families for new expanded games: red, blue, white, orange, green, and brown.
That adds green/brown and substitutes orange for purple in those new games only.
Keep existing game colours exactly as stored.
Use the classic palette for classic rooms, including restored lobbies.
Do not make changing a display name silently change a seat's colour.

Candidate digital swatches are Emberisle choices, not official CATAN RGB values:

| Family | Candidate |
|---|---|
| Red | `#e23d2e` |
| Blue | `#2d6ee8` |
| White | `#f3ecd9` |
| Orange | `#dd6b20` |
| Green | `#216d3c` |
| Brown | `#805532` |

Keep labels in `#1c1915` on `#efeae0`, measuring 14.61:1 contrast.
Seat swatches remain indicators, never small coloured text.
White measures 1.02:1 and orange 2.83:1 against `#efeae0`, below the 3:1 rule.
Give white and orange rail swatches a 1-pixel `#1c1915` outline.
The outline measures 14.61:1 against `#efeae0`, 14.85:1 against white and 5.17:1 against orange.
Keep the dark outline on light pieces and the light rim on dark pieces.
Give each seat a stable seat identifier: a number from 1 to 6.
It never changes during a game or across a rematch.
Show the seat identifier beside its colour indicator and in accessible names.
Repeat the seat identifier on piece bases and player-menu headings.
Colour uniqueness alone does not distinguish red/green or orange/brown under colour-vision deficiencies.
Reject duplicate palette slots on the host; do not accept arbitrary similar hex values.
Favourite and backup profile colours pick from the room's own palette (accepted decision 6).
A preferred colour missing from a classic room falls back to the first free slot, as `seatColor` does today.

`scripts/contrast-prove.mjs` currently exercises four colours and cannot certify this proposed palette.
Extend its winner, rail, menu, and chip cases to all six.
Run `npm run contrast-prove` on the implemented palette, plus simulated colour-vision and grayscale screenshots.
Require 4.5:1 for small text and 3:1 for meaningful indicator boundaries against their immediate background.
Do not claim new rendered colours pass before those checks exist.

### Lobby and network limits

Current anchors in `server/host.mjs`: `openTable`, `sitDown`, `startGame`, `addBot`, `rematch`, and `seatColor`.
Today's four-seat caps sit in `sitDown` and `addBot` (`room.seats.length >= 4`) and `startGame` (`n > 4`).
`rematch` refuses fewer than three live seats.
Client anchors: `LobbyView` in `src/components/game/LobbyView.tsx`, whose start check is at line 77;
`Lobby` in `src/components/game/Lobby.tsx` is now a lazy-loading wrapper around it;
`TableClient` in `src/lib/net/table.ts`; `PROTO` in `src/lib/net/proto.ts`.

Send the selected classic or expanded variant with the host's room-opening request.
Fix it before `openTable` assigns the first seat, including the host's colour.
Only the rematch prompt below may change it (accepted decision 7).
Expanded rooms start with five or six seats; classic rooms retain three/four limits.
Outside the rematch prompt, changing variants requires creating another room.
Never evict seats or recolour an existing room.
Enforce the room's capacity in joins, bot additions, game start, and rematch.
Use the room's palette for peek responses and taken-colour validation.
Never auto-fill a five-human game to six.
An expanded rematch with five or six live seats keeps its expanded board.
Count live seats before removing disconnected seats or replacing the finished game.
`rematch` today answers "Need 3 or 4 at the table." when fewer than three seats are live.
`again` carries no payload today, and the client has no rematch prompt.
With fewer than five live seats, the host does not refuse the rematch.
Instead the server asks the host to choose, and changes nothing until the host answers.
Only the host sees the prompt, because only the host may start a rematch.
The prompt offers two choices.
Fill the empty seats with bots up to five, and play the expanded map.
Or play the smaller classic map with the people present.
Both choices keep every seat identifier's number (accepted decision 7).
New bots take the lowest free seat numbers.
The prompt needs a new message pair between host and client; neither exists in `PROTO` yet.
Both choices reuse the existing winner-first order and `durableStart` path.
No path back to the lobby exists today (`docs/design/rematch.md`); the host opens a new room.

Advertise an expanded-rules capability during hello, join, watch, and rejoin.
Refuse incompatible clients before sending expanded state; show an update instruction while preserving their saved seat.
Keep old clients usable in classic rooms.
`PROTO` currently permits older protocol versions; increasing its constant alone cannot enforce expanded support.
Gate every admission path, including spectators and persisted-seat rejoin.
Keep player hands private in `viewFor` and `watchView`.
Public variant, role, and actor metadata may be shared; private fortunes and deck order may not.

`waitedOn`, `armTurns`, and `turnOut` follow `current`, so they follow the partner during a partner activation.
`waitedOn` reads `legalFor`, which offers nothing to a seat that is not `current`, except a seat that owes a discard.
A seat that owes a discard after a seven is waited on, and its timer runs.
Partner activations never create discards, because partners never roll.
When `current` moves to the partner, `armTurns` clears the primary player's window and arms the partner's.
Each activation gets the configured `TURN_MS` window and `TURN_TOTAL_MS` budget.
Persist the remaining deadline.
A partner timeout in the main phase passes, which ends the partner activation.
Do not reset a turn budget by reconnecting or restarting during a partner activation.
Keep simultaneous discard waits separate from build opportunities.

### Bots and local modes

Current anchors: `chooseBotAction` and `chooseRecoveryAction` in `src/lib/game/ai.ts`;
`runBots` in `server/host.mjs`; `startAi`, `startHotseat`, and `playAgain` in `src/lib/game/store.ts`.

Let bots occupy any permitted seat without requiring six humans.
Pass the persisted role to action selection.
Partner bots may bank trade.
Partner bots never offer player trades or roll.
Make an unaffordable or blocked bot pass so a partner activation cannot loop forever.
Keep disconnected-human forced moves distinct from discretionary bot building.
Exercise every seat identifier as primary, partner, discard victim, and reconnecting human.
Accepted: expose five/six-seat selectors in hotseat ("Pass this device") and practice.
Keep today's default practice game.
Use the same variant descriptor and transition code locally and online.
Extend `PLAYER_NAMES` with two unique defaults.
Never create an undefined bot name.
Never reuse the fallback red colour.

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
- A rematch keeps the room variant, unless the host picks the classic map at the rematch prompt.
- Persist that choice with the new game, so a restart does not reinterpret it.
- A rematch never reinterprets an old game because six colours now exist.
- An absent variant in legacy local state means classic.
- Never infer an expanded game from the new global maximum.

Validate before committing migration; a failed conversion must preserve the original file.
Restart halfway through both primary and partner activations, with purchases and an outstanding discard.
Rejoin seats five and six with their original secrets and remaining timers.
Resume saved three/four-seat fixtures from main and compare exact boards, hands, deck order, colours, and progress.
If durable local game saves are added separately, give them the same explicit legacy default.
The current client stores seat recovery credentials; that is not a durable local game snapshot.

## Accepted decisions (Jarrod, 2026-10-31)

Jarrod took all five recommendations in items 1 to 5 ([comment 6540477629](https://github.com/jarrodjohnson-gif/emberisle/pull/709#issuecomment-6540477629)).

1. Official paired turns. The older special building phase is not used.
2. Online, hotseat and optional practice support five and six seats. Today's practice default stays.
3. A watchtower is the existing stronghold, with the same cost and points.
4. The official six colour families, with stable seat identifiers.
5. The official extension token spiral by default. The random token layout stays a setting.
   Jarrod's comment cites decision `q1141-default` for that setting.

6. Profile colours. Favourite and backup colours pick from the room's own palette.
   A preferred colour missing from a classic room falls back to the first free slot, as `seatColor` does today.
   Source: Jarrod's decision `q666-profile-colours`, [comment 6546233327](https://github.com/jarrodjohnson-gif/emberisle/issues/666#issuecomment-6546233327).
7. Rematch with fewer than five live seats. The rematch is not refused.
   The host chooses one of two things.
   Either fill empty seats with bots up to five, or play the smaller classic map with the people present.
   A seat identifier keeps its number across the rematch.
   Source: Jarrod's decision `q666-rematch`, same comment.

Existing three and four seat games keep their saved state and colours.

## Owner decisions this design must respect

- "The map is always random per game" (2026-10-22). Terrain stays seeded-random, and the seed picks the starting corner.
- "Beacon docks and New fortunes. Lobby toggles, off by default." (2026-10-19).
- Builder assumption: both toggles stay available, and off by default, in both variants.
- Builder assumption: each toggle changes the expanded 11 docks and 34 fortunes as it changes the classic sets.
- Builder assumption: with Beacon docks on, one of the five generic 3:1 docks becomes the beacon.
- Builder assumption: with New fortunes on, the deck rule from the open [#853](https://github.com/jarrodjohnson-gif/emberisle/pull/853) design applies.
- No owner decision or merged design settles the beacon count or the deck rule yet.
- "Big design work needs Opus 5.5 or stronger" (2026-10-20). Opus was unavailable, so Codex GPT-6 drafted this design.
- Claude Opus 5.5 made the desk review edits on 2026-10-31.

## Open questions for Jarrod

These details of the rematch prompt are not decided.
Each carries a recommendation.

A. Question: what do the other players see while the host chooses?
   Recommendation: a single status line, "The host is choosing how to rematch."
   Other seats and watchers get no controls, and the finished game stays on screen.

B. Question: does the prompt time out?
   Recommendation: no timeout.
   The host can dismiss the prompt, which leaves the finished game and its seats unchanged.

C. Question: with fewer than three live seats, does the prompt offer the classic map?
   Recommendation: no, because a classic game needs three seats.
   The prompt then offers only the bot fill.

D. Question: after the host picks the classic map, which colours and variant apply?
   Recommendation: the room becomes classic for later rematches.
   Each seat keeps its colour if the classic palette has it, else takes the first free slot.

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
| `lane:hud` | Six-seat identity | Implement the approved palette, stable seat identifiers, and six-cell strip; prove touch targets, collision-free names, and contrast. | S |
| `lane:hud` | Extra-turn controls and local selectors | Show the actual actor and legal controls; prove hotseat/practice selection and primary/partner interaction where approved. | S |
| `lane:net` | Compatible room persistence | Add validated shape-2 migration and expanded snapshots; prove unchanged classic restoration and fifth/sixth-seat recovery after restart. | S |
| `lane:net` | Expanded lobby and admission | Enforce capacity, unique palettes, and client capabilities; prove joins, watchers, bots, start, both rematch choices, and old-client behavior. | S |
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
