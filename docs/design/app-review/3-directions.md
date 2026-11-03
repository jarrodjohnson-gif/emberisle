# #903 final directions

Measured and inspected 24 October 2026 from `final-gallery.html`. The recommendations follow the owner's round 3 selections. The round 1 gallery was not available in this workspace or PR #1080; “Current” is a recapture from checkout `984b0e7`, and the approved picks are reconstructed from the owner's request. Exact round 1 visual fidelity remains unverified.

## Title

**Pick:** current island framing with Mock 1's three direct play journeys. Guests keep visible name and colour controls; signed-in players get a top-corner “Signed in as Jarrod” chip that opens a profile explanation. Profile preferences own signed-in favourite and backup colours. Existing authentication is not added by this mock. At 390×844, the guest card measures 358×466 px, from y=362 to y=828; its scroll height matches its client height and all play choices remain visible. Landscape hides the bot and pass helper sentences and the “Play online” group heading to fit the card; no play choice or field is removed.

**Builder cost:** M, `src/components/game/EmberisleApp.tsx`, `src/styles.css`, and the existing profile client integration if available. The current source has guest name and colour controls; `docs/design/profiles.md` describes Profile/Wins and the profile editor, while `server/profiles.mjs` stores display name, favourite colour and backup colour. The profile chip must open the existing editor where supported and offer the documented unsupported-host fallback. Do not create an authentication flow.

**Laws:** no named conflict with laws 1, 2 or 5. The profile chip is a navigation action; bots, online host/join/watch and pass-device stay direct journeys. Guest has no profile chip in the final draft.

## Lobby

**Pick:** Mock 1 with the two-column people grid and a larger inline Chat C panel. Keep the code and copy controls, Invite, Rules, Wayfarer status, Ready/Start/Leave, target 7/10, chat tabs, reactions, Sounds & stickers and message field. Measured chat share uses total card area, including its outer padding and border:

| Viewport | Card | Chat | Chat share of card |
|---|---:|---:|---:|
| 390×844 | 358×812 px | 340×442 px | 51.7% |
| 844×390 | 812×358 px | 498×228 px | 39.1% |
| 1280×720 | 560×672 px | 526×286 px | 40.0% |

The rendered body stayed at the requested viewport in each case. The focused overflow check found no scroll overflow in people, chat or seat elements. Visible controls, including the six reaction targets, measured at least 44 px in each dimension in the inspected desktop lobby; verify every target and 8 px gaps in the builder's responsive proof.

**Builder cost:** L, `src/components/game/Lobby.tsx`, `src/components/game/Chat.tsx`, `src/styles.css`. Preserve Chat C's two tabs and six reactions; the mock's lobby chat is inline and flexes into the card's remaining space.

**Laws:** no named conflict. Do not treat the full card or the surrounding water as island share; the card overlays a portion of the scene.

## Table — sideways phone

**Pick:** refined left control column; Menu and Chat occupy the bottom action row at y=332, inside the lower half of the 344 px control column. The dock begins at y=104 and is 270 px tall; its row is fixed at the bottom of that dock. The column uses 344/844 = 40.8% of the viewport width. The remaining board scene is 500×390 px (59.2% of viewport area). A color-separation mask of the fitted board asset identifies about 70,118 playable-island pixels, or 21.3% of the full viewport (threshold sensitivity: 19.0–23.1%). This is an asset estimate, not a browser-rendered screenshot measurement.

**Builder cost:** M, `src/components/game/Hud.tsx`, `src/components/game/TableMenu.tsx`, `src/styles.css`. Keep Menu and Chat in fixed 44 px slots at the column bottom.

**Laws:** no conflict with laws 1, 2 or 5 is identified. The action row is in the column's lower half and remains in a stable slot. The asset mask provides a Law 3 estimate; visual checks of the rendered scene and state layouts remain pending.

## Table — desktop

**Pick:** retain the current top-left player dashboard and group hand, offer, builds and turn action in a 576×232 px floating dock at x=456, y=464. The dock occupies 14.5% of the 1280×720 viewport. The board-scene rectangle is 1072×720 px from x=208; subtracting the dock's 576×232 overlap leaves 638,208 px², or 69.2% of viewport area as unobstructed scene rectangle. The scene rectangle describes available background area, not the irregular playable island polygon. A color-separation mask of the fitted board asset identifies about 136,029 playable-island pixels. The floating dock covers 576 of those pixels, leaving about 135,453 visible, or 14.7% of the viewport (threshold sensitivity after dock overlap: 14.0–17.6%). This is an asset estimate, not a browser-rendered screenshot measurement.

**Builder cost:** M, `src/components/game/Hud.tsx`, the existing hand component under `src/components/game/Hand.tsx`, and `src/styles.css`. Keep the five goods and all action rows in one compact rectangle, with fixed positions across states.

**Laws:** law 5 applies to phone actions; desktop has no bottom-third requirement in the current draft. Laws 1 and 2 still require fixed dock and slot geometry through all six states. The current browser-render blocker prevented visual and pixel checks of those states.

## Table — upright phone

**Pick:** corrected round 2 Mock 1, re-exported unchanged at 390×844. No new directions are exposed.

**Builder cost:** none for this pick; retain the already selected implementation. Files if grouped with dock work: `Hud.tsx`, `Hand.tsx`, `styles.css`.

**Laws:** no new conflict identified. The upright renderer changes only the sideways Menu/Chat branch; upright table markup and fitted board asset hashes match round 2. Pixel equality remains unverified because no rendered comparison image was produced. The fitted asset mask identifies about 61,104 playable-island pixels, or 18.6% of the viewport (threshold sensitivity: 16.3–19.9%); the dock does not overlap the mask.

## Results

**Pick:** corrected round 2 Mock 1, re-exported unchanged at all three sizes. Ranks, scoring columns, privacy and result actions remain as before.

**Builder cost:** none for this pick. Preserve the existing results components and styles; do not add a new results feature from this gallery.

**Laws:** no new conflict identified. The results renderer function is byte-for-byte identical to round 2, and the fitted island asset hashes match. Pixel equality remains unverified because no rendered comparison image was produced.

## Verification limits

The focused Playwright script fails before rendering: Chrome exits with `SIGABRT`; the sandbox reports `kill EPERM`. A later isolated browser attempt to open the local file URL was explicitly rejected by the browser policy, which also prohibited alternate browser workarounds. Visible Chrome previously rendered the gallery and supplied DOM measurements for the 390×844 guest title and all three lobby sizes. Signed-in title at all sizes and all 18 table state/layout combinations therefore remain unrendered. Upright and results have source-level equivalence evidence described above, but no pixel comparison was produced. Do not describe these visual checks as passing. Island shares above are pixel-mask estimates from the fitted embedded board assets: grayscale difference from sampled aqua water, threshold >24; the stated sensitivity range uses thresholds >18 and >30. This mask counts the island, board pieces and perimeter ships, so treat it as a reproducible footprint estimate rather than a semantic segmentation.
