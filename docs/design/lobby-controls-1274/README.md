# Lobby controls: one look, and tap the code to copy (#1303, for #1274)

**Design stage only. No game code changes.** Jarrod picks from the questions below, then a builder takes it after #1220 lands.
Author: Claude Opus 5.5, 2026-11-07. Base: `main` at `a482f38`.

Jarrod's findings on #1274 (2026-11-03):

- Copy, Copy link and Invite "look really weird". The code could be copied by tapping it.
- Rules has a box, but Table and Play games do not. Which ones can be tapped is unclear. Give all three one look.

## The proposal

**Header.** The room code is the copy button. It shows the code, a copy icon and the word "Copy". A tap copies the code and the word turns to a green "Copied" for 1.5 s. One **Invite** button sits at the right end.

**Table row.** Table, Play games and Rules are the same box as every other lobby button: 44 px tall, no fill, a 1 px control-line edge, 8 px corners, 15 px semibold text. They sit 8 px apart.

- The picked tab is filled white, with ink text and a 3 px ink bar along its bottom edge.
- The other tab has no fill, grey text and no bar.
- Rules has ink text and a book icon on wide screens. It opens a sheet; it never shows as picked.

| Today, 390 × 844 | Proposed, 390 × 844 |
|---|---|
| ![Today](before-390x844.png) | ![Proposed](a-table-390x844.png) |

Every picture also carries the accepted #1220 type and spacing ([`lobby-hig/after.css`](../lobby-hig/after.css)), which is not built yet. "Today" pictures are `main` as it is.

## What each control does

| Control | Tap | Keyboard and screen reader | After |
|---|---|---|---|
| Code | Copies the code | A button named "Table code A B 2 3. Copy". The letters are read one by one. | "Copied" for 1.5 s, and the polite live line says "Copied" |
| Code, clipboard blocked | Shows today's fallback: "Select and copy" with the code in a field, selected and focused | The live line says "Select and copy" | Stays until the next copy |
| Invite | Opens the phone's share sheet. Where there is none (most desktops), copies the join link | A button named "Invite" | "Copied" on the button for 1.5 s when it copied the link |
| Table, Play games | Picks the view | `role="tablist"` with two `role="tab"`, `aria-selected`. Left and Right move between them; Home and End jump. Only the picked tab is in the Tab order | The view changes under the row |
| Rules | Opens the rules sheet, as today | A button named "Rules" | Focus goes back to Rules when the sheet closes, as today |

Nothing else changes: host, Ready, Start, Add bot, Remove bot, chat, reactions, the Play games shelf and Leave all work as today. The tic-tac-toe invite badge stays on the Play games tab.

## Pictures

Proposal A with the joined tab look shown for comparison. All with a real host, a guest (Josh), a bot and one chat line.

| State | 320 × 568 | 390 × 844 | 844 × 390 | 1280 × 720 |
|---|---|---|---|---|
| Today | [before](before-320x568.png) | [before](before-390x844.png) | [before](before-844x390.png) | [before](before-1280x720.png) |
| Proposed (A) | [a-table](a-table-320x568.png) | [a-table](a-table-390x844.png) | [a-table](a-table-844x390.png) | [a-table](a-table-1280x720.png) |
| Header option B | [b-table](b-table-320x568.png) | [b-table](b-table-390x844.png) | [b-table](b-table-844x390.png) | [b-table](b-table-1280x720.png) |
| Joined tabs | [joined](joined-table-320x568.png) | [joined](joined-table-390x844.png) | [joined](joined-table-844x390.png) | [joined](joined-table-1280x720.png) |
| Copied, code `WWWW` | [copied](a-copied-320x568.png) | [copied](a-copied-390x844.png) | [copied](a-copied-844x390.png) | [copied](a-copied-1280x720.png) |
| Clipboard blocked | [blocked](a-blocked-320x568.png) | [blocked](a-blocked-390x844.png) | [blocked](a-blocked-844x390.png) | [blocked](a-blocked-1280x720.png) |
| Play games tab | [games](a-games-320x568.png) | [games](a-games-390x844.png) | [games](a-games-844x390.png) | [games](a-games-1280x720.png) |
| Host alone | [empty](empty-320x568.png) | [empty](empty-390x844.png) | [empty](empty-844x390.png) | measured |
| Four seats, Start | [full](a-full-320x568.png) | [full](a-full-390x844.png) | [full](a-full-844x390.png) | measured |
| Text 125% | [125](a-text125-320x568.png) | [125](a-text125-390x844.png) | [125](a-text125-844x390.png) | measured |
| Text 150% | [150](a-text150-320x568.png) | [150](a-text150-390x844.png) | [150](a-text150-844x390.png) | [150](a-text150-1280x720.png) |

| Copied, 320 × 568 | Blocked, 390 × 844 | Play games, 1280 × 720 |
|---|---|---|
| ![Copied](a-copied-320x568.png) | ![Blocked](a-blocked-390x844.png) | ![Play games](a-games-1280x720.png) |

## Measurements

From the final run of [capture.mjs](capture.mjs). The full numbers are in [measurements.json](measurements.json). Chromium 153.0.8010.12, browser errors 0.

| Check | Result |
|---|---|
| Header fits, nothing cut, every state of proposal A, `WWWW` and `MMMM` included, at 100%, 125% and 150% text | Yes, at all four sizes |
| Table, Play games and Rules fit their row, every state, every text size | Yes, at all four sizes |
| Header option B fits | No at 320 × 568: the code is cut inside its button. Yes at the other three sizes |
| Controls under 44 × 44 | None in any state. The one exception is today's blocked-clipboard field (32 px tall), which this design does not change |
| Gap between targets | 8 px minimum in every 100% state, with two exceptions. The joined tabs touch (0 px), by design. In the blocked state, today's fallback panel lies over the Table row, as it does today |
| Chat share (#1103 floors) | 52.3% at 390 × 844 (floor 52%), 39.5% at 844 × 390 (floor 39%), 41.6% at 1280 × 720 (floor 40%): the same as today |
| Chat at 320 × 568 | The log keeps 48 px, about two lines, with #1220's scrolling emoji row (0 px today) |
| Wayfarer line cut | The same as today at every size. Rules drops its book under 901 px wide so the line keeps its room |

Header widths at 100% text, proposal A:

| Size | Code button | Invite |
|---|---|---|
| 320 × 568 | 151 px, 174 px with `WWWW` | 70 px |
| 390 × 844 | 175 px, 203 px with `WWWW` | 78 px |
| 844 × 390 | 187 px, 228 px with `WWWW` | 78 px |
| 1280 × 720 | 194 px, 228 px with `WWWW` | 78 px |

Code widths vary a few pixels with each run's code.

### Text size

The new controls use rem, so they follow the user's text size. The studies set the page to 125% and 150%.

- The header row and the Table row hold at every size and both text sizes.
- On a narrow header at big text, Invite becomes a 44 px person-plus icon, then the code button keeps only its copy icon. Their names do not change. At 100% text no phone reaches either step.
- At 150% text on a phone, Rules keeps only its book.
- The code itself does not grow past its 100% size, so the 44 px header row never grows.
- The rest of the lobby is still in px and breaks at 150% (Remove bot, Add bot and the chat field overlap). That is #1235's work, not this issue's.

## Questions for Jarrod

**1. The share buttons.** A (recommended): tap the code to copy it, and one Invite button. B: tap the code, and keep Copy link and Invite. C: tap the code, and one Copy link button with no share sheet. D: something else.

- A keeps both behaviours. On a phone, the share sheet has its own Copy. On a desktop, Invite copies the link.
- B keeps three things to tap and does not fit a 320 px phone without cutting the code.

**2. The tab look.** A (recommended): Table and Play games are two boxes 8 px apart, and the picked one is white with an ink bar. B: the two tabs join in one track (the iPhone look), 0 px apart. C: keep today's tabs and take the box off Rules instead. D: something else.

- A keeps the 8 px rule between every two targets.
- B reads more clearly as "pick one of two", but the tabs touch.

## Notes for the builder

- Build after #1220 (same files). Keep `data-testid="table-code"` on the code text inside the new button; many proofs read it.
- These proof lines use today's controls. Each is replaced in its own commit with an old/new table, per [DECISIONS](../../DECISIONS.md) 2026-10-25. None is deleted.
  - `scripts/lobby-layout-prove.mjs`: lines 194, 245 to 251, 259, 276, 277, 297, 312, 320 to 325 and 390 (the Copy, Copy link and Invite buttons and `.lobby-copy-controls`).
  - `scripts/lobby-wait-box-prove.mjs`: 106, 172, 220 and 229 (Play games and Table as `aria-pressed` buttons in `.lm`).
  - `scripts/lobby-tictactoe-prove.mjs`: 86, 137, 152 and 157 (the same).
  - `scripts/client-prove.mjs`: 605 and 619 (Copy link and Copy).
- Under option A, Copy link has no button of its own. The proofs that click it click Invite on a page with no share sheet, which copies the same link.

## How it was made

- [capture.mjs](capture.mjs) starts a real host and opens the lobby at each size, then adds a guest, a bot and a chat line.
- [controls.tsx](controls.tsx) renders the proposed header and Table row with the game's own store and copy helper (`useCopy`, `CopyFallback`). Table and Play games press today's hidden buttons, so the lobby below is the real one. [controls.css](controls.css) holds the look, in the game's tokens.
- No `src/` file changed. The built CSS is byte-identical with and without this folder.
- Run it from the repo root: `node docs/design/lobby-controls-1274/capture.mjs`. It writes to a temp folder; add `--save` to write here. Codes differ between runs.
