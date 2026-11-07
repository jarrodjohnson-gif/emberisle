# Buttons: the audit and the minimal system (#1298)

Owner decision 4 of #1274 (2026-11-03, option C): keep today's contextual button fills until a button audit. This is that audit.
It inventories every button, names what is merely inconsistent, and proposes the smallest system that keeps every fill as it is.
No `src/` file changed.

Author: Fable (Claude Fable 5.1), 2026-11-07, on `main` at `5b83aa1e`.
Astra's and Terra's earlier packet from `codex/1298-button-audit` stays in this folder: the schematic state sheets (`index.html`, `390x844.png`, `844x390.png`, `1280x720.png`), the first source inventory ([inventory.md](inventory.md)) and its measurements.

## The primitive today (`src/components/ui/button.tsx`)

| Variant | Look | Callers on `main` |
|---|---|---|
| `default` | ink fill `#263d3c`, mist text | 10 with no `variant`, and 3 as one side of a state switch |
| `primary` | the same classes as `default` | 3, and 7 as one side of a state switch |
| `secondary` | mist fill `#f3f6f5`, ink text, 1 px `#78837a` edge | 21, and 8 as one side of a state switch |
| `outline` | no fill, ink text, 1 px `#78837a` edge | 18, all in the lobby and its games |
| `ghost` | no fill, no edge | 25, and 2 as one side of a state switch |
| `sea` | teal fill `#246d72`, white text | 1: lobby Start |
| `accent` | teal fill `#246d72`, white text | 0 |

88 `Button` callers in all (51 with a fixed variant, 10 with none, 10 with a state switch), plus 36 raw `<button>` elements outside the primitive (`git grep -n "<button" -- src/components`, less the primitive itself; listed below where they look like controls).

Two type exceptions stand and are not touched by anything below: the lobby's accepted 13 / 15 / 17 / 22 / 28 px scale (decision 7 of #1274) and the V1 hand-card name at 10 px uppercase (decision 5).

Sizes: `default` and `sm` are 44 px tall (16 px and 12 px side padding), `lg` 48 px, `icon` 44 x 44. Type: 14 px / 500 on `default`, `sm` and `icon`; 16 px / 500 on `lg`. Corners: 8 px (`--radius-control`). Focus: 2 px `#246d72` outline, 2 px offset. Native `disabled`: muted text, mist fill, no pointer events.

Ten callers switch variant by state: `watchLink` twice (`EmberisleApp.tsx:267, 313`), `endPrimary` (`Hud.tsx:323`), `buildMode` (`Hud.tsx:486`), `fortunesOpen` (`Hud.tsx:262`), `canAgain` (`WinScreen.tsx:213`), the Water and View toggles (`TableMenu.tsx:197, 209`), the fortune Play (`FortuneTray.tsx:162`), the profile sign-in (`ProfileSheet.tsx:200`). These are hierarchy choices, not accidents.

## Every button family, read on `main`

Lines are from `src/components/game/` unless another path is given. "Keep" means the fill or look is a contextual choice that decision 4C protects.

| Screen | Control | Variant, size | Caller | Note |
|---|---|---|---|---|
| Title | Play (or Watch on a watch link) | `primary` lg, full width | `EmberisleApp.tsx:267, 313` | Keep. One fill per screen. |
| Title | Host a table, Join | `secondary` lg | `:276, 306` | Host drops its corners and edge to join the Code field. Keep. |
| Title | Four seats one table, How to play, sound, Profile | `ghost` | `:339, 342, 345, 251` | The sound button is `icon`. |
| Title | Colour swatches | raw `role=radio` | `:234` | 44 px, 2 px ink border when picked. Keep. |
| Open tables | Join, Watch | `secondary` sm, `ghost` sm | `OpenTables.tsx:85, 90` | 44 px by class. |
| Lobby | Copy, Copy link, Invite, Rules, Ready, Add bot, Remove bot | `outline` | `LobbyView.tsx:120-152, 168` | 15 px / 600 from `lobby.css:30` (decision 7). #1303 owns the Copy and Invite rework. |
| Lobby | Start | `sea` | `:169` | The one teal fill. Keep until the owner picks (decision 4C). |
| Lobby | Leave the table | `ghost` | `:170` | |
| Lobby | Table, Play games | raw buttons | `:128, 129` | 12 px corners; Table has a white fill, Play games none. #1303 owns the consistent boxes. |
| Lobby | Send (chat) | raw, ink fill, 14 px | `Chat.tsx:262` | Ink fill next to the teal Start: two fills on one card. Left for the owner, see below. |
| Lobby games | Close, Play, No, Cancel, Play again, invites | `outline`, `default` | `LobbyTicTacToe.tsx:42-101`, `LobbyWaitBox.tsx:182-188` | Play and Open are `default` fills. |
| Table | Path, Outpost, Stronghold, Fortune | `secondary` sm, `primary` when armed | `Hud.tsx:486` | 52 px tall tiles; ready tiles turn pale green with a green edge (`styles.css`, `#606`); short goods ring red. `aria-disabled` when blocked, still focusable, with the reason as a 12 px line. Keep. |
| Table | Trade | `secondary` sm | `TradeButton.tsx:8` | |
| Table | Fortunes · N | `secondary` sm, `primary` when open or armed | `Hud.tsx:262` | Keep. |
| Table | End turn | `secondary` sm, `primary` when nothing can be bought | `Hud.tsx:323` | Keep (`polish.md`, one primary). |
| Table | Roll | `default` lg | `Hud.tsx:556` | |
| Table | Place, Cancel (place chip) | raw: ink fill 12 px corners; 14 px underlined text | `PlaceChip.tsx:32, 35` | Both outside the primitive. Cancel is the only underlined button in the game besides Skip tips. |
| Table | Skip tips | raw 12 px underlined text | `FirstGameCoach.tsx:115` | 44 px wide target, 12 px text. |
| Table | Discard | `default` sm | `DiscardBar.tsx:48` | Native disabled until the count is right. |
| Table | Steal from … | `secondary` sm | `TakeFromBar.tsx:50` | |
| Table | Keyboard place list | `secondary` sm, `min-h-8` | `PlaceList.tsx:152` | 32 px rows, desktop keyboard only. |
| Table | Yes / No / Cancel / Dismiss (offer) | `default` / `secondary` | `TradeToast.tsx:162-208` | `styles.css` repaints them as `trade-yes` and `trade-no`. Keep. |
| Table | More time Yes / No / ask | raw, 70 % white with a white edge | `TurnExtensionVote.tsx:29` | The last translucent control in the game. |
| Table menu | trigger | `ghost` icon, white fill with an edge from `styles.css` | `TableMenu.tsx:106` | |
| Table menu | rows | `ghost`, `ROW` 44 px | `:161-235` | Sound, Music and Haptics are `aria-pressed` toggles. |
| Table menu | Crystal / Simple, Diorama / Overhead | `default` when picked, `ghost` otherwise, sm | `:197, 209` | Keep. |
| Table menu | Stay / Leave (online) | `secondary` / `default` | `:151, 154` | The one destructive choice. Leave is the fill. |
| Player menu | rows | raw, 44 px, 14 px, `hover:bg-white/70` | `PlayerMenu.tsx:131-169` | #1301 owns these. |
| Seat cards | the card | raw, 44 px | `SeatRail.tsx:145` | #1301. |
| Chat | tabs, Send, emoji, chips, Mute, Minimize | raw | `Chat.tsx`, `talk.tsx`, `Reactions.tsx` | #1304 owns these. |
| Trade window | Close, Ask the table, Bank | `ghost` icon, `default`, `secondary` | `TradePanel.tsx:112, 150, 157` | Ask and Bank native disabled until a quote exists. |
| Trade window | the goods cards, minus | raw `trade-add`, `trade-remove` | `TradeResource.tsx:26, 33` | #1252 owns the cards. |
| Trade window | Need chips | `secondary` + `need-toggle` CSS | `SeatNeeds.tsx:40` | Pill shape, 2 px ink ring when lit. Keep. |
| Fortunes | goods chips, Close, Play | `secondary` + `RESOURCE_PAINT`, `ghost`, `primary`/`secondary` | `FortuneTray.tsx:37, 135, 162` | #1302 owns the sheet. |
| Sheets | Close (How to play, Costs, Profile) | `ghost` icon | `HowTo.tsx:57`, `CostCard.tsx:58`, `ProfileSheet.tsx:229` | #1305 owns the help sheets. |
| Profile | Sign in, Create, Done, Sign out, Cancel | `primary` lg, `secondary`, `ghost` | `ProfileSheet.tsx:97-229` | |
| Results | Look around, Play again, Back to menu, React, 7 / 10 | `secondary`, `default`, `secondary` (or `default` with no rematch), `secondary` | `WinScreen.tsx:191-213`, `VictoryTargetSelect.tsx:10` | Keep. |
| Results chip | Show scores, Play again, Back to menu | `secondary` sm, `default` sm | `WinScreen.tsx:79-87` | |
| Recovery | Rejoin | raw, ink fill | `TableRecoveryBoundary.tsx:59` | |
| Loading | Start, Retry | raw: Start is a teal `#246d72` fill with white text (`loading.css:12`); Retry a white fill with teal text and a teal edge (`loading.css:26`) | `LoadingScreen.tsx:231, 254` | Follows the #1281 mock; teal focus outline. |

Every control measured in the pictures is at least 44 x 44 px (`pictures/measurements.json`, `under44: []` on every screen).

## What is only inconsistent (fix without a decision)

These change no fill, no type and no hierarchy. One build issue, size S, files `button.tsx`, `PlaceChip.tsx`, `FirstGameCoach.tsx`, `TurnExtensionVote.tsx`.

1. **Two names for one look.** `default` and `primary` have the same classes. Keep `primary`; make `default` the same entry. No caller changes.
2. **Two underlined text links.** The place chip's Cancel (14 px) and Skip tips (12 px) are the only underlined buttons. Make them `ghost` Buttons. Same targets, same places.
3. **The last translucent control.** The more-time vote's buttons are 70 % white with a white edge (`TurnExtensionVote.tsx:29`). Make them `secondary`. The white chrome PR (#1275) removed every other one.
4. **A stale comment.** `button.tsx:32` says corners are 12 px; the token is 8 px (decision 2).
5. **An unused variant.** `accent` has no caller. Leave it until the owner answers on `sea` (below); then drop both or keep one.

## What needs the owner

Two open questions on #1298, both asked with four options and no answer yet. The build issue waits for them.

| Choice | Today | Asked | Where |
|---|---|---|---|
| Button type | 14 px / 500 on `default`, `sm` and `icon`, 16 px / 500 on `lg`; the lobby overrides to 15 px / 600; the type scale has no 14 px size | Question 1: A is 15 px / 22 px / 600 on every `Button`, the build tiles keeping their 12 px caption lines | `button.tsx:16-18`, `lobby.css:30` |
| Focus colour | teal `#246d72` from the primitive; ink `#263d3c` from the overrides in `styles.css:212, 240, 250, 307` and `trade-panel.css:10, 41` | Question 2: A is ink everywhere, overrides dropped | |

Decision 4C keeps the fills below. They are listed so the later decision has the facts.

| Choice | Today | Where |
|---|---|---|
| Lobby Start | teal `sea` fill beside the chat's ink Send: the one screen with two fill colours | `LobbyView.tsx:169`, `Chat.tsx` |
| Ready tiles | pale green fill, green edge, green check | `styles.css` `#606` rules |
| Short goods | red 2 px ring on the chip, red `−N` badge at 9 px | `BuildCost.tsx:51, 60` |
| Armed build, open Fortunes | ink fill | `Hud.tsx:262, 486` |
| Offer Yes | ink fill while End turn may also be a fill | `TradeToast.tsx:201`, `Hud.tsx:323` |
| Leave | ink fill, no red | `TableMenu.tsx:154` |
| Destructive variant | none. Leave, Remove bot, No and Cancel are plain. A red fill would be a new decision. | |

## Pictures

Real game, Chromium 153 through Playwright, device scale 1. The title and lobby are played; the table, offer, menu and results are crafted with `window.__emberisle.setState`. "After" is the same page with [after.css](after.css) on top: Question 1's A (15 px / 600 type), Question 2's A (ink focus) and the two text links, nothing else. Those two are open questions; the pictures show them so the owner can pick.
The table picture has keyboard focus on the Outpost tile, which is `aria-disabled` ("No spot") and still inspectable. The lobby has Jarrod hosting, Josh ready, one bot, so Start shows.

| Size | Title | Lobby | Table | Offer | Table menu | Results |
|---|---|---|---|---|---|---|
| 390x844 | [before](pictures/390x844-title-before.jpg) · [after](pictures/390x844-title-after.jpg) | [before](pictures/390x844-lobby-before.jpg) · [after](pictures/390x844-lobby-after.jpg) | [before](pictures/390x844-table-before.jpg) · [after](pictures/390x844-table-after.jpg) | [before](pictures/390x844-offer-before.jpg) · [after](pictures/390x844-offer-after.jpg) | [before](pictures/390x844-menu-before.jpg) · [after](pictures/390x844-menu-after.jpg) | [before](pictures/390x844-results-before.jpg) · [after](pictures/390x844-results-after.jpg) |
| 844x390 | [before](pictures/844x390-title-before.jpg) · [after](pictures/844x390-title-after.jpg) | [before](pictures/844x390-lobby-before.jpg) · [after](pictures/844x390-lobby-after.jpg) | [before](pictures/844x390-table-before.jpg) · [after](pictures/844x390-table-after.jpg) | [before](pictures/844x390-offer-before.jpg) · [after](pictures/844x390-offer-after.jpg) | [before](pictures/844x390-menu-before.jpg) · [after](pictures/844x390-menu-after.jpg) | [before](pictures/844x390-results-before.jpg) · [after](pictures/844x390-results-after.jpg) |
| 1280x720 | [before](pictures/1280x720-title-before.jpg) · [after](pictures/1280x720-title-after.jpg) | [before](pictures/1280x720-lobby-before.jpg) · [after](pictures/1280x720-lobby-after.jpg) | [before](pictures/1280x720-table-before.jpg) · [after](pictures/1280x720-table-after.jpg) | [before](pictures/1280x720-offer-before.jpg) · [after](pictures/1280x720-offer-after.jpg) | [before](pictures/1280x720-menu-before.jpg) · [after](pictures/1280x720-menu-after.jpg) | [before](pictures/1280x720-results-before.jpg) · [after](pictures/1280x720-results-after.jpg) |

[pictures/measurements.json](pictures/measurements.json) records every visible button on each screen, before and after: label, box, fill, text, edge, corners, type, disabled kind, pressed state and focus outline.
The capture fails if any fill changes between before and after. It passed with zero page errors.

Contrast, WCAG, from the tokens in `src/styles.css`: ink `#263d3c` on mist `#f3f6f5` 10.6:1, and the same for mist text on an ink fill; white on teal `#246d72` 6.0:1; the `#78837a` edge on white 3.9:1 and on mist 3.6:1; muted `#555e58` on mist 6.2:1 (native disabled text).

## For the build issue

Completion test (after the two questions are answered; the type and focus lines below assume the answers, whichever they are):

1. `button.tsx` has one fill entry for `primary` and `default`, the chosen type on every size, the chosen focus colour; the `styles.css` and `trade-panel.css` focus overrides are gone.
2. `contrast-prove`, `title-prove`, `lobby-prove`, `build-ready-prove`, `hud-safe-area-prove`, `reflow-prove` and the trade proofs pass. Any assertion on a 14 px or 16 px button size is replaced under the 2026-10-25 rule, in its own commit with the old/new table.
3. Every button in the table, lobby and title still measures 44 x 44 or more (`measurements.json` lists today's boxes).
4. No fill changes: `measurements.json` before and after fills are equal, and the build PR shows the same.
5. The lobby 13 / 15 / 17 / 22 / 28 px scale and the 10 px hand-card names are unchanged.

## Reproduce

Run from the repo root, one browser at a time: `node docs/design/button-audit/capture.mjs`.
It starts a host and the dev server, drives the title, a two-person lobby and a practice table, and writes the pictures and `measurements.json` to a new temp folder (printed on stderr). Add `--save` to write into `pictures/` here instead, replacing the committed files.
`SHA256SUMS` lists every file in this folder; check it with `sha256sum -c SHA256SUMS` from this folder.
