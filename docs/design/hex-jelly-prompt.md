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

THE GAME (owner 2026-10-16): Age of Empires meets Catan in spirit, but the tiles are scenes, not a work simulation. Each one
is alive and beautiful first: water moving, animals, smoke, wind. A person appears only where they add charm (the shepherd,
the farmer, the woodcutter); no tile needs a worker, and none is a busy village. A roll is the land's moment to show off.

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
- One size ladder on every tile (owner 2026-10-15: "referenced for sizing, not 1-to-1 to real life, but across all hexes"):
  toy-town ratios, buildings big and figures small, always the same ones. Heights: hen, duck, crow 0.03-0.04; hare 0.09;
  sheep 0.12 (0.09 long), lamb 0.08; dog 0.08; deer 0.17 to the ears (0.12 at the shoulder), fawn 0.11; person 0.13;
  scarecrow 0.15; tent 0.13; shepherd's hut 0.19; farmhouse 0.24; barn 0.29; silo 0.32; windmill 0.54 with its sails; a
  tree 0.25 to 0.5; the number token 0.52 across. One table (SIZE in hex-jelly.ts) sets them, and the line-up shot
  (node scripts/hex-jelly.mjs --lineup) shows them side by side. Props are chunky and rounded: fat trunks, soft blob
  canopies, nothing spindly or toy-thin.
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
   warm point light from the fire on the ground nearby. The woodcutter at work at the forest's edge: a villager in a red
   shirt swinging an axe into a tree, chips flying, beside a stump with an axe in it and a stack of split logs. Red-capped toadstools in a fairy ring under the trees, ferns at the stream, a mossy boulder or two. Surprise: an
   owl's two yellow eyes blink in the dark of one pine.

2. WOOL — "Shearing Day". Bright rolling green: a long grassy ridge along one back side with a dry-stone wall running its
   crest (a gap in it closed by a wooden gate) and a big round oak on top, soft swells and a dip in front. A flock of five
   fluffy sheep (clustered cream wool blobs, black faces, legs and ears): three grazing with nodding heads, one lying down
   chewing, one lamb that hops now and then. A black-and-white sheepdog trots a slow loop round the flock, tail up. On the
   flat by the hut the shearing: a shepherd in a blue smock and a straw hat bent over a sheep that is half shorn (one side
   pink and bare, one side woolly), a fluffy pile of fleece beside them and two stuffed wool sacks. A little red-roofed
   shepherd's hut on wheels by the wall with a stove pipe and a wisp of smoke; a wooden water trough with jelly water.
   Clover patches, white and yellow flower specks, three grey boulders. Surprise: a lamb has climbed onto a boulder.

3. GRAIN — "Harvest". A patchwork, not a beige sheet: green meadow land with the field in front cut into four gold-and-brown
   strips seamed by green hedgerows. Two strips of standing wheat (instanced tufts with plump ears) sway in a slow travelling
   wave of wind; one is half cut (stubble, stooks in rows, a farmer swinging a scythe into the standing edge); one is freshly
   ploughed, rich brown furrows worked by hopping crows that now and then flap up and settle. The hero cluster at the rise's
   foot: a red barn with white trim and a hay loft, a cream farmhouse with chimney smoke, a grey silo, a hay wagon piled
   high, hens pecking the yard. A windmill crowns the back rise, sails turning. On the other side a duck pond of jelly water
   with reeds and bulrushes, two ducks paddling round. Round hay bales and round trees in the meadow, a red wheelbarrow of
   sheaves, a scarecrow in a straw hat, poppies and cornflowers on the margins. Surprise: a hare sits up between two rows.

4. BRICK (the clay tile) — "The Brickworks". Bricks are the hero; the clay quarry is where they come from. Warm terracotta ground. On a front flank, where the eye looks down into it, a big irregular
   open-cut dug into the earth: rough walls banded cream, apricot and rust by the layers it cut through, a bench halfway
   down, a damp floor with a turquoise jelly puddle in its low corner, and a narrow trench slot running off one end. Faceted
   rocks pile along its rim, rubble and crates lie on its floor. A timber headframe stands over a square shaft mouth, its
   wheel turning as a bucket of clay rises out of the shaft and sinks back; a plank scaffold deck against the back wall with
   a ladder, another ladder up over the rim. Sand martins dart from nest holes in the quarry wall. At the back, the tall
   things: a beehive kiln with a glowing mouth and a curl of smoke (a cat asleep on top, the surprise), a tall square brick
   chimney trailing smoke, a drying yard of long hacks (green bricks stacked in open lattice courses under little plank
   roofs), pallets of finished red bricks stacked high, a red-brick cottage with a slate roof, amphorae, a few cypresses; green scrub and poppies against the orange. Two
   villagers carry hods of clay from the quarry's rim to the kiln and walk back. Roll: the bucket comes up full, the kiln
   puffs sparks, the martins burst out, the carriers hurry. Night: the kiln mouth, the headframe lantern, the cottage window.

5. ORE — "The Old Mine". Grey stony ground rising into a ridge at the back from which three faceted peaks grow (the tallest
   0.6, snow-capped with a wisp of cloud caught on it), scree fans at their feet. A timber-framed mine mouth in the ridge
   foot glows warm inside with a hanging lantern; rails run out of it to a cart that rolls out, tips its load of ore on
   a heap and rolls back. A miner with a pick chips at a blue-veined crystal outcrop that sparkles. A small mountain goat
   on a ledge. Surprise: a single gold nugget glints in the scree.

6. WASTE — "The Wayfarer's Rest". Pale dunes with crisp slip faces and wind-ripple stripes, a rust-red rocky mesa at the
   back. A tiny oasis: a palm pair over a round jelly pool. Two saguaro cacti (one flowering pink), a bleached dead tree, a
   half-buried ox skull, scattered stones, tumbleweed that rolls across now and then, a thin dust devil that wanders and
   fades. The wayfarer (the robber) stands here at person scale (0.17) under a hooded cloak with a lantern. Surprise: a
   lizard basks on a rock and darts when the tumbleweed passes.

THE TILE IN PLAY (owner 2026-10-16: "when the land wins a roll it can interact"; all five below)
1. Roll payoff. When a tile's number is rolled, the whole block gives a jelly wobble (a quick squash and stretch, two
   bounces over about 2.4 s) with a soft warm flash, and its story reacts for that beat: forest, both salmon leap high
   together and the doe lifts her head, ears up; pasture, the whole flock hops and the collie dashes a fast lap; grain, the
   windmill's sails spin up and the crows all take off as a gust rolls through the wheat; clay, the derrick hauls a full
   bucket up and the kiln puffs; ore, the cart rolls out heaped and tips, the crystal flares; waste, the dust devil whirls
   up and the tumbleweed bounds across.
2. Robber. While the wayfarer stands on a tile its life stops and its colours dull by about half toward grey: the bonfire
   goes out, the flock huddles together, the windmill and the wheat fall still, the derrick and the cart stop. It reads at a
   glance which tile is blocked; lifting the robber brings it all back.
3. Night. In the board's night mode the moon is cool and low and every lived-in thing glows warm: the campfire lights the
   clearing and the tent glows from inside, the hut's window and stove, the farmhouse windows and the barn's loft, the
   kiln's mouth, the mine's lantern and mouth, the wayfarer's lantern. Fireflies over the forest pool.
4. Board-wide life. Over the whole island, not one tile: seagulls (white heads and bodies, grey wings with black tips,
   yellow bills) wheel in loose twos and threes on wide gliding loops, banking and now and then flapping, and soft
   cloud shadows drift slowly over the board, so it reads as one world rather than nineteen dioramas.
5. Strata per kind. The same five bands, tinted to the land: forest and pasture caramel soil over chocolate rock; grain a
   golden sand and warm brown soil; clay terracotta soil over deep red rock; ore pale grey sand, grey-brown soil, slate rock;
   waste deep sand, ochre soil, rust rock. The side of a tile hints at what it is.

VARIATION (open, owner 2026-10-15: "we will want some variations so the whole map isn't repeated"; decide later)
- Today every tile is seeded: which back edge the landform leans to, its relief, every scatter, and so where the stream, the
  pool and the camp fall. Seven forests in a ring already differ in layout but tell the same story.
- Options to choose from: (a) subtle: the same story, different arrangement and small swaps (two deer or a stag, a tent or a
  lean-to, a pond or a beaver dam); (b) rotations: the landform free to face any back edge, so silhouettes vary; (c) story
  variants per kind (forest: Salmon Run, Woodcutter's Cabin, Old Ruin; pasture: Shearing Day, Haymaking, Lambing), dealt so
  neighbours never repeat. These combine.
- Camera: the owner is fine with the tall landform as is (it sits behind the token from the default view; orbiting 180°
  lets hills hide tokens, seen in the studio's ring=1&az=200 shot).

NUMBER TOKENS
- One size everywhere (radius 0.26, 0.05 thick): cream face, caramel rim (#6b3f22; red #b3261e with red ink for 6 and 8),
  bold numeral and pips, tilted 22° toward the camera, resting on its pad.

QUALITY BAR
- Each tile, set beside the reference squares, reads as the same series: dense, chunky, glossy, soft-lit, with big landform,
  living motion and one surprise. Smooth on a laptop in the studio; no console errors. (Board budgets come later.)
