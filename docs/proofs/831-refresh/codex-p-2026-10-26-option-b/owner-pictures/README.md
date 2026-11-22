# Owner pictures: approved Option B

parent: Codex-p

All nine pictures use actual product UI at frozen2c0a704, with no DOM/CSS overlays or WebGL stubs.
The fixture reaches the first main phase through legal setup/roll actions, using seed13.
Only controlled player holdings change afterward; every good remains conserved with the bank.
No board, harbor, phase or dice mutation creates these pictures.

The initial window has an empty shared draft and a visible disabled Bank reason.
The affordable state selects one Wood to give and one Stone to get; Bank quotes its separate exact4-for1 exchange.
The disabled state selects one Brick to give and one Stone to get, while the player holds only two Brick.
Bank stays visible and explains `Need 4 brick for the bank.`

| Viewport | Initial shared window | Affordable Wood → Stone | Insufficient Brick holdings |
| --- | --- | --- | --- |
|390x844|[Initial](390x844-initial.png)|[Affordable](390x844-affordable.png)|[Disabled reason](390x844-disabled.png)|
|844x390|[Initial](844x390-initial.png)|[Affordable](844x390-affordable.png)|[Disabled reason](844x390-disabled.png)|
|1280x720|[Initial](1280x720-initial.png)|[Affordable](1280x720-affordable.png)|[Disabled reason](1280x720-disabled.png)|

All nine were individually inspected. Receipts, reasons and actions remain visible.
At844x390 the goods scroll; the initial get row is partly below the fold.
Selecting the get kind scrolls its row into view and clips the giverow's top, reflecting actual keyboard/pointer focus scrolling.
This behavior remains subject to owner visual acceptance.

The helper uses the existing saved `emberisle-first-game-coach` value `"done"` to suppress tutorial tips.
It waits for public landReady/terrainStats.ready, three real render-count advances, and a drawn frame after opening the modal.
The actual renderer keeps running; no animation loop is replaced or stopped.
Every image records landReady/terrain.ready true,6–12 rendered frames,8drawcalls,32832triangles and6terrainkinds.
The desktop modal covers most of the island naturally; the scene is drawn behind it.
Chromium153.0.8010.12, pinned Playwright revision1243; zero page/console errors.

`capture.mjs` is the exact external helper; `fixture.json.gz` and `records.json.gz` retain full state/measurements losslessly.
`SHA256.json` verifies the pictures, helper and records.

Earlier blank-board/tutorial drafts lacked a renderer-readiness gate and are superseded.
They remain outside final owner pictures at `/workspace/883-owner-pictures`.
The earlier helper/log are retained in the adjacent evidence; no blank-board draft is presented as final.
No product, assertion, wait or timeout changed for this capture correction.
