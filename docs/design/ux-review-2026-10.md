# UX review, October 2026

A playtest of the browser table as a first-time player would meet it, on `origin/main` at `bd1c55f`
(2026-10-04). Findings are ranked by player impact. Each one names the screenshot it came from, the
evidence, a concrete recommendation, a size (docs/FRAMEWORK.md §3), and the issue that tracks it.

Sources: docs/BUILD_BIBLE.md §3-4 and §7-8, docs/design/title-lobby.md, docs/design/mobile-hud.md,
docs/design/mobile-camera-touch.md, the open design nodes #124, #129 and #135, and the recent UX
issues #389 and #402. Nothing below re-files those; where a finding lands inside one of them it says so.

## How the playtest was run

Headless Chromium (Playwright, SwiftShader GL) against a Vite dev page and the rules host, on three
viewports:

| Tag | Viewport | Pointer |
|---|---|---|
| `desk` | 1280x720 | mouse |
| `port` | 390x844 | touch, `isMobile` |
| `land` | 844x390 | touch, `isMobile` |

Each viewport went title → How to play → a bad join code → practice versus the isle (roll-off, setup, a
roll, main with goods, an armed Path, the trade panel, every fortune in hand, a 7 with a discard, the
wayfarer, Take from whom, someone else's turn, the win, Look around) → hotseat (roll-off, another seat's
discard) → online with three tabs (host alone in the lobby, two joiners, Ready and Start, the roll-off,
a table trade seen by the receiver, two players dropping). On desktop the practice game ran to a real win
at turn 25. Alongside the screenshots the run measured every interactive element's size, how much of the
viewport takes the pointer instead of the island ("HUD coverage"), and how many legal setup corners sat
under the HUD.

Screenshot names below (`desk-05-main`, `port-01b-howto`, …) are the run's own. To regenerate the same
frames: `node scripts/shots.mjs` (desktop, `01-title` … `08-win`), `node scripts/shots.mjs --size 390x844
--coarse` and `--size 844x390 --coarse` (phone), `npm run mobile-shots` (setup and the Place chip). The
title How to play and lobby frames are one click past `01-title` / `02-lobby`.

## North star: how the HUD and the board should feel

The island is the product. Everything else is a thin rim around it.

- **One voice.** A single sentence, in one place, says whose turn it is and what to do *right now* —
  including while a build is armed ("Pick a glowing edge · Esc cancels"). It never shares the screen with a
  second sentence saying the same thing in other words.
- **Chips, not panels.** Text sits on one glass treatment that reads over any hex. Nothing but a true
  modal (trade, discard, win) covers the centre. The hand is a strip, not a card row; actions are one row.
- **Hidden means illegal.** If you cannot do it now, the button is not there (build bible §4.2). The only
  greyed buttons are the three build buttons in `main`, which show their price so people learn it.
- **The phone is a player, not a spectator.** Portrait and landscape both show the whole island large
  enough to tap a corner; the HUD never takes more than about a third of the screen in either.
- **Board first, chrome second, text last.** A new player should be able to read the island (numbers,
  pieces, the wayfarer) at a glance, find their one next action in under a second, and only then read.
- **Dry, woody, immediate.** Every press clicks, every piece knocks, every turn change moves something.
  No stingers, no music, no shake.

## Findings, ranked by player impact

### 1. Phone: How to play on the title is trapped inside the card — #416 (XS, fix in PR #426)

- **Screenshots:** `port-01b-howto`, `land-01b-howto`, `probe-phone-howto`.
- **Evidence:** `Title` mounts `HowTo` inside the absolutely positioned title card, so its `absolute
  inset-0` backdrop covers the card's box, not the screen. On 390x844 the card is a 55vh scrolling sheet:
  the dialog heading and Close land above the card's clip box (Close at y 326-370 px; card top 368 px).
  Tapping the island does nothing. The first thing a new phone player taps has no visible way out. In
  landscape the heading is behind the top edge for the same reason. `Hud.tsx` mounts the same dialog at
  its root, where it works.
- **Recommendation:** mount it beside the card in a fragment, as `Hud.tsx` does. Proof `howto-prove` at
  three viewports: backdrop equals viewport, Close on screen and hit-testable, Close closes.

### 2. Desktop 1280x720: the lobby clips Start and hides Leave — #417 (XS)

- **Screenshots:** `desk-12c-lobby-ready`, `probe-lobby-start-720`.
- **Evidence:** the desktop lobby card is `top-10 bottom-10 overflow-y-auto`. With three seats ready it
  holds the code, four seat rows, the 6-row chat box, the log line, then Ready, Start, Leave. Measured:
  Start at y 649-697 against a card ending at 680; Leave the table at 705-745, entirely below the fold.
  No scroll cue. This is the host's one action on game night, at the README's own target size. #389
  fixed the same shape on the phone sheet with a sticky action row; desktop did not get it.
- **Recommendation:** pin `lobby-actions` on every viewport (the #389 treatment), or drop the chat to 4
  rows under 760 px tall. Proof: Start's and Leave's boxes inside the card's visible box.

### 3. The lobby never says what is missing before Start — #418 (XS)

- **Screenshots:** `desk-12-lobby-alone`, `desk-12b-lobby-3`.
- **Evidence:** alone, the host sees one seat, three "Empty" rows, an empty chat box, "Ember sat down."
  and a Ready button. Start appears only when 3-4 seats are all Ready, and nothing says so. Joiners see
  "Waiting" with no hint that Ready is theirs to press.
- **Recommendation:** one status line from the seat list: "Waiting for 2 more players (3 or 4 play)" →
  "2 of 3 ready" → "Everyone is ready". `aria-live` like the log line.

### 4. Arming a build changes nothing the player can read — #419 (XS)

- **Screenshots:** `desk-05b-armed-path`, `port-05-main`.
- **Evidence:** pressing Path darkens the button and glows the legal edges, but the banner still says
  "Your turn — Build, trade with the bank, or end your turn." Nothing says "pick a glowing edge" or how to
  cancel. The road-fortune flow *does* show a line ("Path fortune: pick two paths on the glowing edges"),
  so the pattern exists for one case out of five.
- **Recommendation:** while `buildMode` is set, the banner's phase text becomes the instruction, with the
  cancel hint (Esc, or "tap the button again" on touch). Coordinate with the agents in `Hud.tsx`.

### 5. Phone portrait: the seat strip shows "T… E… P… D…" — #420 (XS)

- **Screenshots:** `port-03-setup`, `land-03-setup`.
- **Evidence:** four cells of ~80 px each hold a dot, a name, the roll-off die and the VP; `truncate`
  leaves a single letter and an ellipsis. During the roll-off the die and VP sit together unlabelled
  ("4 1" reads as 41).
- **Recommendation:** a deliberate short form under 100 px (first three letters, no ellipsis), and the
  roll-off die only while the roll-off is live.

### 6. Phone landscape: the title card overflows the top — #421 (XS)

- **Screenshot:** `land-01-title`.
- **Evidence:** at 844x390 `Title` uses the desktop card with no max height; "Emberisle", the eyebrow and
  the tagline are above the viewport. The first thing a landscape phone shows is the name field cut off at
  the top. `land-01b-howto` shows the same clip on the dialog.
- **Recommendation:** `max-h-[calc(100dvh-1.5rem)] overflow-y-auto` on the card in landscape (the sheet
  already does it in portrait), or hide the tagline under `short:`.

### 7. Phone landscape: the island is a 150 px thumbnail — #422 (S)

- **Screenshots:** `land-03-setup`, `land-05-main`, `land-07-discard`.
- **Evidence:** the overhead fit draws the whole island about 150x150 px between the seat strip and the
  bottom stack. Corners are a few px apart, under the 24 px touch slop, so setup is placed by luck or by
  the keyboard list. HUD coverage 34 % (setup) to 55 % (main). This is the orientation the in-game hint
  tells players to turn to.
- **Recommendation:** fit to the hole's height in landscape and let the hand and actions sit beside the
  island as a column. Depends on #175 (in review); sits next to #135.

### 8. Fortunes are raw selects in the action row, under three different names — #423 (S)

- **Screenshots:** `desk-06b-fortunes`, `port-06b-fortunes`, `land-06b-fortunes`.
- **Evidence:** with every fortune held the row becomes "Wayfarer card · Path fortune · [Timber ▾]
  [Timber ▾] Plenty · [All Timber ▾] Monopoly". The rail calls the same cards "knight · path · plenty ·
  monopoly · points". The README itself uses two vocabularies: its Names section says wayfarer and fortune
  (no "knight"), while the Rule set prose says knight and path-building. Nothing on the table says what a
  card does or that one bought this turn is blocked. On a phone it is five rows and the island is gone.
- **Recommendation:** one "Fortunes ×N" button opening a tray: name, count, one-line effect, blocked
  state, Play; Plenty and Monopoly pick with chips, not `<select>`. The rail and the tray use one set of
  names; which set is Jarrod's call (Questions, 2). Touches the same files as #323 (the Hud.tsx split);
  sequence after it.

### 9. Text chips at 45 % glass vanish over the hexes — #424 (XS)

- **Screenshots:** `desk-09-waiting`, `land-06b-fortunes`, `land-07-discard`.
- **Evidence:** on another seat's turn the banner ("Pine (bot)'s turn — Roll the dice…") is a faint strip
  under the opaque roll line; in landscape the "Your turn — …" banner is grey-on-grey over the island.
  Three chip treatments share one screen (45 % glass, opaque `bg-surface`, `bg-raised` white) and the
  bottom log line is grey text straight on the board. #381 fixed button contrast but cannot see a glass
  chip over a changing render.
- **Recommendation:** one glass token at ≥ 70 % white for every text chip; the log line gets the banner's
  chip. Proof by sampling the banner's pixels over the setup board.

### 10. Buttons are silent though the sounds are already shipped — #425 (XS)

- **Evidence:** build bible §3.4 asks for `ui_click` on press and `ui_back` on Esc. `click_001.wav`,
  `click_002.wav` and `back_001.wav` are in `public/audio/` and named in `server/cue.mjs`, but
  `src/lib/sound.ts` has no `ui_click`/`ui_back` and `Button` plays nothing. The title's mute toggle
  therefore appears to do nothing until a game starts.
- **Recommendation:** `ui_click` on `pointerdown` in `Button`, `ui_back` in the three Escape handlers.
  Proof stubs `HTMLMediaElement.play`.

### Inside existing nodes (not re-filed)

- **HUD coverage and buried corners — #129 and #135.** Measured on desktop: 25 % of the viewport takes
  the pointer in setup, 29 % in the roll-off, 32 % in `main`; 7 of 50 legal setup corners sit under the HUD
  and 2 are off-screen (`desk-03-setup`). On a phone in portrait: 35 % (setup), 56 % (`main`), ~65 % with
  fortunes held. These are the numbers #129's completion test ("no panel over any glowing corner", "a bar
  no taller than ~15 %") should be checked against. The phase sentence sits in the bottom stack, not
  top-left as §4.1 asks; #129 picks the seat.
- **The roll is shown three times — #129.** `desk-05-main`: the roll line ("Ember rolls 2+3 = 5 · …"), the
  dice row with its sum, and the log line all carry the same roll at once, in three styles. One place.
- **Discard is five number inputs — #129.** `desk-07-discard`, `port-07-discard`: `<input type=number>`
  per resource, wrapping to three rows on a phone, against §4.5's "click chips to mark them". #129 already
  specs a stepper picker; the phone shots are the evidence for its priority.
- **Short-height scroll cue — #402.** Nothing new to add; `port-06b-fortunes` is one more case where it
  matters.

### Smaller notes (doc only)

- **Title copy.** "Play versus the isle" and "Four seats, one table" do not say "3 bots, no network" and
  "pass the device". The colour swatches have no visible names; the selected one differs by a 2 px border.
  A subtitle under each button and a name under the chosen swatch would fix both. Wording is a branding
  call for Jarrod (see Questions).
- **Win table on a phone** abbreviates to OUT / STR / PATH / ARMY / HID (`port-10-win`). Full words fit if
  the table scrolls sideways or the player column wraps. `WinScreen.tsx` is in flight (rematch), so hold.
- **Hotseat discard banner** says "Seat 2's turn — Too many goods…" while the turn is Ember's and Seat 2
  only owes a discard (`desk-11b-hotseat-discard`). "Seat 2 — discard 4" would be truer. Filed as #430 (XS).
- **"Turn the phone sideways"** stays until dismissed and sits inside the stack, pushing the island up
  (`port-05-main`). Auto-hide after the first rotate, or after 10 s.
- **Touch targets.** On every phone frame the measured interactive elements are at or above 44 px except
  the title colour swatches (32 px), the lobby Copy / Copy link (32 px), the chat presets (22 px tall) and
  the emote button (32 px). All on the lobby/title, none mid-game. Worth one pass when the title is next
  touched.
- **Good as is.** The join error ("No table with that code") is inline, red and immediate. The trade toast
  (`probe-online-trade-receiver`) is the clearest element on the table: one line, Yes / No at full width,
  a countdown. The hand's +N / −N flash, the dice pips, the seat rail's hidden-point line, and the
  reconnecting state on the rail all read well. Online, a dropped seat shows "reconnecting…" and the game
  keeps its place.

## Issues filed

| # | Title | Size |
|---|---|---|
| #416 | Mount the title's How to play outside the card so its Close is on screen on a phone | XS (PR #426) |
| #417 | Keep the lobby's Start and Leave inside the card at 1280x720 | XS |
| #418 | Say in the lobby what is still needed before Start appears | XS |
| #419 | Tell the player what to do once a build button is armed | XS |
| #420 | Stop the phone seat strip truncating names to one letter | XS |
| #421 | Cap the title card's height in phone landscape so the wordmark stays on screen | XS |
| #422 | Fit the island to the landscape phone's HUD hole instead of a 150 px thumbnail | S |
| #423 | Replace the inline fortune selects with a fortune tray | S |
| #424 | Raise the glass behind text chips so the other seat's turn banner reads over the hexes | XS |
| #425 | Play ui_click on every button press and ui_back on Escape, as the build bible asks | XS |
| #430 | Hotseat: the discard banner names the discarder as the turn owner | XS |

## Questions for Jarrod

These are look and wording calls, not bugs. Everything above can ship without them.

1. **Title button wording.** May the two secondary buttons carry a one-line subtitle ("3 bots, no network" /
   "pass one device around"), or should the labels themselves change?
2. **Fortune names in the UI.** The README's Names section says wayfarer and fortune (no "knight"); its
   Rule set prose says knight and path-building. The HUD follows Names ("Wayfarer card", "Path fortune"), the
   rail follows the Rule set ("knight ×1 · path ×1"). Which governs the UI? #423 will use whichever you pick,
   in both places.
3. **Hover sound.** §3.4 asks for `ui_hover`; across a five-card hand bar it would retrigger constantly.
   #425 leaves hover silent. Agree?
