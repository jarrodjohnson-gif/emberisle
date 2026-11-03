# #903 final screens (owner votes, 2026-10-24)

Rendered from Astra's `final-gallery.html` by the review desk (Chromium, exact sizes). Left half of each picture is today's screen, right half is the new one. Astra's own notes are in [`../3-directions.md`](../3-directions.md); the laws are in [`../laws/`](../laws/).

| Screen | Owner vote | Picture |
|---|---|---|
| Title, phone upright | Approved | `title-390.jpg` |
| Title, desktop | Approved | `title-1280.jpg` |
| Lobby | Approved | `lobby-390.jpg`, `lobby-844.jpg` |
| Table, phone upright | Approved | `table-390-turn.jpg`, `table-390-offer.jpg` |
| Table, phone sideways | Approved | `table-844-turn.jpg`, `table-844-offer.jpg` |
| Table, desktop | **Not approved.** Needs a rework (see below). Do not build from the mock. | none |
| Results | **Change needed.** Do not build yet. | `results-390.jpg` (shows the two faults) |

## Open changes

- **Table, desktop:** too much dead space around "You rolled 8"; the old desktop table shows more information; the new one does not show build costs (Path, Outpost, Stronghold). Keep the top-left player list and one tight rectangle, but show costs and use the space.
- **Results:** keep the winner's name and points centred as today; the colour dot must be the winner's colour, not the table owner's.

## Fixes the mocks need when built

- Desktop off-turn gain: the +2 tab above Wood must show its number (the mock draws an empty pill).
- Signed-in players see a small profile chip in place of the name field on the title. The chip opens the existing profile editor where the host supports it; no new sign-in flow.
- Sizes and shares measured by Astra are in `../3-directions.md`; treat the island-share numbers there as estimates.
