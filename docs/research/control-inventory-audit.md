# Game Interface Control Inventory and Wording Audit

Research correction, 2026-11-17: Codex-p (GPT-6.1 Sol).
Original audit: finish-quote, 2026-11-13; model unrecorded.
Original line references describe that inventory, not a fresh exhaustive audit.
This revision corrects W2/W5 and approval boundaries only. It changes no runtime strings or proofs.

## 1. Overview and Purpose

This document catalogs interface wording and control behaviors for Issue #1449.
It audits items left out of Issue #1448.
The owner requested an exhaustive audit across words and function.
This inventory records the earlier merged batches and remaining proposals.
It directly answers the review desk inquiry on Issue #1449.

## 2. Status of Previously Landed Batches

Two batches have merged into main from Issue #1449.
The desk confirmed both batches merged on #1449. This revision does not rerun their production proofs.

### Batch 1 (PR #1465)
- **Words 1:** `PlaceList.tsx` uses in-game vocabulary: "forest", "wood dock", and "center".
- **Function 1:** `EmberisleApp.tsx` explains short room codes under four characters.
- **Function 3:** Backdrop taps close `HowTo`, `CostCard`, and `ProfileSheet` via `useBackdropClose`.
- **Function 7:** Hotseat Leave table prompts with "Leave the table? The game ends."

### Batch 2 (PR #1464)
- **Function 8:** `TradeToast.tsx` and `TurnExtensionVote.tsx` standardize button order to No, then Yes.
- **Function 9:** `OpenTables.tsx` toggle keeps the consistent name "Open table".
- **Function 17:** Pressing Enter with a placement pending confirms placement without opening chat.
- **Function 22:** `LobbyTicTacToe.tsx` top button is renamed from "Close" to "Hide".

### Resolved by Adjacent PRs
- **Function 18:** `TableMenu.tsx` uses the Bug icon and announces GitHub new-tab opening (PR #1482).
- **Function 19:** `DiscardBar.tsx` now uses `TradeResource` stepper tokens (PR #1591, Slice C).
- **Function 25:** Table menu Water and View subgrid was approved by owner decision `q1503-menu-gap`.

## 3. Catalog of Remaining Word Inconsistencies

The table below catalogs word inconsistencies that remain open for owner decision.

| Item | Screen / Component | Current Text | Proposed Text | Rationale |
| :--- | :--- | :--- | :--- | :--- |
| W2 | `PlaceList.tsx` | "Lay a path", "Raise a stronghold" | Unresolved owner Question; no replacement selected | Keep existing words until Jarrod chooses. |
| W3 | `rules.ts:566, 578, 647, 662` | "raises an outpost", "founds an outpost" | "builds an outpost" in all phases | Eliminates dual verbs for the same action. |
| W3 | `rules.ts:578, 647` | "lays a path" (setup), "builds a path" | "builds a path" in all phases | One consistent verb across phases. |
| W4 | `TakeFromBar.tsx:39` | "The wayfarer takes a card" | "The wayfarer takes a good" | The game uses "goods", not "cards". |
| W4 | `fortunes.ts:6, 27` | "takes a card", "taking cards" | "takes a good", "taking goods" | Aligns fortune copy with HUD resources. |
| W4 | `rules.ts:617, 623` | "Bad cards.", "Not enough cards." | "Bad goods.", "Not enough goods." | Standardizes error terminology. |
| W5 | `LobbyView.tsx:172` | "Leave the table" | "Leave table" | Matches Table menu row label. |
| W5 | `WinScreen.tsx` | "Menu" | Keep "Menu" | Owner-approved in #1590; withdraw the conflicting replacement. |
| W6 | `README.md:45, 63` | "knights", "Pass ends the turn." | "wayfarer", "End turn ends the turn." | Rulebook matches on-screen button labels. |
| W7 | `WayfarerOptions.tsx:14` | "Off never moves or blocks." | "Off: the wayfarer never moves." | Supplies explicit grammatical subject. |
| W8 | `HowTo.tsx:68` | "Build paths (wood + brick)" | Consistent cost format | Standardizes punctuation and conjunctions. |

## 4. Catalog of Remaining Control Behaviors

The table below catalogs open control behavior improvements across the interface.

| Item | Component | Current Behavior | Proposed Behavior | Impact |
| :--- | :--- | :--- | :--- | :--- |
| F4 | `LobbyView.tsx:152` | Seat bubbles compete with status | Contain bubble inside designated slot | Prevents layout overflow at 320 px. |
| F10 | `LobbyView.tsx:38` | Own name uses dotted underline only | Add pencil icon or explicit Edit affordance | Clarifies name editability to new players. |
| F20 | `OpenTables.tsx:90` | Finished games show "Watch" button | Show "Results" button or omit finished tables | Prevents confusion when watching dead tables. |
| F21 | `Hud.tsx:47` | Case "over" returns unreachable text | Remove dead code branch | Eliminates dead string in bundle. |
| F23 | `Hud.tsx:281-282` | Dual `aria-pressed` and `aria-expanded` | `aria-expanded` for tray, `pressed` when armed | Screen reader hears distinct states. |
| F24 | `Reactions.tsx:48, 80` | Cooldown disables buttons with no note | Add aria-description or tooltip | Explains temporary button disability. |

## 5. Recommended Batch Plan

These are possible batches after the owner picks individual proposals.
They authorize no wording, control or proof change. The parent's other implementation claim remains in place.

### Batch 3: Wording Standardization
- Take only owner-chosen wording items. W2 remains unresolved; WinScreen "Menu" stays unchanged.
- Update `README.md` per W6 and `WayfarerOptions.tsx` per W7.
- Replace associated proof assertions under the 2026-10-25 rule.

### Batch 4: Accessibility and Control Cleanups
- Clean up dual ARIA states on Fortunes button (F23).
- Update finished table action in `OpenTables.tsx` (F20).
- Add accessible cooldown descriptions in `Reactions.tsx` (F24).
- Remove dead phase line in `Hud.tsx` (F21).

## Adoption validation

At main `580c5e8246a1ce85ad3c8b437601d6036c2ecb75`, PlaceList still uses "Lay a path" and "Raise a stronghold".
WinScreen still uses "Menu" and "I'll play again". Those source facts do not approve another wording proposal.
The [W2 Question](https://github.com/jarrodjohnson-gif/emberisle/issues/1449#issuecomment-6941604788) asks Jarrod to choose.
This note selects no replacement.
The [desk coordination answer](https://github.com/jarrodjohnson-gif/emberisle/issues/1449#issuecomment-6941564510) permits only this document.
It preserves the other implementation claim.
I checked the corrected source strings and diff whitespace. I ran no browser or production proof for this documentation edit.
