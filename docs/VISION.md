# Emberisle visual north star

Reference stills live in `public/refs/hex-north-star.jpg` (and `-2.jpg`).
Drive pack: `CATAN_PACKED.zip` (~3.8 GB) in folder
[3D Catan](https://drive.google.com/drive/folders/1dRcRfPWFTDgnj6O9uJkghHn_11dR0t-F).
That zip is a Blender/Unreal asset dump. We do **not** load it in the browser.
We copy its look in Three.js.

## What “done” looks like

Each land hex is a **raised diorama on a white stone slab**:

- Vertical walls: pale stone / off-white, like poured concrete
- Terrain sits *on top* of the slab (grass, dunes, rock, wheat) — not a flat colored prism
- Hexes packed flush, thin grout only
- Coast: dark water, foam, wet rocks, a strip of sand where a slab meets the sea
- Pasture: real grass, white sheep, a few stones
- Forest: pine trunks + canopy, not cones
- Fields: dense golden wheat
- Hills: red dirt dunes, dead snags
- Mountains / ore: sculpted rock, mine mouth, wooden staging, drifting smoke
- Light: late-afternoon, long shadows, volumetric haze

## Animation (browser-possible)

Yes, in Three.js, without Blender playback:

- Sheep wander and graze inside their hex
- Grass / wheat / pines sway
- Water moves; foam at the rim
- Smoke from ore / mountain
- Boats rock at harbors
- Wayfarer walks to a new hex on 7 / knight

Not in the browser runtime: Cycles/Unreal path-traced stills, 8K displacement
from the 3.8 GB pack, per-blade cinematic grass at 60 fps on a phone.

## Product name

**Emberisle** — original art and copy. Same skeleton as a classic hex settler
game (19 tiles, 2–12 tokens, robber on 7, 10 VP).
