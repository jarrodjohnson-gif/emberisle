# Research: what the browser table looks like now, by area (issue #125)

- step: 1 Research, node #124 (Make the browser table look good)
- date: 2026-09-27
- agent: Claude

## What I read

`src/lib/scene/isle-renderer.ts` (all of it), `src/components/scene/IslandCanvas.tsx`,
`src/components/game/Hud.tsx`, `src/components/game/EmberisleApp.tsx`, `src/styles.css`,
`src/components/ui/button.tsx`, docs/BUILD_BIBLE.md §3.3-§4.5, docs/research/chat.md, and issue #119.

## Screenshots

`node scripts/shots.mjs` (new; `ONLY=1280` or `ONLY=1920` renders one size). It drives the real client with
three bots, loads the 7, the wayfarer, and the win as crafted states through the store, and writes these to
`test-results/shots/` (not committed):

| Screen | 1280×720 | 1920×1080 |
|---|---|---|
| Title | `01-title-1280x720.png` | `01-title-1920x1080.png` |
| Lobby, 3 seated | `02-lobby-1280x720.png` | `02-lobby-1920x1080.png` |
| Setup, first corner to place | `03-setup-1280x720.png` | `03-setup-1920x1080.png` |
| Normal turn, after the roll | `04-turn-1280x720.png` | `04-turn-1920x1080.png` |
| Same turn, goods in hand (the trade row) | `05-trade-1280x720.png` | `05-trade-1920x1080.png` |
| A 7: discard | `06-discard-1280x720.png` | `06-discard-1920x1080.png` |
| A 7: move the wayfarer | `07-wayfarer-1280x720.png` | `07-wayfarer-1920x1080.png` |
| Win | `08-win-1280x720.png` | `08-win-1920x1080.png` |
| Board zoomed to the closest the controls allow | | `09-zoom-1920x1080.png` |

They are not committed. Regenerate them with the command above (about 15 minutes per size on a CPU-only runner, much less with a GPU).

## Cost now (1920×1080)

Measured by `scripts/shots.mjs`, which wraps every WebGL draw call, so the count includes the shadow map,
the SSAO normal pass, and the output pass, not just one `render()`:

```
drawCallsPerFrame   2307
primitivesPerFrame  179952   (index/vertex count, about 60k triangles)
frameMs             ~1800    (SwiftShader, CPU only: not meaningful for a real GPU)
```

- The count is high for a board. Every tree (16-20 per timber hex, each 5-7 meshes), sheep (6 meshes),
  rock, token (2 meshes), piece, pier, and boat (3 meshes) is its own mesh with its own material. The scene is
  drawn about three times a frame: shadow map, SSAO normals, and colour.
- Frame time needs a real GPU. On Jarrod's PC, the check is: open the game, then in the console run
  `performance.now()` deltas over `requestAnimationFrame`. That goes in whichever child changes lighting.
- The cheap wins, if needed:
  - merge or instance trees, sheep, and rocks (one draw per kind);
  - share materials;
  - drop SSAO in favour of baked contact shadows;
  - render on demand instead of every frame when nothing moves.

## What is true, by area

### 1. HUD layout (`Hud.tsx`)

- **The bottom panel covers the board.** At 1280×720 the prompt line, the five resource cards, the action
  row, the dice, and the log take the bottom ~40% of the screen, over live hexes. The resource cards alone
  are 80 px tall, and they show five zeros through all of setup. At 1920×1080 it is ~25%.
- **It doesn't match BUILD_BIBLE §4.1-4.2:**
  - The phase sentence belongs top-left; it is at the bottom.
  - Other players should be a stack of circles; they are wide cards.
  - Illegal buttons should be hidden; Stronghold, Outpost, and Fortune always show.
  - There is no Trade button. The bank trade is two raw `<select>`s that default to "Give 4 Timber / For
    Timber".
- **The header does not line up.** The title pill and Leave sit in a centred `max-w-5xl` row, while the
  player cards hug the far-left edge. At 1920 the title floats mid-screen.
- **Player-to-player trade has no UI.** The host runs `tradeAsk` / `tradeAnswer` (BUILD_BIBLE §4.4 "Ask the
  table"), but neither `table.ts` nor the HUD ever sends them. #119's "Offer a trade…" menu item needs this
  panel.
- **The discard is five number inputs.** There is no running "2 left to pick", and nothing on the board says
  a 7 was rolled.
- **The dice are two dark squares with digits,** at the bottom-left under the action row.
- **The log line** at the bottom overlaps the board edge and is 12 px grey on the scene.
- **The win screen** is a card with the winner's points only: no final table of everyone's score.
- **Good:** the board's middle is never covered, and nothing overlaps a click target. The HUD hugs the top
  and bottom edges, and the player list becomes a thin rail. The phase sentence, the dice, and the turn
  owner are readable at a glance. Reference: the Colonist.io and Board Game Arena desktop layouts, which have
  a thin bottom hand bar, a side player rail, and a compact top status line.
- **Coordinate with #119:** the chat dock and the avatar menu go in the same layout.

### 2. Ocean and coast (constructor in `isle-renderer.ts`)

- **The ocean is one flat `CircleGeometry` plane,** a single teal colour with no waves or depth. A bright
  specular hotspot from the sun sits in the top-left of every shot.
- **The "island" is two round cylinders** (sand and a teal shelf) with a foam `RingGeometry`, so the coast is
  a perfect circle unrelated to the hex outline.
- **On the title and lobby screens nothing is dealt,** so the scene is an empty sand disc with the wayfarer
  standing alone in the middle (`01-title`, `02-lobby`).
- **Good:** stylised water that moves, meaning a gentle vertex or normal wave in a shader, a shallow-to-deep
  colour gradient, and foam that follows the actual coast of the hexes. The coast is a beach shape around the
  hex outline, not a disc. The title shows an island (a fixed demo seed). Reference: the Townscaper / Dorfromantik
  flat-shaded toy look, which the current trees already suggest.

### 3. Boats and docks (`buildLand` harbor loop, `makeBoat`)

- **Piers are 0.72-long brown boxes** pointed at the centre. They cross the sand rim and stick out over the
  water, which is the "stick out through the rim" from #124.
- **Boats are a box hull, a stick mast, and a flat white `PlaneGeometry` sail,** about 15 px on screen at
  1280. A dock's rate (2:1 wool, 3:1) is **not shown anywhere on the board**, so a player cannot tell what a
  dock does.
- **Good:** a short jetty from the coast, and a small boat with a real hull shape and a sail that shows the
  dock's resource (icon or colour) and rate. Claimed docks already recolour the sail; keep that.

### 4. Wayfarer (`makeWayfarer`, `robberTarget`)

- **It is a black cone with a white sphere and two eye dots,** about 20 px tall at 1280, and it sinks into
  the tile (see #127). Hard to find on a dark forest hex.
- **Moving it shows no targets.** The glowing rings sit under the tile tops, so nothing lights up in the
  robber phase (#127).
- **Good:** a figure you can find in half a second from across the board: taller, a lighter cloak or lantern
  glow, and a small shadow disc. It walks or hops between hexes instead of sliding. The target hexes glow.

### 5. Pieces: paths, outposts, strongholds (`buildPieces`, `makeHouse`)

- **Paths are buried** (#127): not one is visible in any shot, although every seat has two.
- **Outposts are 0.2 boxes with a dark roof,** about 12 px at 1280. A stronghold is the same box, a bit
  bigger, with a keep.
- **Player colours fade into the land:** Ember `#c45c3e` on clay, Dune `#e4c9a0` on grain or sand, and Pine
  on forest. There is no outline or base.
- **Good:** chunky, readable pieces with a light base or outline in the player colour, so every seat reads on
  every terrain. An outpost and a stronghold differ in silhouette, not only in size. Paths are raised planks
  above the tile seam. Reference: the wooden-bit look of a physical board game.

### 6. Number tokens (`numberToken`)

- **Trees cover them:** on timber hexes the trees overlap the token (the 8 and 2 in `09-zoom`, the 5 and 4
  in `03-setup`).
- **The red 6 and 8 are low-contrast on clay** (`#c0392b` digits on a cream disc sitting on an orange hex).
- **The pips are tiny** (5.5 px dots on a 256 px texture), and a flat disc reads poorly at a low angle.
- **Good:**
  - A clear ring kept free of decoration around each token.
  - Numbers readable at 1280 from the default camera; 6 and 8 stand out by more than colour, for example
    bold with a ring.
  - Tokens that face the camera if the camera stays tilted (depends on #128).

### 7. Lighting and camera (constructor, `resize`, `OrbitControls`)

- **The camera is a fixed distance (32° FOV) regardless of the window.** The bottom row of hexes is off
  screen at both sizes, and the rest is under the HUD.
- **The sun lights the scene well,** but the sky and the shelf use the same flat teal, and the hotspot washes
  out the top-left.
- **Cost:** see "Cost now". Shadows are 2048² PCF and SSAO runs every frame.
- **Good:** the whole island fits the space the HUD leaves, at every window size. Zoom and orbit stay
  optional. **Jarrod suggested a top-down view for v1** (tilted 3D for v2, Unreal for v3): see **#128**. A
  top-down camera on this same scene solves token and piece readability and the HUD overlap together, and
  this child should design for whatever #128 decides.

### 8. Lobby and title screens (`EmberisleApp.tsx` `Title`, `Lobby`)

- **The menu is a narrow column at the bottom-middle** over an empty sand disc (see Ocean). At 1920 it is a
  448 px column in a sea of nothing.
- **The lobby:**
  - The table code has no copy button.
  - Dune's `#e4c9a0` dot is almost invisible on the cream row.
  - There are no avatars yet (#119 adds them).
  - The Ready button is the same size and weight as Start.
- **Good:** a title with a real island behind it and the game's name. A lobby that feels like sitting at a
  table: seat cards with colour and avatar, a copy-code button, and the chat box from #119.

## What I am not sure about

- Frame time on a real GPU. The container only has SwiftShader.
- Which camera #128 picks. That changes what "good" means for tokens, pieces, and the HUD.
- The painted terrain textures stand in for photos that were never committed (`src/assets/textures/` is
  empty). Terrain look is not in #125's list. If Jarrod wants it, it is a ninth area.

## Children filed

Under #124, each a Design step in Backlog, sized S, stating what its after-screenshot must show:

| Area | Issue | Waits on |
|---|---|---|
| 1. HUD layout (coordinates with #119) | #129 | #128 |
| 2. Ocean and coast | #130 | |
| 3. Boats and docks | #131 | #130 |
| 4. Wayfarer | #132 | #127 |
| 5. Pieces | #133 | #127, #128 |
| 6. Number tokens | #134 | #128 |
| 7. Lighting and camera | #135 | #128 |
| 8. Lobby and title | #136 | #130, #119 |

Also found and filed:
- **#127** (bug, XS, Todo): paths, wayfarer rings, edge highlights, the wayfarer, and trees are placed below
  the hex tops.
- **#128** (Decide, needs Jarrod): top-down camera for v1.

## Handoff

```
done: screenshots at 1280x720 and 1920x1080 (scripts/shots.mjs), problems and "good" per area, cost numbers,
      children filed under #124, bug #127, decision #128
left: the eight Design children; #127 can be fixed right away
broke: nothing
next agent: #127 (XS), then #130 (no blockers); the rest wait on #128 and #127 as listed above
```
