# #1101 connection-health assertion row

The phone Menu is the labeled dock slot from the approved #1101 layout. This replaces the header-icon size check. It does not move a size ceiling.

| File | Old | New | Why |
|---|---|---|---|
| `scripts/connection-health-prove.mjs` 390px menu box | `menu.width === 44 && menu.height === 44` | Height stays 44. Width equals the `[data-slot="menu"]` box (within 0.5px) and that slot is wider than 44. The button and the status are fully inside the viewport. The status bottom is at or above the Menu top. The `assert.deepEqual` line keeps its original message. | At 390x844 the dock Menu measures 85.5x44 because the button fills one column of the four-column action row and reads "Menu". A 44px-wide icon fails this check. The old check only tested horizontal status bounds, so a readout below the screen could pass. |
| `scripts/connection-health-prove.mjs` 700px and 900px status | Status must clear `.hud-utilities` buttons. No vertical bound. | Same clearance, plus the status box is fully inside the viewport. | Coarse pointer keeps the phone dock at these widths. Clearing the top utilities did not catch a readout past the bottom edge. |
