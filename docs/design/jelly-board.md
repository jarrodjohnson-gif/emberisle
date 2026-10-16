# The jelly board (#599, #624)

The island's hexes are the six Hex Jelly scenes (`hex-jelly-prompt.md`, built in `src/lib/scene/hex-jelly.ts`), drawn on the
game board by `src/lib/scene/jelly-board.ts` and wired in `buildLand` in `isle-renderer.ts`. It replaces the sculpted
terrain (`terrain.md`, `terrain.ts`), which the renderer no longer uses.

## One scene per kind

One scene is built per kind (the owner, 2026-10-16: "shared for now"), seeded from the island (`hashStr(landKey | kind)`),
and drawn on every hex of that kind. All four forests are the same forest, living in step. Variation between hexes of a
kind (rotations, subtle differences) is the next step and costs build time and draws.

The scenes are built at board detail (`setBoardDetail`):
- lighter blobs and spheres;
- one gold spindle per wheat tuft at two-thirds density;
- a 12-ring lattice.

They are built without the waste's own wayfarer, since the game's wayfarer is the piece that moves.

## Draws

Every mesh of every scene goes to one of two places:

- **Baked** (whatever never moves): one mesh per material over every hex of every kind, each corner in world space with
  its hex's slot and the pivot and delay its thing squashes by in a roll. A 64-slot uniform table (`uHexA`, `uHexT`) drives
  each hex's moments in the vertex shader: the roll ripple, the hex's jelly squash, and the tint (glow and dulling).
  Instances under 6 mm are left off.
- **Batched** (whatever moves: creatures, water, smoke, wheels): a `BatchedMesh` per material, an instance per hex. Each
  frame every scene's life runs once, and only what moved is copied to its instances.

The sprites (glows, fog and steam puffs) are camera-facing quads in two instanced draws.

Geometry is indexed with creased normals (50°). Only things over 0.03 in radius cast a shadow.

Measured on the 19-hex island:
- 51 draws and about 330k triangles;
- a frame on SwiftShader at 1280x720 is about 385–430 ms, against 185 ms for main's sculpted board;
- the update is about 1 ms a frame.

A `BatchedMesh` draws each instance on its own under software GL, so static scatter must stay baked.

## Lite: software GPUs

On a software GPU (SwiftShader or llvmpipe, read from `WEBGL_debug_renderer_info`: CI, and machines with no GPU), drawing
shares the CPU cores with the page. There the full scenes starved everything: every tab spent 2–3 s of CPU building them,
and frames cost more than twice main's. chat-prove, with five tabs open, reached its reaction step at +175 s against +28 s
on main.

So a software GPU builds the lite board: the jelly ground only (the block, its landform and strata; `buildTile(...,
groundOnly)`). It costs about 0.7 s to build and about 187 ms a frame, level with main.

`emberisle-jelly` in storage ("full" or "lite") overrides either way. board-look's terrain checks, tokens-prove and
jelly-ocean ask for full, so CI still checks the real scenes.

Every frame leaves a fence, and the loop does not queue another while the GPU is still behind it. A GPU that keeps up has
always finished; a slow one no longer blocks the page in its GL calls.

## Load

The scenes are their own chunk, `jelly-board` (about 51 kB gzip, with its own budget in `size-prove`), loaded after the
island's first draw.

Loading waits for the board's first frame. The build then runs in steps, each followed by a pause:
- a pause once the chunk has run;
- each kind's props, then its block (`tileSteps`, a generator; the studio's `buildTile` runs it straight through);
- its geometry's indexing, in slices of about 40 ms;
- the bake, which pauses between sources every 40 ms or so.

Before the swap, the scenes' shaders compile in place, into the composer's own target, so the first frame that draws them
compiles nothing (`compileAsync`; in parallel where the browser has KHR_parallel_shader_compile; on SwiftShader it is one
task of about 350 ms).

Until every scene is ready, plain slabs in the terrain's paint stand in, and then the island swaps in whole (the owner:
wait for it, no pop-in).

A failed load keeps the slabs and tries again, up to five times, under a fresh query. The restore budget holds, since the
scenes are off the first frame. restore-prove now allows a median under 3 s and a maximum under 3.5 s (the owner: load may
grow while play stays snappy); measured locally, the median is about 1.5 s.

## In play

- **Ground:** `topOf` is the block's flat top on every kind (`TILE_Y + BLOCK_H`). The ground is exactly there on the pad
  (0.33 round the token) and in the band within 0.12 of the edge, where corners and paths stand.
- **Paying hex:** the game's flash timing (`caps`, read as `emissiveIntensity` by flash-prove) warms the hex. The roll
  payoff's squash and ripple run alongside, but not under reduced motion.
- **Tap:** a tapped hex gives a small jelly wobble, and its token wobbles with it.
- **Wayfarer:** the hex he stands on darkens and cools.
- **Reduced motion:** the scenes hold still. A dulling or a glow still lands.
- **Picking:** an unseen hex prism per hex.

## The shore (Harbor Jelly)

`src/lib/scene/harbor-jelly.ts`, to `harbor-jelly-prompt.md` (owner sign-off 2026-10-16), in the same chunk, built once the
hexes have swapped in, on the full board only (the lite board keeps the plain beach and docks; `?harbor=0` or
`emberisle-harbor` = "plain" turns it off).
- **Apron:** a sand strip from under the slabs to a waterline 0.24-0.62 out, the coast's zigzag smoothed into bays and
  points; dry, damp and wet sand, then a shelf sloping to the crystal sea's floor. The crystal sea's lace and swash are
  rebuilt on the new waterline (`makeWash` on the shore's waterline).
- **Scatter:** dune grass, rock groups, driftwood, shells, starfish, the wrack line; sea grass, coral heads by the harbors,
  an amphora; one merged mesh, wet-banded below the waterline. Crabs instanced; a ray round the island.
- **Harbors:** per dock a plank pier on braced piles with a T-head (bollards, ladder, lamp, lifebuoy, tyres), a dockhouse
  and the good on the deck, all merged into one mesh (lamps and windows a second), and the rate plates in one atlas draw
  (flat, so the overhead view reads them). The ship (a sloop, or a ketch at a 3:1 harbor) is moored alongside, 1.3x; its
  mainsail and spars are one mesh, set fore and aft and swaying a little; the sails carry no rate. One story each: a fisherman, a gull, a cat, a rowboat, a hoist.
- **Floaters:** ships, rowboats and four buoys ride the swell as the plain boats did (`userData.rest`).
- **Cost:** about +8 draws and +50k triangles in the colour pass over the plain beach and docks.

## Proofs

- **board-look:** all six kinds are there; flat pad and rim; landforms; at most 60 draws and 600k triangles (the island
  620k); nothing within 0.31 of a centre.
- **tokens-prove:** clearance at placement and over 10 s of wandering (0.31; `tokens.md`); numerals never hidden by the
  scenery (`occludes`).
- **jelly-ocean:** the scenes are built and clear of the tokens; reduced motion and a hidden page freeze them.
- **flash, splash, rotate, restore, idle and size** run unchanged.

`scripts/jelly-board.html` (`jelly-board-studio.ts`) shows the batched board alone, for its draws, triangles and build time.
