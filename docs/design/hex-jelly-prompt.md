# Hex Jelly — the build prompt (#599)

Written 2026-10-15 from the owner's references (the "Material Studies" jelly dioramas: Atoll, Iceberg, Pirate, Harbor,
and the Torii and Harbor prompts). Design only: a standalone studio (`scripts/hex-jelly.html`,
`src/lib/scene/hex-jelly.ts`, `node scripts/hex-jelly.mjs`), one tile at a time, until the owner signs each off.

PROMPT

Build "Hex Jelly", a series of six living miniature worlds, each on a single hexagonal tile: a forest, a pasture, a grain
farm, a clay pit, an ore mountain and a sand waste. Every tile is a finished little story you could stare at for a minute:
something is always moving, someone is always busy, and there is one small surprise to find. Everything is procedural
Three.js: no models, no textures, no external requests. The look is the Material Studies series: a chunky cut-cake block of
candy-coloured land, glossy soft-lit forms, translucent jelly water, a tilt-shift miniature on warm washi paper.

THE STAGE
- Washi-paper background (#ebe8e1) with the faintest fibre grain; a soft floor shadow under the tile that fades out with
  distance. Camera 3/4: 38° above the horizon, 20° round from the south, lens narrow (about 10°) so it reads as a model
  on a table. A subtle tilt-shift blur on the top and bottom fifths of the frame. ACES tone mapping, exposure ~1.05.
- Light: one warm key (#ffe2b8) 55° up from the viewer's front left with soft PCF shadows that keep a small prop's shadow
  readable; hemisphere fill (sky #dff6f4, ground #c9b58f); a cool back light that rims far edges. Lambert with a gentle
  three-step ramp so nothing turned from the key goes below half light; a pale sky-tinted Fresnel sheen on every surface
  so it reads as glossy candy. Creases go warm and soft, never black. No outlines.

THE BLOCK (every tile)
- A hexagonal slab 1.94 across the flats (corner radius 1.12), 0.30 tall, its vertical corners rounded (~0.12) and its top
  edge rolled over (~0.05), like a moulded jelly, never a sharp prism.
- The top is a heightfield ~120 samples across, clipped to the rounded hex, stitched to the roll and the sides.
- The cut sides show five candy strata with wavy borders: a lip in the surface's own colour; pale sand (#ecdbb2) with white
  pebbles; a thin shell-white band (#f7f0e2); caramel soil (#bb7a42) with dark grit; chocolate rock (#5f4234) with pale
  flecks. Where water meets the side, the cut shows the water as a translucent jelly window with a bright meniscus line.
- Game rules the land must keep: exactly flat and level in a disc of radius 0.33 at the centre (the number token's pad, a
  pale trodden clearing) and in a disc of 0.14 at every corner (where pieces stand); within 0.18 of each edge the ground
  never rises above the pad (roads lie there). Everything else is landform, and it is big: the tallest feature rises 0.35
  to 0.6 above the pad. The big features sit toward the back (away from the eye) so they frame the token, never hide it.
- Seeded per tile: which back edge the landform leans toward, its relief, and every scatter, so no two tiles match.
- Terrain colour by height and slope (grass or field on gentle ground, the kind's rock on steep, sand at the water), then
  CPU-baked horizon AO per vertex, plus darkening under canopies and at the foot of every prop.

JELLY WATER (shared by every tile that has it)
- Translucent, slightly milky turquoise (#7fd6cf at the edge, #3fa8a8 in the deep), its bed visible through it; depth
  read from a stepped bed so the shallows are pale and the middle darker; a bright cream rim where water meets land; gentle
  vertex ripples; a slow soft caustic shimmer on the bed. It never looks like glass or chrome: it looks like jelly.

SCALE AND CRAFT
- One scale everywhere: a person 0.11 tall, a deer 0.09 at the shoulder, a sheep 0.08 long, a pine 0.25 to 0.5, a tent
  0.1. Props are chunky and rounded: fat trunks, soft blob canopies, nothing spindly or toy-thin.
- Foliage is clusters of lumpy noise-displaced icosphere blobs (3–6 per tree), packed so canopies touch, each blob shaded by
  how buried it is among its neighbours and brighter toward the sky. Pines are stacked flattened blobs.
- Every repeated thing is instanced. Everything that lives moves: a small idle loop per creature, nothing frozen.

THE SIX WORLDS

1. TIMBER — "The Salmon Run". A wooded dome hill rises at the back, dense with broadleaf blobs on its flanks and dark pines
   along its crest, a lumpy rolling canopy silhouette. From a mossy spring in a rock cleft high on the hill a little stream
   tumbles in two short falls (white jelly foam at each), winds round one side of the clearing and widens into a small
   round pool at the front side. In the pool: two salmon (coral-pink, darker backs) take turns leaping in an arc and
   splashing back with a ring ripple; small dark fish shadows drift under the surface. At the pool's edge a doe and her
   fawn: the doe lowers her head to drink and lifts it to look around, ears flicking; the fawn stays close. On the other
   side of the clearing, a campsite: an orange canvas A-frame tent, two sitting logs, a ring of stones round a bonfire
   whose flame blobs (yellow core, orange, red tips) flicker and whose embers drift up and fade; a thin curl of smoke; a
   warm point light from the fire on the ground nearby. A felled stump with an axe in it and a small stack of split
   logs. Red-capped toadstools in a fairy ring under the trees, ferns at the stream, a mossy boulder or two. Surprise: an
   owl's two yellow eyes blink in the dark of one pine.

2. WOOL — "Shearing Day". Bright rolling green: a long grassy ridge along one back side with a dry-stone wall running its
   crest and a round oak on top, a soft dip in front. A flock of five fluffy sheep (clustered wool blobs, black faces and
   legs): three grazing with nodding heads, one lying down, one lamb that hops now and then. A sheepdog (black and white)
   trots a slow loop round the flock. A little red-roofed shepherd's hut on wheels by the wall, a wooden gate, a water
   trough with jelly water. Clover and white-and-yellow flower specks, three grey boulders. Surprise: a lamb has climbed
   onto one of the boulders.

3. GRAIN — "Harvest". A golden field on a gentle saddle, ploughed into four strips with real furrow relief, thick with
   instanced wheat tufts that sway in a slow travelling wave of wind. One strip is half cut: stubble, a row of sheaves and a
   farmer swinging a scythe. Three round hay bales (banded, darker core), a red wheelbarrow, a small windmill on the back
   rise whose sails turn slowly. A scarecrow with a straw hat, two crows that hop near it and take off. Poppies at the
   field's edge. Surprise: a hare sits up between two rows.

4. CLAY — "The Brickworks". Burnt-orange ground with a deep stepped quarry pit (three ledges, 0.18 deep) cut toward one back
   side, a pool of muddy jelly water in its floor. A stout plank derrick over the pit lifts a bucket of clay up and down on
   its rope, a pennant fluttering on top. Fresh orange spoil heaps beside it, a worker with a spade digging, a beehive-dome
   kiln with a glowing mouth and a curl of smoke, neat stacks of fired red bricks and a row of grey unfired ones drying on
   a rack, a wheelbarrow of clay. Surprise: a hand-print in one brick.

5. ORE — "The Old Mine". Grey stony ground rising into a ridge at the back from which three faceted peaks grow (the tallest
   0.6, snow-capped with a wisp of cloud caught on it), scree fans at their feet. A timber-framed mine mouth in the ridge
   foot glows warm inside with a hanging lantern; rails run out of it to a cart that rolls out, tips its load of ore on
   a heap and rolls back. A miner with a pick chips at a blue-veined crystal outcrop that sparkles. A small mountain goat
   on a ledge. Surprise: a single gold nugget glints in the scree.

6. WASTE — "The Wayfarer's Rest". Pale dunes with crisp slip faces and wind-ripple stripes, a rust-red rocky mesa at the
   back. A tiny oasis: a palm pair over a round jelly pool. Two saguaro cacti (one flowering pink), a bleached dead tree, a
   half-buried ox skull, scattered stones, tumbleweed that rolls across now and then, a thin dust devil that wanders and
   fades. The wayfarer (the robber) stands here at person scale (0.11) under a hooded cloak with a lantern. Surprise: a
   lizard basks on a rock and darts when the tumbleweed passes.

NUMBER TOKENS
- One size everywhere (radius 0.26, 0.05 thick): cream face, caramel rim (#6b3f22; red #b3261e with red ink for 6 and 8),
  bold numeral and pips, tilted 22° toward the camera, resting on its pad.

QUALITY BAR
- Each tile, set beside the reference squares, reads as the same series: dense, chunky, glossy, soft-lit, with big landform,
  living motion and one surprise. Smooth on a laptop in the studio; no console errors. (Board budgets come later.)
