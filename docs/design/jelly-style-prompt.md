# The Jelly look — the master build prompt

Written 2026-10-16 at the owner's request ("include a huge jelly prompt ... that way it knows how to build stuff in future").
This is the one prompt to start from when you build **anything new** in Emberisle's 3D look: a prop, a creature, a person, a
building, a piece, a ship, an effect, a story on a hex. The per-thing prompts refine it and win where they disagree:
[hex-jelly-prompt.md](hex-jelly-prompt.md) (the six hexes), [harbor-jelly-prompt.md](harbor-jelly-prompt.md) (the shore,
docks and ships), [pieces-jelly-prompt.md](pieces-jelly-prompt.md) (paths, outposts, strongholds). How the board draws it
all: [jelly-board.md](jelly-board.md).

Copy the PROMPT block into your plan, add a section for your thing (what it is, its story, its size, its game rules), and
build to it. Then show the owner images before you push (see THE PROCESS).

PROMPT

Build it as part of "Material Studies" jelly world: a living toy-town miniature of candy-coloured, glossy, soft-lit forms on
a chunky cut-cake island, seen like a model on a table. Everything is procedural Three.js: no models, no image textures, no
external requests. Every thing is chunky, rounded and toy-like, reads at a glance from the phone's overhead view and rewards
a close look in the tilted diorama, and is alive: something on it moves, someone is busy, and there is one small surprise.

THE GAME FIRST (what must always stay true)
- The board is a game board before it is a diorama. Nothing you add may hide a number token, cover a corner where pieces
  stand, or sit on an edge where paths run.
- Hexes: the pad is flat in a 0.33 disc at the centre (the token's), and flat in a 0.14 disc at each corner (where pieces
  stand). Within 0.18 of each edge, the ground never rises above the pad (roads). Nothing standing comes within 0.31 of a
  hex's centre (board-look proves it). Tall things go to the **back** of a hex (away from the eye: hillAt is 240 or 300
  degrees) so they frame the token instead of hiding it (tokens-prove's occlusion check).
- Anything tall must stay inside the edge band: `hexDist(p) + r ≤ INR − EDGE_BAND` and away from the corner discs (the
  `fit()` clamp in hex-jelly.ts's ore layout is the pattern).
- Each resource must read instantly by colour and silhouette (owner: "you can instantly tell sheep, wood, or grain").
  Wood is dark green canopy, sheep is bright pasture with white flocks, wheat is gold strips, brick is terracotta and kilns,
  ore is **grey** rock and mountains (owner 2026-10-16: "not grey or mountainy enough" until the ground went grey scree
  and the peaks became a massif), and the waste is dun ash and bones. Never let one kind borrow another's colour (no green
  meadows full of pines on ore).
- Players' pieces stand out from all scenery: bolder, simpler, more saturated, and always on the dark ring with the cream
  band. Seats are told apart by colour only, so the seat colour dominates the top of a piece.
- Players see these names: **Wood, Sheep, Brick, Ore, Wheat** (owner 2026-10-16, #657). The code keys stay timber, wool,
  clay, ore, grain.

THE STAGE AND LIGHT
- Washi paper behind (#ebe8e1) with the faintest fibre grain. Diorama camera 38 degrees above the horizon, 20 degrees round
  from the south (`DIORAMA_AZIMUTH`), narrow lens. Overhead is the phone's default upright, with a 25 degree lean.
- One warm key (#ffe2b8) from the front left, with soft PCF shadows. A hemisphere fill (sky #dff6f4, ground #c9b58f) and a
  cool back light that rims far edges. ACES tone mapping, exposure about 1.05.
- Creases go warm and soft, never black. No outlines. Nothing turned from the key drops below half light.
- Night mode: a cool low moon, and everything lived-in glows warm (windows, lanterns, fires). Under the robber, a hex's life
  stops and its colours dull by about half toward grey.

THE MATERIAL (the "jelly")
- Glossy candy: `MeshStandardMaterial` or `MeshPhysicalMaterial` with vertex colours, roughness about 0.3–0.6, and clearcoat
  0.5–1 where something should look like a boiled sweet (pieces, dice, toys). Board scenery goes through `jellyfy()` so the
  board's dulling, flash and squash uniforms reach it.
- Colours are candy-saturated but soft. A thing in a colour is that colour on top (what the camera sees). Use a shade
  lighter on walls and sides (`pale()`) and a shade deeper on roofs, rims and bands (`deep()`). Doors are dark (#4a3226)
  and windows warm (#ffd27a).
- Water is jelly, never glass: translucent milky turquoise (#7fd6cf shallow, #3fa8a8 deep), the bed visible, a cream rim
  where it meets land, gentle ripples.
- Rock is faceted (low-poly cones and dodecahedra with jittered faces) and banded paler toward the top, with snow on the
  tallest. Foliage is clusters of lumpy blobs packed so canopies touch, brighter toward the sky. Pines are stacked
  flattened blobs.

FORM AND SCALE
- Chunky and rounded everywhere: `RoundedBoxGeometry`, cylinders with rolled rims (a torus at the edge), lathe domes, fat
  trunks, pillowy crenels. Nothing spindly or toy-thin, and no sharp prisms unless the silhouette needs one (a gable roof
  is fine; the owner liked the classic house shape best).
- One size ladder for everything (`SIZE` in hex-jelly.ts, shown by the line-up shot `node scripts/hex-jelly.mjs
  --lineup`): hen 0.03–0.04, sheep 0.12, person 0.13, tent 0.13, hut 0.19, farmhouse 0.24, barn 0.29, windmill 0.54, a tree
  0.25–0.5, the token 0.52 across. Toy-town ratios: buildings big, figures small, always the same.
- Silhouette first: from overhead, each thing must still read by its outline. Outpost and stronghold, for example, must be
  told apart even in greyscale.
- People appear only where they add charm (a shepherd, a woodcutter, the climber), never as a busy work crew.

LIFE AND STORY
- Something always moves: a small idle loop per creature, smoke, wind, water. On a roll, the land shows off for about 2.4 s
  with a squash ripple, its story's beat and a warm flash. Under reduced motion it all holds still, but a dulling or a glow
  still lands.
- Give each thing a little story and one surprise (the climber who gets his gear out at match start, climbs, and sits on
  the summit or falls and leaves a skeleton). Seed it from the island (`hashStr(landKey | kind)`), so every player in an
  online game sees the same story and each new map is different.
- A story that should start with the match reads `env.age` (seconds since the board's first live frame), not the page
  clock.
- Make it readable from the eye: choose spots off the token-to-eye line and clear of every peak's sight line, so the story
  is never hidden behind the token or a mountain (the climber's `seen()` and `hidden()` are the pattern).

BUILDING IT (performance and the code's rules)
- Merge each prop into one mesh (vertex colours, one shared material) and instance anything repeated. A piece is one mesh
  and one draw.
- The board bakes whatever never moves and batches whatever moves (`BatchedMesh` per material). The batcher only keeps a
  mesh it sees **move or show** in its sample window (`SAMPLES` 0.37–5.2 s). So anything that appears later must move in
  that window or ride along with something that does: a hidden skeleton parked on the moving climber, a hidden flag
  parented to him.
- Things under 6 mm are left off the bake, and only things over 0.03 in radius cast shadows. Keep within the board's
  budgets: at most 60 draws and 600k triangles for the scenes (board-look checks).
- Software GPUs (CI, no-GPU machines) get the lite board (the ground only), so nothing about the game may depend on the
  scenery.
- Chunk weight: first-frame code (pieces, the renderer) lives in IslandCanvas, and the scenes live in the lazy `hex-jelly`
  chunk. Measure with `npm run build && node scripts/size-prove.mjs` **before pushing**. A raise goes in the same PR, dated,
  with the measured number against main and one line of reason. The owner accepts slow loads (up to about 30 s) if play
  stays snappy, but every kilobyte must be justified.
- Each piece of work stays in its lane's files (`docs/LANES.md`). The board lane is `src/lib/scene/**`.

THE PROOFS (run before pushing, one at a time, and never edit files while one runs: Vite reloads break it)
- `board-look-prove`: the kinds, flat pads and rims, landforms, draws, triangles, and the 0.31 clearance.
- `tokens-prove`: token clearance, and no numeral hidden by scenery or the wayfarer.
- `jelly-ocean-prove`, `idle-prove`, `size-prove`, and for pieces `pieces-prove` and `pieces-land-prove`.
- For anything new, add a proof or a check that names its rule, and never loosen an existing check to get green.
  Correct a check only when it was measuring the wrong thing, and say so (pieces-prove's footprint was a hard-coded 0.54).

THE PROCESS (how the owner signs things off)
1. Write or extend the prompt for your thing (copy this one), and commit it as `docs/design/<thing>-jelly-prompt.md`. The
   first pieces pass had no prompt, and the owner asked "what jelly prompt did you use?".
2. Build behind a URL flag or in the studio (`scripts/hex-jelly.html?kind=<kind>&seed=<n>&t=<seconds>`).
3. Shoot an image sheet: the real board on a phone (440x956 upright, 956x440 on its side) overhead and in the diorama, plus
   close-ups. Show the same board before and after (a seeded `Math.random`, or the studio at fixed seeds).
4. When the owner is unsure, offer 2–3 clearly different options side by side and recommend one (the outpost was picked from
   A/B/C this way). Then let the owner pick.
5. Only after sign-off: switch it on, run the proofs, push, open a draft PR, and post the owner's verbatim sign-off on the
   issue. The review desk merges.
6. Owner-only issues (label `owner-only`, such as #680 the dice look) are never claimed, built or reviewed by an AI.

QUALITY BAR
- Set beside the board's existing hexes, harbor and pieces, it reads as the same series: dense, chunky, glossy, soft-lit,
  alive, with one surprise. It works on an iPhone (Safari) at 60 fps, with no console errors.
- It reads at a glance from the phone overhead, and it rewards a close look in the diorama.
