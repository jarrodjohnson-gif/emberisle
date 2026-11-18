# Design: selective expansion pieces (issue #843)

Design only. Owner idea, 2026-10-18. No code in this step.

Source: README rule set; [wayfarer-modes.md](wayfarer-modes.md) lobby toggle pattern; [docks.md](docks.md); [IDEAS.md](../IDEAS.md) house-rule toggles note; six-player research stays on [#666](https://github.com/jarrodjohnson-gif/emberisle/issues/666) / [six-players.md](six-players.md).

## Goal

Ship optional table pieces friends can flip on in the lobby.

Each piece is Emberisle-named and original. None copy a published expansion's rules or art.

Classic 19-hex play stays the default. Every piece defaults Off.

## Shared lobby contract

| Rule | Contract |
|---|---|
| Where | Host picks under a "Table pieces" disclosure on the title / create flow, next to Wayfarer. |
| Who | Host only. Guests see the frozen list in the lobby. |
| Persist | Choices freeze at table create. Rematch keeps them. A new table is required to change them. |
| Combine | Pieces that do not share board graph rules may combine. Conflicting pairs are listed below. |
| Wire | Store each flag on table metadata and game state. Legacy rooms without fields play Off. |
| How to play | One short paragraph per enabled piece. |
| Proof | Host proof asserts each Off path matches today's rules byte-for-byte for that subsystem. |

## Candidates

### 1. Tide lanes (sea paths)

**Idea:** Paths may continue onto shallow sea edges between coastal corners. A tide lane is a path on water. It costs 1 wood + 1 sheep. It counts for longest path.

**Rules change:** New edge type on the coastal ring. Connectivity: a tide lane must touch your land path or building at a coast corner. Opponents still block past a building corner. No buildings on water.

**Art:** Short wooden causeways with rope posts. Warm jelly wood, not ship miniatures.

**UI cost:** Medium. Arm Path must highlight sea edges. Cost tile for tide lane. Coach and How to play lines.

**Server cost:** Medium. Legal-edge helper, longest-path graph, save schema for edge kind.

**Risk:** Medium. Touches the path graph that already drives awards.

### 2. Drift isles (small islands)

**Idea:** Deal 2–3 one-hex drift isles outside the main island. Each has terrain + pip. Reach them only by tide lanes (requires Tide lanes On) or by a one-time "landfall" path from a facing coast corner.

**Rules change:** Extra hex ids in createGame. Production and wayfarer treat them as normal hexes. Opening setup stays on the main island only.

**Art:** Tiny jelly hexes with the same six terrains. Thin mist ring so they read as offshore.

**UI cost:** High with Tide lanes. Camera fit and legal marks must include the outer ring.

**Server cost:** High. Board generation, harbor spacing, save migration, bot placement bias.

**Risk:** High. Couples to Tide lanes. Conflicts with fog-of-war (#842) until fog reveal rules cover outer hexes.

**Depends on:** Tide lanes, or a stripped "landfall only" variant if Jarrod rejects sea paths.

### 3. Beacon docks (special harbors)

**Idea:** Replace 1 of the 4 three-for-one docks with a Beacon. Beacon rate is 2-for-1 any good, once per your turn, and only after you own a corner. The other docks stay as today.

**Rules change:** New harbor kind `beacon`. Bank trade UI shows the once-per-turn gate. Rematch reshuffles which coast slot is the Beacon if docks already rotate.

**Art:** A lantern pier with a soft cream lamp. Distinct from 2:1 resource jetties (#846 badges stay valid).

**UI cost:** Low–medium. One dock badge, one Hand rate chip, one toast when the once-per-turn fire is spent.

**Server cost:** Low. Harbor enum + per-turn flag cleared on `endTurn`.

**Risk:** Low. Extends docks without new graph rules.

### 4. Squall deck (table events)

**Idea:** A shared face-down deck of 12 squalls. After every natural 7 that finishes discards (wayfarer On or Off), flip one squall before the main phase. Examples: Calm sea (no effect), Flooded path (one random path ignored for longest path until next 7), Fair wind (+1 road segment length toward longest path for the roller this turn only), Sparse bank (bank trades cost +1 of the given good this round).

**Rules change:** New phase beat or inline resolve after robber/muster. Events must never hide private hands. Bots need a tiny priority table.

**Art:** Small paper cards with storm icons. No text walls on the table; one-line toast + log.

**UI cost:** Medium. Toast, log lines, optional discard pile chip.

**Server cost:** Medium. Shuffled deck in room save, event ids, bot hooks.

**Risk:** Medium. Timing bugs beside the wayfarer and timer. Keep the first set to 4 boring, readable cards.

### 5. New fortunes (Emberisle deck inserts)

**Idea:** Add 4 cards to the shared fortune deck (raise total from 25 → 29), or swap 4 knights for mixed inserts so the deck size stays 25.

| Card | Effect (draft) |
|---|---|
| Scout glass | Peek one facedown? — reject; no hidden map without #842. Instead: name one hex you touch; take its terrain good from the bank if any remain. |
| Second wind | Place one extra path this turn at normal cost. Still one fortune per turn. |
| Harbor favor | This turn your bank rate is 3:1 even without a dock. Does not stack under a better dock. |
| Muster drum | Counts as one wayfarer toward largest army without moving the wayfarer (mirrors Off-mode Muster feel when Wayfarer is On). |

**Rules change:** Deck composition + play handlers. Bought-this-turn lock unchanged.

**Art:** Same fortune card chrome with new icons.

**UI cost:** Low–medium. Fortune tray rows and How to play.

**Server cost:** Low–medium. Card kinds in rules + bots.

**Risk:** Low if effects stay one sentence. High if any card peeks private info.

### 6. Ember lookouts (optional building)

**Idea:** A lookout costs 1 wood + 1 stone + 1 wheat. It sits on an empty vertex like an outpost, scores 0 points, and reveals adjacent pips as a public table chat line once when built (or feeds #842 fog reveal if fog is On). Cap: one lookout per seat.

**Rules change:** New piece type, inventory 1, placement rules mirror outpost distance.

**Art:** Tall thin jelly tower with a lamp.

**UI cost:** High. New build arm, piece mesh, inventory row, win-screen column decision (show 0 VP piece or hide).

**Server cost:** Medium. Placement legality and piece counts.

**Risk:** Medium. Overlaps fog and coach teaching. Skip unless fog ships first.

## Ranking (build value ÷ cost)

| Rank | Piece | Why |
|---|---|---|
| 1 | Beacon docks | Smallest rules surface; clear lobby story; helps starved seats. |
| 2 | New fortunes | Reuses fortune tray; high replay with low board risk. |
| 3 | Tide lanes | Distinct "expansion" feel; unlocks Drift isles later. |
| 4 | Squall deck | Fun, but event timing is easy to get wrong. |
| 5 | Drift isles | Needs Tide lanes + board gen; save for a later milestone. |
| 6 | Ember lookouts | Weak alone; better as a fog helper after #842. |

## Recommended first slice

Build **Beacon docks** and **New fortunes** first.

Add **Tide lanes** only if Jarrod wants a visible board change in the same season.

Leave Drift isles, Squalls, and Lookouts in Backlog until those three prove stable online.

## Conflict matrix

| | Beacon | Fortunes | Tide | Squall | Drift | Lookout |
|---|---|---|---|---|---|---|
| Beacon | — | ok | ok | ok | ok | ok |
| Fortunes | | — | ok | ok | ok | ok |
| Tide | | | — | ok | required for Drift | ok |
| Squall | | | | — | ok | ok |
| Drift | | | | | — | ok |
| Lookout | | | | | | — |

Fog of war (#842): Drift and Lookout need an explicit reveal rule before combine. Beacon and Fortunes combine with any fog option.

## Lobby copy (draft)

| Control | Text |
|---|---|
| Section | Table pieces |
| Beacon docks | Off / On — one 2:1 any-good beacon, once per your turn |
| New fortunes | Off / On — four Emberisle fortune cards in the shared deck |
| Tide lanes | Off / On — build paths on shallow sea edges |
| Helper | "Classic rules when every piece is Off." |

## Out of scope

- Fifth and sixth seats or a larger main island ([#666](https://github.com/jarrodjohnson-gif/emberisle/issues/666)).
- Copying published expansion names, cards, or setup flows.
- Player-authored cards or uploads.
- Changing the 10-point default win target.

## Implementation children (file after owner pick)

1. Research: harbor enum + fortune kind impact on bots and saves for the chosen 2–3.
2. Design: art briefs and lobby disclosure layout.
3. Implement: host flags, rules, UI, proofs.
4. Test: Off regression + each piece On in practice and two-tab online.

## Question

Question: Which selective expansion pieces should Emberisle build first?

Options:

1. Beacon docks + New fortunes (recommended)
2. Beacon docks + Tide lanes
3. New fortunes + Tide lanes
4. Beacon docks + New fortunes + Tide lanes
5. Squall deck instead of one of the above (say which to drop)
6. None for now — keep classic only

Recommendation: **1**. Lowest board risk, clear lobby toggles, and room to add Tide lanes after friends ask for more map.
