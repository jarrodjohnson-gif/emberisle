# Hex Jelly — the build prompt (#599)

Written 2026-10-15 from the owner's references (the "Material Studies" jelly dioramas: Atoll, Iceberg, Pirate, Harbor,
and the Torii and Harbor prompts). Those squares are the look; this is the same recipe for a hexagonal tile. Built first
as a standalone studio (`scripts/hex-jelly.html`, `src/lib/scene/hex-jelly.ts`), then ported into the board.

PROMPT

Build "Hex Jelly", a procedural Three.js diorama tile set: six kinds of hexagonal land tile (forest, pasture, grain field,
clay pit, ore mountain, sand waste) that each read as a finished miniature on their own and sit edge to edge as a board.
Everything is procedural: no external models, no textures, no external requests. One studio page shows one tile large
on a warm washi-paper background (#ebe8e1), seen 3/4 from 38° above the horizon and 20° round from the south, with a
soft floor shadow that fades out with distance. The look is the Material Studies series: a chunky cut-cake block of
candy-coloured land, soft studio light, a tilt-shift miniature feel.

THE BLOCK (every tile)
- A hexagonal slab 1.94 across the flats (corner radius 1.12), 0.30 tall, with vertical corners rounded (radius ~0.10)
  and a rounded top edge (radius ~0.05), so it reads as a soft moulded block, never a sharp prism.
- The top is a heightfield ~120 samples across, clipped to the rounded hex, with a boundary skirt down to the strata so
  the cross-section is continuous.
- The cut sides show five candy strata with wavy borders: a thin jelly-green or surface-coloured lip, pale sand
  (#ecdbb2) speckled with white pebbles, a thin shell-white band (#f7f0e2), caramel soil (#bb7a42) speckled with darker
  grit, and chocolate rock (#5f4234) at the base. The speckles are small flattened discs instanced on the faces.
- Gameplay ground rules: the top is exactly flat and level in a disc of radius 0.33 at the centre (the number token's
  pad) and in a disc of radius 0.14 at every corner (where pieces stand); within 0.18 of each edge the ground does not
  rise above the pad level (roads lie there). Everything else is the tile's landform, and it must be big: the tallest
  landform rises 0.35 to 0.6 above the pad, so the tile has a real silhouette from the diorama angle. Landforms sit
  toward the back and sides (away from the camera) so they never hide the token.
- Seeded per tile id: a 60° rotation of the landform, its relief and the prop scatter, so no two tiles of a kind match.

TERRAIN SHADING (one vertex-coloured mesh per tile, then a terrain shader)
- Colour by slope and height: grass/field colour on gentle ground, the kind's rock on steep slopes (speckled, darker in
  creases), sand at the rim, a trodden paler disc under the token.
- CPU-baked horizon AO per vertex (sample the heightfield in 8 directions, the steepest horizon angle darkens it), plus
  canopy-cover darkening under trees and contact darkening at every prop's foot. Creases go soft and warm, never black.
- Brighter tops: upward-facing surfaces lift toward a warm sun tint; downward and away-facing toward a cool shade tint.

LIGHT AND FINISH
- One warm key (#ffe2b8) 55° up from the viewer's front left casting soft PCF shadows (prop shadows must stay readable),
  a hemisphere fill (sky #dff6f4, ground #c9b58f), a weak cool back light that rims far edges.
- Toon-soft lambert: a gentle three-step ramp so faces turned from the key keep half their light; a Fresnel sheen on
  everything (pale, sky-tinted) so surfaces read as glossy candy.
- ACES tone mapping, sRGB, exposure ~1.05, and a subtle tilt-shift blur (top and bottom of frame) for the miniature feel.

VEGETATION AND PROPS (the reason the references read rich: density, clustering and chunk)
- Canopy: an InstancedMesh of low-poly icospheres with vertex-noise displacement, clustered 3–6 blobs per tree, trees
  packed so canopies touch, per-instance AO from neighbour occlusion (blobs deep in a cluster are darker), brighter tops.
  Kinds via an instance colour: broadleaf (round, deep to bright green), pine (flattened pads stacked in a cone), bush.
- Props are chunky: thick trunks, fat rounded forms, nothing spindly. Scale is consistent: a sheep about 0.12 long, a
  person about 0.18 tall, a tree 0.25 to 0.5 tall.

THE SIX TILES
1. Forest. A forested dome hill at the back (0.5 above the pad) and a lower wooded shoulder on one side, with a small
   clearing and a fallen log in front of the token. 25–40 trees: broadleaf blobs on the hill, pines along the ridge, a
   few bushes at the edge, two stumps. The canopy reads as one dense rolling mass with a lumpy silhouette.
2. Pasture. Rolling bright-green ground: a long grassy ridge along one back side (0.3), a dip in front. A dry-stone wall
   or hedge following the ridge, a small round tree or two, five sheep (one lying), white and yellow flower specks,
   three grey boulders.
3. Grain. Golden field on a gentle saddle; four ploughed strips with real furrow relief and gold wheat tufts (instanced
   blades) standing in them; three round hay bales; a scarecrow on 1 tile in 10; a hedge clump at one corner.
4. Clay. Burnt-orange ground with a deep stepped quarry pit (three ledges, 0.18 deep) cut into one back side, spoil heaps
   of fresh clay beside it, a stout plank derrick over the pit with a rope and bucket and a pennant, a stack of bricks,
   a wheelbarrow.
5. Ore. Grey stony ground rising into a ridge at the back from which two or three tall faceted peaks grow (the tallest
   0.6 with snow), scree fans, a timber-framed mine mouth in the ridge foot with rails and a cart, rubble.
6. Sand waste. Pale dunes with slip faces and wind ripples, a rocky outcrop at the back (0.3), a bleached dead tree,
   two cacti, scattered stones and a skull; the wayfarer (robber) stands here at the person scale (0.18).

NUMBER TOKENS
- One size everywhere (radius 0.26, 0.05 thick): cream face, caramel rim (#6b3f22; red #b3261e and red ink for 6 and 8),
  bold numeral and pips, tilted 22° toward the camera, resting on its pad.

BUDGET
- A whole 19-tile board at 60 fps on an iPhone 15 Pro Max: tiles merged per tile, every repeated prop instanced, the
  board at most 40 draw calls for terrain and props and about 220k triangles (blob detail 1, LOD by count, not by mesh).

QUALITY BAR
- The studio shot of each tile, side by side with the reference squares, must read as the same series: dense, chunky,
  soft-lit, candy strata, big landform. No console errors.
