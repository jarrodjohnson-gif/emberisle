# Research: Simplified Button and Label Wording (Issue #1448)

- date: 2026-11-13
- agent: builder-proofs
- lane: docs/test (tier 3)
- branch: `builder/1448-button-wording`
- targets: `LobbyView.tsx`, `LobbyWaitBox.tsx`, `TableMenu.tsx`, `WinScreen.tsx`

## Executive Summary

This research audits button and label wording across Lobby, TableMenu, and WinScreen.
It proposes concise action verbs for all interactive controls.
It follows core style rules: plain words, consistent verbs, no em dashes, and no filler.
It also responds to the desk's status query on Issue #1448.
Batches 1 and 2 are merged.
Seven approved items remain open across lobby, HUD, and chat.
Two items remain unapproved.

## Issue #1448 Item Status Matrix

The table below catalogs all 25 items from Issue #1448.
The owner approved items 1 through 23 on 2026-11-08.
Items 24 and 25 were skipped due to high test churn.

| Item | Surface | Description | Status | PR / Notes |
| :--- | :--- | :--- | :--- | :--- |
| 1 | TradePanel | "You give" / "You get" → "Give" / "Get" | MERGED | Batch 1 (PR #1455) |
| 2 | TradePanel | "You give: X" / "You get: Y" → "Give: X" / "Get: Y" | MERGED | Batch 1 (PR #1455) |
| 3 | TradeToast | "You give:" / "You get:" → "Give:" / "Get:" | MERGED | Batch 1 (PR #1455) |
| 4 | TradePanel | Bank quote simplification | MERGED | Batch 1 (PR #1455) |
| 5 | SeatNeeds | "You need" → "Need" | MERGED | Batch 1 (PR #1455) |
| 6 | Various | Remove three visible em dashes | MERGED | Batch 1 (PR #1455) |
| 7 | LobbyView | "Leave the table" → "Leave table" | PENDING | Target for Lobby batch |
| 8 | LobbyView | "Rules" → "How to play" | PENDING | Target for Lobby batch |
| 9 | Hud | Outpost upgrade wording ("home" → "outpost") | PENDING | Held for HUD batch |
| 10 | Chat | "Sound settings" → "Sound" | MERGED | Batch 1 (PR #1455) |
| 11 | TableMenu | "Copy table code" → "Copy code" | MERGED | Batch 1 (PR #1455) |
| 12 | PlayerMenu | "Mention @name in chat" → "Mention @name" | MERGED | Batch 2 (PR #1463) |
| 13 | PlayerMenu | Seat trade rows → "Trade…" | MERGED | Batch 2 (PR #1463) |
| 14 | PlayerMenu | Seat facts: Goods, Fortunes, Points | MERGED | Batch 2 (PR #1463) |
| 15 | Hud / Coach | Wayfarer steal: replace "victim" | PENDING | Held for HUD batch |
| 16 | Lobby / Seat | Dropped seat status → "Away" | PARTIAL | PlayerMenu done (PR #1463); Lobby pending |
| 17 | CostCard | "10 points claims the isle." → "Win at 10 points." | MERGED | Batch 1 (PR #1455) |
| 18 | Recovery | "Your table hit a snag" → "Something went wrong" | MERGED | Batch 1 (PR #1455) |
| 19 | ProfileSheet | "Remember me" and "Sign in instead" | MERGED | Batch 2 (PR #1463) |
| 20 | WinScreen | "Look around" → "Hide scores" | MERGED | Batch 2 (PR #1463) |
| 21 | TradePanel | Bank refusal simplification | MERGED | Batch 1 (PR #1455) |
| 22 | Chat | aria-label "Minimize chat" → "Close chat" | PENDING | Low priority test churn |
| 23 | LobbyView | "Everyone is ready" → "All ready" | PENDING | Target for Lobby batch |
| 24 | EmberisleApp | "Host a table" → "Host" | SKIPPED | Unapproved by owner |
| 25 | EmberisleApp | "Four seats, one table" → "Hotseat" | SKIPPED | Unapproved by owner |

## Lobby Surface Audit

### Current vs Proposed Wording

LobbyView contains several button and status strings ready for simplification.

1. **Leave button (`LobbyView.tsx:172`)**:
   - Current: `"Leave the table"`
   - Proposed: `"Leave table"`
   - Rationale: Matches the TableMenu row (`TableMenu.tsx:299`).
   - One concise verb and noun for the same action.

2. **Rules button (`LobbyView.tsx:133`)**:
   - Current: `"Rules"`
   - Proposed: `"How to play"`
   - Rationale: The sheet title is "How to play".
   - Title screen and TableMenu both use "How to play".
   - Consistent labeling reduces confusion.

3. **Rules failure fallback (`LobbyView.tsx:177`)**:
   - Current: `"Close rules"`
   - Proposed: `"Close"`
   - Rationale: Simple action verb matches modal close buttons throughout the application.

4. **Dropped seat status (`LobbyView.tsx:151`)**:
   - Current: `s.away ? "reconnecting…" : s.ready ? "Ready" : "Waiting"`
   - Proposed: `s.away ? "Away" : s.ready ? "Ready" : "Waiting"`
   - Rationale: Aligns with `PlayerMenu.tsx:100` and `SeatRail.tsx:93`.
   - Consistent terminology across all game views.

5. **Lobby status summary (`LobbyView.tsx:85`, `LobbyWaitBox.tsx:39`)**:
   - Current: `"Everyone is ready"`
   - Proposed: `"All ready"`
   - Rationale: Concise parallel to `"2 of 4 ready"`.
   - Saves horizontal space on mobile portrait screens.

6. **Rename seat accessibility label (`LobbyView.tsx:32`)**:
   - Current: ``aria-label={`Your name is ${seat.name}. Change it`}``
   - Proposed: ``aria-label={`Rename ${seat.name}`}``
   - Rationale: Starts with a direct action verb.
   - Eliminates conversational filler.

7. **Table code copy button accessibility label (`LobbyView.tsx:122`)**:
   - Current: ``aria-label={`Table code ${[...code].join(" ")}. Copy link`}``
   - Proposed: ``aria-label={`Copy link for table ${[...code].join(" ")}`}``
   - Rationale: Begins with a direct action verb.

8. **Sandwich Stacker status (`LobbyWaitBox.tsx:158`)**:
   - Current: `"Couldn't load the game."`
   - Proposed: `"Could not load game."`
   - Rationale: Direct plain phrasing.

## TableMenu Surface Audit

### Current vs Proposed Wording

TableMenu is already mostly simplified from Batch 1.
Minor inconsistencies remain in confirmation dialogs and accessibility labels.

1. **Leave confirmation dialog heading (`TableMenu.tsx:178`)**:
   - Current: `aria-label="Leave the table?"`
   - Proposed: `aria-label="Leave table?"`
   - Rationale: Matches the action button label `"Leave table"`.

2. **Leave confirmation dialog body (`TableMenu.tsx:183`)**:
   - Current hotseat: `"Leave the table? The game ends."`
   - Proposed hotseat: `"Leave table? The game ends."`
   - Current online: `"Leave the table? Your seat goes to the bot."`
   - Proposed online: `"Leave table? Your seat goes to a bot."`
   - Rationale: Drops unnecessary definite article "the".

3. **Report bug accessibility label (`TableMenu.tsx:293`)**:
   - Current: `aria-label="Report a bug, opens GitHub in a new tab"`
   - Proposed: `aria-label="Report bug (opens in new tab)"`
   - Rationale: Concise label without conversational tone.

4. **Existing rows verified clean**:
   - `"How to play"` (clean)
   - `"Costs"` (clean)
   - `"Game log"` (clean)
   - `"Sound"` (clean)
   - `"Water"`: `"Crystal"` / `"Simple"` (clean)
   - `"View"`: `"Diorama"` / `"Overhead"` (clean)
   - `"Copy code ${code}"` (clean, Batch 1)
   - `"Copy log"` (clean)
   - `"Leave table"` (clean)
   - Confirmation buttons: `"Stay"` and `"Leave"` (clean)

## WinScreen Surface Audit

### Current vs Proposed Wording

WinScreen received "Hide scores" in Batch 2.
Additional victory descriptions and waiting labels can be made more concise.

1. **Guest rematch button (`src/components/game/PlayAgain.tsx:14`)**:
   - Current: `"I'll play again"`
   - Proposed: `"Play again"`
   - Rationale: Uses standard action verb.
   - Selected state already shows checkmark prefix `✓ Play again`.

2. **Waiting for host label (`WinScreen.tsx:190`)**:
   - Current: ``Waiting for ${hostName} to start another.``
   - Proposed: ``Waiting for ${hostName} to start.``
   - Rationale: Shorter and direct.

3. **Win reason descriptions (`WinScreen.tsx:138-144`)**:
   - Current turn start: `"Started their turn with winning points"`
   - Proposed turn start: `"Started turn with winning points"`
   - Current points: `"Reached the winning score"`
   - Proposed points: `"Reached winning score"`
   - Rationale: Eliminates filler words while keeping clear meaning.

4. **Untracked game note (`WinScreen.tsx:184`)**:
   - Current: `"This game isn't tracked."`
   - Proposed: `"Game not tracked."`
   - Rationale: Concise informative label.

5. **Existing controls verified clean**:
   - Chip: `"Show scores"`, `"Play again"`, `"Menu"` (clean)
   - Screen buttons: `"React"`, `"Hide scores"`, `"Menu"`, `"Play again"` (clean)

## Test Proof Impact and Replaced Lines

Under `docs/DECISIONS.md` (2026-10-25), test lines are replaced, never deleted.
The table below identifies every proof script asserting on strings audited here.

| File | Lines | Old Text | New Text | Reason |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/chat-prove.mjs` | 518, 603, 715 | `"Leave the table"` | `"Leave table"` | Item 7 |
| `scripts/connection-health-prove.mjs` | 359 | `"Leave the table"` | `"Leave table"` | Item 7 |
| `scripts/install-prove.mjs` | 204 | `"Leave the table"` | `"Leave table"` | Item 7 |
| `scripts/lobby-layout-prove.mjs` | 319 | `"Leave the table"` | `"Leave table"` | Item 7 |
| `scripts/lobby-wait-box-prove.mjs` | 313 | `"Leave the table"` | `"Leave table"` | Item 7 |
| `scripts/shots.mjs` | 259 | `"Leave the table"` | `"Leave table"` | Item 7 |
| `scripts/lobby-code-copy-prove.mjs` | 152 | `"Rules"` | `"How to play"` | Item 8 |
| `scripts/lobby-layout-prove.mjs` | 319, 362 | `"Rules"` | `"How to play"` | Item 8 |
| `scripts/chat-prove.mjs` | 586, 703 | `"Everyone is ready"` | `"All ready"` | Item 23 |
| `scripts/client-prove.mjs` | 751 | `"Leave the table? ..."` | `"Leave table? ..."` | TableMenu leave confirm |
| `scripts/table-menu-prove.mjs` | 363, 391 | `"Leave the table? ..."` | `"Leave table? ..."` | TableMenu leave confirm |

Note: No test script asserts on `"reconnecting…"` in `LobbyView.tsx`.
No test script asserts on `"Hide scores"` or `"Look around"` in `WinScreen.tsx`.

## Recommendations for Batch 3 (Lobby & Menus)

1. **Package remaining approved Lobby items into Batch 3**:
   - Item 7: "Leave table" (`LobbyView.tsx`).
   - Item 8: "How to play" (`LobbyView.tsx`).
   - Item 16: "Away" (`LobbyView.tsx`).
   - Item 23: "All ready" (`LobbyView.tsx`, `LobbyWaitBox.tsx`).

2. **Include TableMenu confirmation polish**:
   - Update confirmation dialog prompt to "Leave table?".

3. **Verify proofs during Batch 3 execution**:
   - Run `lobby-layout-prove`, `lobby-code-copy-prove`, `chat-prove`, and `table-menu-prove`.
   - Update proof assertions in their own commit with old and new text documented.
