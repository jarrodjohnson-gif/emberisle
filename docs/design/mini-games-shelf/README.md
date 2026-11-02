# Mini-games shelf: the lobby design for Jarrod to accept

Issue [#929](https://github.com/jarrodjohnson-gif/emberisle/issues/929). Design only: no game code changes.
Author: Claude Opus 5.5 (builder 2), 2026-11-02. Base: `main` at `39592f6`.

**Why now.** Jarrod on card `q970-waitbox` (2026-10-31): "C, wait for the mini-games shelf design … Get this finished asap we alr had mocks." So this spec builds on the mock that already exists ([`docs/design/mini-games-hub`](../mini-games-hub/README.md)) and adds nothing new. It fixes the mock to the lobby type and target scale Jarrod accepted on 2026-10-31 ([`docs/design/lobby-hig`](../lobby-hig/README.md), card `q1220-lobby-hig`, answer A). Once he accepts this, PR #970's "Play while you wait" box moves into the shelf.

## The design in one paragraph

The lobby card gets two tabs under the room code: **Table** (today's seats and chat, unchanged) and **Play games**.
- **The Play games tab:** opening it swaps the seats and chat for a "While you wait" shelf. The room code, a one-line roster and the Ready footer stay.
- **The shelf:** one tile per game. Only one game is open at a time.
- **Sandwich Stacker** is solo, and runs in #970's Ruffle box inside the tab.
- **Tic-tac-toe** is played with a table-mate, with moves relayed through the host.
- **Start:** when the host presses Start, any open game closes itself and the table never waits.
- **Defaults:** nothing opens by itself, sound is off, and there are no scores.

## The five questions on #929, with the mock's answers (Jarrod accepts or changes)

| # | Question | Recommendation | Why |
|---|---|---|---|
| 1 | One shelf with a tile per game, or one game at a time? | One shelf; one game open at a time | One box keeps the lobby card one scroll; a second open game would push Ready off a phone screen. |
| 2 | Where does it sit on a phone versus desktop? | A **Play games** tab in the lobby card, on both | A side panel would cover the island. A third chat tab would break Chat C's two-tab rule (DECISIONS 2026-10-20). |
| 3 | Which native game first? | Tic-tac-toe | Small rules, two players, nothing to write. Trivia needs question content and someone to write it. |
| 4 | Does it open by itself? | Only on tap; closed and muted by default | Matches #970 and #937 ("no key capture when closed"). Nothing loads until tapped. |
| 5 | Scores or leaderboards? | None to start | Each needs storage and profile work (#889 series). It is easy to add later. |

## Fixed to the accepted lobby scale

The mock was drawn before the lobby HIG audit was accepted. [`hig-layer.css`](hig-layer.css) applies the accepted scale on top of the unchanged mock. Layout, content and wording stay the same.

| Item | Mock as drawn (measured) | Proposed (the accepted lobby scale) |
|---|---|---|
| Captions, roster, tile sub-lines | 12 px | Footnote 13/18 |
| Tabs and ordinary buttons | 14 px | Subheadline 15/20 |
| "While you wait", game names, the open game's title, Ready and Start | 14 to 16 px | Headline 17/22 semibold |
| Room code | 36 px on a phone, 56 px on desktop | 22/28 on a phone, 28/34 on desktop, as in the real lobby |
| Controls under 44 px | Phone: Copy and Copy link (32 px). Desktop: both tabs, Copy, Copy link, Close, Quit game, Sound and Leave the table (32 to 36 px) | **None**, on phone or desktop |

Measured by [`measure.mjs`](measure.mjs) on all six screens at both sizes: [as drawn](measure-as-drawn.txt), [proposed](measure-proposed.txt). The only sizes left off the scale are mock placeholders and game art: board numbers, the X and O marks, the 580:320 stage label and the "Loads here when you tap" placeholder.

## Pictures (proposed)

All pictures are rendered from the mock by [`capture.mjs`](capture.mjs) with [`hig-layer.css`](hig-layer.css) on top. The mock's own review callouts are hidden.

The mock had a bug, fixed for both picture sets. The host's Start button has the class `sea`, which the mock also uses for the full-screen ocean (`position: absolute; inset: 0`), so on host screens Start filled the whole card. The fix is one scoped style in `capture.mjs`.

| Screen | Phone 390×844 | Desktop 1280×720 |
|---|---|---|
| A. Lobby, Table tab (Play games closed) | ![](pictures/proposed/phone-390x844-a-lobby-closed.png) | ![](pictures/proposed/desktop-1280x720-a-lobby-closed.png) |
| B. The shelf | ![](pictures/proposed/phone-390x844-b-shelf.png) | ![](pictures/proposed/desktop-1280x720-b-shelf.png) |
| B. Shelf, alone at the table (tic-tac-toe needs a table-mate) | ![](pictures/proposed/phone-390x844-b-shelf-alone.png) | ![](pictures/proposed/desktop-1280x720-b-shelf-alone.png) |
| B. Shelf, a table-mate invited you (badge on the tab) | ![](pictures/proposed/phone-390x844-b-shelf-invited.png) | ![](pictures/proposed/desktop-1280x720-b-shelf-invited.png) |
| C. Sandwich Stacker open (580:320 stage, muted, Close) | ![](pictures/proposed/phone-390x844-c-solo-stacker.png) | ![](pictures/proposed/desktop-1280x720-c-solo-stacker.png) |
| D. Tic-tac-toe with a table-mate | ![](pictures/proposed/phone-390x844-d-tictactoe.png) | ![](pictures/proposed/desktop-1280x720-d-tictactoe.png) |
| E. Host presses Start: the game closes itself | ![](pictures/proposed/phone-390x844-e-start-closes.png) | ![](pictures/proposed/desktop-1280x720-e-start-closes.png) |

The same screens as the mock drew them are in [`pictures/as-drawn/`](pictures/as-drawn/), for comparison.

Known small issue: at 17 px, the desktop "Sandwich Stacker" title in screen C wraps to two lines beside Sound and Close. The build can shorten the title or let the buttons wrap; the shelf itself is not affected.

## Open choices for Jarrod (one card)

Each has a recommendation; any of them can change without touching the rest.

| # | Choice | Recommendation | Why |
|---|---|---|---|
| A | Names: tab "Play games", heading "While you wait" | Keep both | Plain words; "While you wait" says the table comes first. |
| B | Do seats and chat hide while Play games is open? | Yes, the tab swaps them; the one-line roster and Ready stay | Keeps the card one scroll on a phone. |
| C | Tic-tac-toe: invite a named seat, or "anyone free"? | Named seat (as the mock draws it) | No surprise games; the invite badge goes to one person. |
| D | Left and Right buttons for Sandwich Stacker on desktop | Hide on desktop (arrow keys); show on touch | The buttons exist for phones; desktop has a keyboard. |
| E | Does pressing Ready close an open game? | No; only Start closes games | Ready is "I'm here"; a game can keep running until the table starts. |
| F | Show a locked "Trivia, Soon" tile? | Hide it until trivia exists | Fewer things on the screen (Jarrod's 10-31 note on the title: "too busy"). |
| G | What do spectators get? | Sandwich Stacker only, with no invites | They have no seat to play from; solo play stays harmless. |

## After acceptance: the build, split by risk

1. **Shelf and tab (tier 2, `lane:hud`):** the two tabs, the shelf, and #970's box moved into it, at the accepted scale, with a lobby proof at 390×844 and 1280×720. PR #970 is reworked or replaced so its box lands here, not above the chat.
2. **Tic-tac-toe (tier 1, `lane:net`):** host messages, invites, seat-id relay, and closing on Start and Leave. It must never block or slow the table. Opus builds; a different model reviews.
3. **Trivia:** later. It needs content and an owner decision on who writes it.

Nothing in this folder is game code; the build starts only after Jarrod's OK on the Decisions page.
