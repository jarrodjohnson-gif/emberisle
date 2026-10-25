# Chat, reactions and soundboard: audit (main c8df182, 2026-10-20)

Captured from the real app: host.mjs plus the Vite dev server, three seated browsers (1280x720, 390x844, 844x390) and one bot.
The raw screenshots and the A, A2 and B mocks stayed in the review desk's scratchpad. Only the C mocks are committed here, as `.jpg`. Names: `desk-*` is 1280x720, `phone-*` is 390x844, `land-*` is 844x390.

## What exists today

- Chat dock: `Open chat` button in the top row. Desktop opens a 288 px panel at the top right. Phone opens a bottom sheet.
- Quick reactions: a smile button next to `Open chat`. Six emoji (keys 1–6) and the one sticker. Game only, not in the lobby.
- Chat emote tray: a second smile button inside the chat box. Stickers only, no emoji. Game and lobby.
- Soundboard: a speaker button inside the chat box, beside the emote smile. A horizontal row of nine chips. Game and lobby.
- Player menu: tap a seat card. One unlabeled sticker, no emoji. The only way to aim a reaction at someone.
- Floats: a reaction shows over the sender's seat card for 2 s, then is gone. Sounds show only as a chat line `🔊 Label`.
- Owner decisions that bind this audit: one tray for all reactions, in game and lobby (`docs/design/emotes.md`, Decision 4). Emotes pinned on the seat (#847) rejected because they covered the lobby name; the in-game badge was "better".

## Tap counts (seated player, chat closed)

| Action | Game, desktop | Game, phone | Lobby |
|---|---|---|---|
| Send an emoji | 2 | 2 | not possible |
| Send the sticker | 2 | 2 | 2 (or 3 if the row is hidden) |
| Play a sound | 3 (Open chat, speaker, chip) | 3 | 2, but see problem 1 |
| See the last 5 sounds | scroll the chip row | scroll | scroll |
| Aim a reaction at a seat | 2, but only the sticker | 2 | not possible |

## Problems, worst first

1. **Lobby chat is under the footer at 1280x720 (#895).** `desk-lobby-chat.png`, `desk-lobby-soundboard.png`, `shots/895-before.png`.
   - The sticky Ready/Start footer covers the input, Send, the smile and the speaker. A hit test from the live run found all four unreachable.
   - With the sound row open, five of nine chips are also under the footer. Nothing says "scroll".
   - Hurts: nobody can type in the desktop lobby without discovering the hidden scroll.
2. **The soundboard is hidden three taps deep and shows nothing on the table.** `desk-game-chat-soundboard.png`, `phone-game-chat-soundboard.png`.
   - You must open chat, then press an unlabeled speaker icon, then find the chip.
   - The row scrolls sideways with no hint. Desktop shows 4 of 9 chips; the phone cuts "Quit touchin'" mid-word.
   - A tap plays a clip and writes `🔊 Label` into the chat log, which is usually closed. You hear it, but can't see who did it.
   - Chip text is 12 px; the chat lines are 14 px.
3. **Reactions live in three pickers that don't agree.** `desk-game-quick-picker.png`, `desk-game-chat-emotes.png`, `desk-game-player-menu.png`, `phone-lobby-emotes.png`.
   - Quick picker: emoji and sticker. Chat tray: sticker only. Player menu: sticker only, no label.
   - The lobby has no emoji at all; the quick picker is mounted only during play.
   - Two smile icons sit 100 px apart on desktop and mean different sets. Decision 4 already says "one tray".
4. **Floats are easy to miss and cover the phone seat name.** `phone-game-reaction.png`, `land-game-reaction.png`, `desk-game-reaction.png`.
   - 2 s on the sender's seat only. If you were looking at the island, it is gone before you turn.
   - On the phone strip the 48 px float sits on top of the 80 px cell and hides the name ("Tid").
   - Reactions are not written to the log, so a late look shows nothing. Sounds are, reactions are not: inconsistent.
5. **Open chat and the picker cover the board.** `land-game-chat-open.png`, `phone-game-quick-picker.png`, `land-game-quick-picker.png`.
   - Sideways phone: the open chat sheet covers the whole island. You can't read a trade and the board at once.
   - Portrait phone: the picker drops over the top two hex rows. Sideways: over the right third of the island.
   - Desktop: the open panel sits over the rightmost sea only. Fine.
6. **Two speaker icons mean opposite things.** `desk-game-chat-open.png`.
   - The header has `Mute` (speaker-x). The composer has an unlabeled speaker for the soundboard. Same glyph family, 250 px apart.
7. **The chat panel spends a row on Chat/All/Copy log.** `desk-game-chat-open.png`.
   - With filters, presets, sound row and composer open, the desktop log shows about 4 lines of its 360 px.
   - Phone sheet is fine: 8 lines.
8. **Small things.**
   - Emoji in the quick picker are 24 px glyphs next to a 32 px sticker; the picker has no labels or key hints visible.
   - The unread preview pills at the top right overlap the picker when both are open.
   - The player menu's sticker is a bare image button; nothing says "react".

## Not a problem

- The closed-chat preview (last lines under the icons for 6 s, with an unread badge) works on every size. `desk-game-closed-preview.png`, `phone-game-closed-preview.png`.
- 44 px targets, glass surfaces, 8 px corners and the 4.5:1 text contrast hold everywhere `chat-prove` checks.
- The lobby float sits mid-row, away from the name, so it is not the #847 problem. `desk-lobby-reaction.png`.

## Two directions

Both: one tray (Decision 4), the chat's smile tray and speaker toggle go, the soundboard gets 14 px labels, reactions and sounds are written to the chat log as light lines, and the lobby composer stays above the footer (the log is the only piece that shrinks, #417).

### A. Seat bubbles and one tray (`mock-A-desktop.png`, `mock-A-phone.png`, `mock-A-lobby.png`)

- Where reactions appear: a speech bubble with a tail, hung off the sender's seat card. Desktop: to the right of the rail card, over the sea. Phone: under the strip cell. Lobby: mid-row, as today. The bubble never sits on the name, which is what sank #847.
- Sounds appear the same way: a `🔊 Wololo` bubble with a 3 s bar, so a sound has a face.
- How you reach the soundboard: the one smile button opens a tray with the emoji row, the sticker, and all nine sound chips in a grid. 2 taps for anything, no sideways scroll. Phone: the tray is a bottom sheet that leaves the island clear. Lobby: the same smile sits in the composer and the tray opens upward.
- Fixes problems 1 (composer stays up), 2, 3, 4, 5 (phone tray is a sheet), 6 (one speaker, labeled "Sounds").
- Cost: a bubble per seat is a new component with placement rules per layout. The tray is bigger than today's picker.

### B. One-tap bar and a feed lane (`mock-B-desktop.png`, `mock-B-phone.png`, `mock-B-lobby.png`)

- Where reactions appear: a feed lane where the chat preview already is (under the top-row icons). Each reaction, sound or chat line is a pill with the sender's dot and name, newest at the bottom, 6 s each. The sender's seat card only pulses its edge in their colour, so nothing is covered.
- How you reach the soundboard: the emoji are always on the bar, one tap. A labeled `Sounds` chip flips the bar into the nine chips in place; a second tap plays. Desktop: the bar is the top row. Phone: the bar replaces the two floating icons under the seat strip. Lobby: the bar is a row in the chat box where the presets were; reactions become log lines.
- Fixes problems 1, 2, 3, 4 (one lane, logged), 6, 7 (bar is outside the panel). Problem 5 is unchanged on the sideways phone.
- Cost: the top row is busier (10 controls on desktop). The phone bar is 44 px tall under the strip, over sea. "Who" is a name in a pill, not a face.

### Recommendation

A. Jarrod liked the in-game badge on the seat; A keeps that feeling and fixes the lobby overlap by hanging the bubble off the row instead of on it. B is the cheaper build and the better phone-thumb ergonomics, so if A is too much, take B's bar and A's bubble.

## Builds on

- `src/components/game/Chat.tsx` ChatBox: remove the emote tray and soundboard toggle; keep presets and the composer.
- `src/components/game/Reactions.tsx` QuickReactions: add the sound grid (A) or become the bar (B); mount in the lobby too.
- `src/components/game/Reactions.tsx` ReactionFloat: bubble with tail (A) or pill in a feed (B); add a sound float.
- `src/components/game/Lobby.tsx`: the chat box gets `min-h` for the composer and the log takes the squeeze (#895).
- `src/lib/game/store.ts`: log reactions and sounds as `GameLogLine` so the All filter shows them.

### A2. Seat bubbles and a tabbed tray (`mock-A2-desktop.png`, `mock-A2-desktop-sounds.png`, `mock-A2-phone.png`, `mock-A2-lobby.png`, `a3.png`)

- Jarrod picked A. A2 is A with two tabs at the top of the tray: React (emoji and sticker) and Sounds (all nine chips in a grid).
- React is the default. The tray remembers the last tab, so a second sound is 2 taps again.
- Everything else is A: seat bubbles, the bottom sheet on the phone, the smile in the lobby composer, the #895 fix.
- Trade-off: the first sound costs one tap more (smile, Sounds, chip). The tray is about half the height, so the phone sheet is 150 px on React and the lobby tray covers one seat row instead of four.

### C. One chat button, two tabs (`mock-C-desktop.jpg`, `mock-C-desktop-sounds.jpg`, `mock-C-phone.jpg`, `mock-C-lobby.jpg`, `mock-C-lobby-sounds.jpg`, `c-board.jpg`)

- Jarrod's plan: one entry, the chat button. The smile button and the speaker toggle go.
- Tab 1 "Chat" (default): log, a row of the 6 basic emoji just above the composer (1 tap), composer. Reactions and sounds also land in the log.
- Tab 2 "Sounds & stickers": the 9 sound chips in a grid, stickers below.
- Emotes and sounds show as the seat bubbles from A, off the card, never on the name.
- Never covers seats: lobby chat sits below the seat list and the composer stays above Ready (#895); the desktop panel sits at the right, clear of the rail; the phone sheet ends under the island and leaves the strip clear.
- Cost: a sound is 3 taps the first time (chat, tab, chip) and 2 after, since the tab is remembered. At 1280x720 the lobby log is about 1–2 lines, as #417 already allows.
