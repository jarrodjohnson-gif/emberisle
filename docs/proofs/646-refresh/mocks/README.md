# #646 Need layout proposal mocks

These are browser pictures for comparing the two owner-requested layout proposals. They are discussion material only; neither option has been accepted, and this folder makes no product or multiplayer correctness claim.

The captured page is the real Emberisle Vite game at source `9a227ea`, rendered in Chromium 154.0.8037.57 at `/usr/bin/chromium` with WebGL enabled (SwiftShader). The deterministic hotseat fixture has four real game seats: Jarrod, Joshua (needs Stone), Dune (needs Wheat and Wool), and Ember. The island, HUD, seat controls, player menu, and Trade panel are rendered by the game. Only the proposal rows, dot badges, and menu/Trade chips are temporary DOM/CSS overlays from [capture-mocks.mjs](./capture-mocks.mjs). No production source or proof assertion changed.

A reserves 48px below each existing 44px seat button, for a 92px seat card. Its proposal row uses 12px text, 8px vertical and 12px horizontal inset, a 4px gap, and 12px resource icons. Seats without a need keep the row blank. B keeps the 44px seat button and adds an 8px dot (`left: -3px; top: -3px`) to seats with a need. Its menu and Trade proposal chips use 12px text with 8px vertical and 12px horizontal padding. The recorded boxes show the B dots clear all visible VP and tally boxes at each viewport.

At 844×390, A’s vertical 92px rows push the fourth seat below the viewport and overlap the bottom HUD area. That is a visible tradeoff of this proposal, not a passing geometry check. The hotseat fixture and injected chips do not demonstrate online sharing or trade behavior.

| Viewport | A overview | B overview | B player menu | B Trade panel |
|---|---|---|---|---|
| 320×568 | [A](./A-320x568.png) | [B](./B-320x568-overview.png) | [Menu](./B-320x568-menu.png) | [Trade](./B-320x568-trade.png) |
| 390×844 | [A](./A-390x844.png) | [B](./B-390x844-overview.png) | [Menu](./B-390x844-menu.png) | [Trade](./B-390x844-trade.png) |
| 844×390 | [A](./A-844x390.png) | [B](./B-844x390-overview.png) | [Menu](./B-844x390-menu.png) | [Trade](./B-844x390-trade.png) |
| 1280×720 | [A](./A-1280x720.png) | [B](./B-1280x720-overview.png) | [Menu](./B-1280x720-menu.png) | [Trade](./B-1280x720-trade.png) |

`measurements.json` records seat, row, button, badge, and chip dimensions. `capture.log` records the successful serial browser run. To reproduce from a checkout with dependencies installed, run `flock -n /tmp/emberisle-team-browser.lock node docs/proofs/646-refresh/mocks/capture-mocks.mjs`; set `NODE_PATH` or `CHROMIUM_PATH` only if the local dependency or browser paths differ.
