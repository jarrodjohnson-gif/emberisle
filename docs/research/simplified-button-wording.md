# Research: Simplified Button and Label Wording (Issue #1448)

- date: 2026-11-13
- agent: builder-proofs
- lane: docs/test (tier 3)
- branch: `builder/1448-button-wording`
- targets: `LobbyView.tsx`, `LobbyWaitBox.tsx`, `TableMenu.tsx`, `WinScreen.tsx`
- adoption: Codex-p (GPT-6.1 Sol), 2026-11-17; original exact model unrecorded

This is a historical inventory with corrected approval boundaries. It does not refresh the full source or proof audit.
Original line references describe the 2026-11-13 inventory. No runtime string or proof changes belong to this revision.
The owner chooses every remaining proposal before implementation.

## Executive Summary

This research audits button and label wording across Lobby, TableMenu, and WinScreen.
It proposes concise action verbs for all interactive controls.
It follows core style rules: plain words, consistent verbs, no em dashes, and no filler.
It also responds to the desk's status query on Issue #1448.
Batches 1 and 2 are merged.
Remaining lobby, HUD and chat items are proposals; this note establishes no approval count.
Items 24 and 25 rank last for test cost, not because the issue calls them unapproved.

## Issue #1448 Item Status Matrix

The table below catalogs all 25 items from Issue #1448.
The earlier claim of owner approval for items 1–23 had no source. I withdraw it.
The issue says implementation depends on owner selection.
The matrix preserves the historical batch reports; it does not mark remaining items approved.
Items 24 and 25 rank last for test cost.

| Item | Surface | Description | Status | PR / Notes |
| :--- | :--- | :--- | :--- | :--- |
| 1 | TradePanel | "You give" / "You get" → "Give" / "Get" | MERGED | Batch 1 (PR #1455) |
| 2 | TradePanel | "You give: X" / "You get: Y" → "Give: X" / "Get: Y" | MERGED | Batch 1 (PR #1455) |
| 3 | TradeToast | "You give:" / "You get:" → "Give:" / "Get:" | MERGED | Batch 1 (PR #1455) |
| 4 | TradePanel | Bank quote simplification | MERGED | Batch 1 (PR #1455) |
| 5 | SeatNeeds | "You need" → "Need" | MERGED | Batch 1 (PR #1455) |
| 6 | Various | Remove three visible em dashes | MERGED | Batch 1 (PR #1455) |
| 7 | LobbyView | "Leave table" | PRESENT | Checked at line 177; no remaining proposal |
| 8 | LobbyView | "How to play" | PRESENT | Checked at line 137; no remaining proposal |
| 9 | Hud | Outpost upgrade wording ("home" → "outpost") | PENDING | Held for HUD batch |
| 10 | Chat | "Sound settings" → "Sound" | MERGED | Batch 1 (PR #1455) |
| 11 | TableMenu | "Copy table code" → "Copy code" | MERGED | Batch 1 (PR #1455) |
| 12 | PlayerMenu | "Mention @name in chat" → "Mention @name" | MERGED | Batch 2 (PR #1463) |
| 13 | PlayerMenu | Seat trade rows → "Trade…" | MERGED | Batch 2 (PR #1463) |
| 14 | PlayerMenu | Seat facts: Goods, Fortunes, Points | MERGED | Batch 2 (PR #1463) |
| 15 | Hud / Coach | Wayfarer steal: replace "victim" | PENDING | Held for HUD batch |
| 16 | Lobby / Seat | Dropped seat status "Away" | PRESENT | LobbyView:156 and PlayerMenu:97 |
| 17 | CostCard | "10 points claims the isle." → "Win at 10 points." | MERGED | Batch 1 (PR #1455) |
| 18 | Recovery | "Your table hit a snag" → "Something went wrong" | MERGED | Batch 1 (PR #1455) |
| 19 | ProfileSheet | "Remember me" and "Sign in instead" | MERGED | Batch 2 (PR #1463) |
| 20 | WinScreen | "Look around" → "Hide scores" | MERGED | Batch 2 (PR #1463) |
| 21 | TradePanel | Bank refusal simplification | MERGED | Batch 1 (PR #1455) |
| 22 | Chat | aria-label "Minimize chat" → "Close chat" | PENDING | Low priority test churn |
| 23 | LobbyView / LobbyWaitBox | "All ready" | PRESENT | LobbyView:89 and LobbyWaitBox:39 |
| 24 | EmberisleApp | "Host a table" → "Host" | LOWER RANK | Ranked last for test cost; owner chooses |
| 25 | EmberisleApp | "Four seats, one table" → "Hotseat" | LOWER RANK | Ranked last for test cost; owner chooses |

## Lobby Surface Audit

### Current vs Proposed Wording

LobbyView contains several proposed button and status simplifications. They await owner selection.

1. **Leave button (`LobbyView.tsx:177`)**:
   - Current: `"Leave table"`.
   - Already present; withdraw the obsolete shortening proposal.

2. **Rules button (`LobbyView.tsx:137`)**:
   - Current: `"How to play"`.
   - Already present; withdraw the obsolete replacement of `"Rules"`.

3. **Rules failure fallback (`LobbyView.tsx:182`)**:
   - Current fallback button: `"Close"`.
   - `"Close rules"` no longer exists; no replacement is needed.

4. **Dropped seat status (`LobbyView.tsx:156`)**:
   - Current: `s.away ? "Away" : s.ready ? "Ready" : "Waiting"` within the displayed status.
   - Already present, as in `PlayerMenu.tsx:97`; withdraw the obsolete `"reconnecting…"` replacement.

5. **Lobby status summary (`LobbyView.tsx:89`, `LobbyWaitBox.tsx:39`)**:
   - Current ready summary: `"All ready"`.
   - `"Everyone is ready"` no longer exists; no replacement is needed.

6. **Rename seat accessibility label (`LobbyView.tsx:32`)**:
   - Current: ``aria-label={`Your name is ${seat.name}. Change it`}``
   - Proposed: ``aria-label={`Rename ${seat.name}`}``
   - Rationale: Starts with a direct action verb.
   - Eliminates conversational filler.

7. **Table code copy button accessibility label (`LobbyView.tsx:126`)**:
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
   - Retain: `"I'll play again"`.
   - [Owner answer 6712215960](https://github.com/jarrodjohnson-gif/emberisle/issues/1411#issuecomment-6712215960), `q1411-play-again` A, governs this control.
   - [PlayAgain.tsx](../../src/components/game/PlayAgain.tsx#L14) keeps that text in both states, adding a checkmark when selected.
   - I withdraw the proposed shortening.

2. **Waiting for host label (`WinScreen.tsx:219`)**:
   - Current: ``Waiting for ${hostName} to start another.``
   - Proposed: ``Waiting for ${hostName} to start.``
   - Rationale: Shorter and direct.

3. **Win reason descriptions (`WinScreen.tsx:172-173`)**:
   - Current turn start: `"Started their turn with winning points"`
   - Proposed turn start: `"Started turn with winning points"`
   - Current points: `"Reached the winning score"`
   - Proposed points: `"Reached winning score"`
   - Rationale: Eliminates filler words while keeping clear meaning.

4. **Untracked game note (`WinScreen.tsx:213`)**:
   - Current: `"This game isn't tracked."`
   - Proposed: `"Game not tracked."`
   - Rationale: Concise informative label.

5. **Existing controls verified clean**:
   - Chip: `"Show scores"`, `"Play again"`, `"Menu"` (clean)
   - Screen buttons: `"React"`, `"Hide scores"`, `"Menu"`, `"Play again"` (clean)

## Test Proof Impact and Replaced Lines

Under `docs/DECISIONS.md` (2026-10-25), test lines are replaced, never deleted.
The table below records the earlier proposed proof impacts.
A future approved implementation needs a fresh assertion search; this table is not exhaustive or current validation.

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

This revision makes no claim that a string lacks test coverage. Keep existing assertions until an approved change justifies an equivalent replacement.

## Recommendations for Batch 3 (Lobby & Menus)

1. **Do not repackage shipped lobby wording**:
   - Items 7, 8, 16 and 23 already appear in the current source.
   - Any other proposal still needs the owner's choice before implementation.

2. **Include TableMenu confirmation polish**:
   - Update confirmation dialog prompt to "Leave table?".

3. **Verify proofs during Batch 3 execution**:
   - Run `lobby-layout-prove`, `lobby-code-copy-prove`, `chat-prove`, and `table-menu-prove`.
   - Update proof assertions in their own commit with old and new text documented.

## Adoption and validation boundary

The [desk coordination answer](https://github.com/jarrodjohnson-gif/emberisle/issues/1448#issuecomment-6941573564) authorizes only this document and preserves the parent's other implementation claim.
Keep "I'll play again" under [q1411-play-again A](https://github.com/jarrodjohnson-gif/emberisle/issues/1411#issuecomment-6712215960).
Keep "Menu" under `q1599-win-screen` A, recorded in [DECISIONS](../DECISIONS.md) and [PR #1599](https://github.com/jarrodjohnson-gif/emberisle/pull/1599).
Jarrod picks other wording proposals on the Desk page.
Keep this inventory separate from #1644's control document and the accepted [play-again design](../design/play-again-1411/README.md).
I checked the corrected lobby, rematch, win-screen and PlayerMenu source quotes at main `333f8f08d5bf323289ec8fd203bb7ce353a8f203`.
I checked the issue/desk wording, new link targets and diff whitespace.
I ran no browser or production proof for this documentation-only revision.
