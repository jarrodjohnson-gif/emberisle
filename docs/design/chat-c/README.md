# Chat C: one chat button, two tabs (the owner's pick)

Jarrod picked direction C on 2026-10-20, with one change. Fable's audit is in `audit.md`. Its other screenshots and the A, A2 and B mocks were not committed. The mocks are the `mock-C-*.jpg` files and `c-board.jpg`.

## The design

- **One button.** The chat button opens one panel. Remove the separate smile (quick reactions) button. Remove the speaker (soundboard) toggle inside chat.
- **Tab 1, Chat (default):**
  - the message log
  - a row of the 6 basic emoji right above the composer, one tap to send
  - the composer and Send
- **Tab 2, Sounds & stickers:** all 9 sound chips in a grid, with 14 px labels. Below them, the stickers.
- **At most two tabs.** The panel remembers the last tab.
- **Seat bubbles.** An emote, sticker or sound shows as a bubble beside the sender's seat card. It never covers the name.
  - Desktop: right of the rail card.
  - Phone: under the strip cell.
  - Lobby: mid-row.
  - Emotes, stickers and sounds are also written as light lines in the log.
- **Owner change: chat messages bubble when chat is closed.** For a viewer whose chat panel is closed, a new chat message shows as a bubble at the sender's seat. It fades away like a sticker. When the panel is open, messages show only in the log.
- **Nothing covers seats.**
  - Lobby: chat sits below the seat list, inside the card. The composer stays above the Ready footer. This fixes #895.
  - Desktop game: the panel sits at the right, clear of the seat rail.
  - Phone: the bottom sheet ends under the island. It leaves the seat strip and the bubbles clear.
- **Costs we accept.** The first sound takes 3 taps (chat, tab, chip), then 2. The lobby log shows 1–2 lines at 1280x720.

## Replaces

- #847 (the emote badge on the seat). The seat bubble is its in-game form.
- The three separate pickers named in `audit.md` problem 3.
- `docs/design/emotes.md` Decision 4 ("one tray") stays true: the tray is now the chat panel.
