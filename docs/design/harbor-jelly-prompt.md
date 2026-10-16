# Harbor Jelly — the build prompt (#599)

Rewritten 2026-10-16 after the owner turned down the first pass ("That beach and harbor look like shit. We need a full jelly
prompt. Look at the reference images"). The references: the owner's Material Studies shots (Atoll Jelly, Pirate Jelly,
Iceberg Jelly, the owner's "Harbor Jelly" prompt) and the boat-in-a-pool shot. What they share, and what the first pass
lacked:
- a wide, pale sand shore that slopes gently into the water instead of a flat ribbon at sea level;
- very clear turquoise shallows: the sea floor shows through them (sand ripples, weed, stones, starfish, a ray, fish), with
  bright caustics, a white foam lace hugging the waterline and ripple rings round anything standing in the water;
- timber piers on real piles with cross-bracing, going down into that clear water, mussels and weed on the piles;
- the boats are miniature ships, not toys: a planked hull with a sheer line, a deck, a cabin, masts, booms, rigging lines,
  sails with shape, flags; each sits in the water with a little wake and a reflection of its colour;
- everything is detailed at the scale it is seen at and lit like the hexes: glossy, soft, warm creases, crisp shadows.

The ocean stays continuous (owner, #597: no square block, no strata). This prompt is for everything round the island that is
not a hex: the shore, the shallows, the nine harbors and their ships. Design first in a standalone studio
(`scripts/harbor-jelly.html`, `src/lib/scene/harbor-jelly-studio.ts`, `node scripts/harbor-jelly.mjs`) showing one stretch of
coast with two harbors at large size, then the whole board, then the owner signs it off.

PROMPT

Build "Harbor Jelly": the shore of a hex island in the Material Studies look. Nine little harbors ring the island, each a
finished story you could stare at: a timber pier on piles standing in clear jelly shallows, a dockhouse, the harbor's goods
on the boards, and a small sailing ship moored alongside, rocking on the swell. Between the harbors runs a soft pale beach
that slopes into turquoise shallows, with the floor showing through. Everything procedural Three.js, matching the six Hex
Jelly tiles it surrounds (`hex-jelly-prompt.md`: same light, toon ramp, Fresnel sheen, warm creases, chunky rounded forms).

THE GAME (what must stay true)
- A dock spans one coastal edge; both its corners carry the harbor. Nine docks: four 3:1 (any good) and five 2:1 (one each of
  timber, clay, wool, grain, ore). The deal spaces them at least three edges apart, so each harbor has its own stretch.
- Rate and good read from the board camera on a phone, at a glance: a plate flat on the pier's T-head carries "2:1" or "3:1"
  in the good's colour (the sails carry no rate: owner 2026-10-16, "remove the 3/1 trades from sails"), a 2:1 sail is banded in its good's colour (the hex palette), its flag is the good's colour, and the goods on the pier are the good
  itself. A claimed harbor (an outpost or stronghold of a seat on either corner) flies that seat's colour on its sail.
- Nothing on the shore or a pier rises within 0.14 of a coastal corner (pieces stand there); nothing on the beach stands
  taller than 0.05. Piers and ships stand off the coast, outside the hexes' footprint.
- None of it is pickable; a tap on the shore or the sea does what it does today.

THE SHORE
- The beach becomes a wide sand apron round the whole island: from under the hex blocks out to about 0.55 beyond the coast,
  its top dry and pale (#f3e4bf, soft fine grain), sloping gently (never a step) through a damp band (#e0cb98) and a wet,
  glossy band at the waterline (#cdb583, a little specular), then on down under the water as the shallow floor.
- Its outline is not the hexes' zigzag: it rounds off the coast's corners into soft bays and points, wider in the bays
  between the hexes and narrow under the points, seeded per island, so the island reads as an atoll, not a cut shape.
- Low dunes along the back of the dry sand against the hex blocks, a few with tufts of beach grass (the hexes' spindle tufts,
  pale green and straw), and here and there a beach rock group (rounded granite, a wet dark band at the waterline, weed and
  barnacles below it), a bleached driftwood log, shells, a starfish on the wet sand, a crab or two that scuttles and digs in.
- Footprints and a line of wrack (dark weed and shell bits) along the high-tide mark.

THE SHALLOWS (the crystal sea, at the shore)
- The water over the apron is a lagoon: clear, pale turquoise (#9fe7dc to #5fcac0), so the sand shows bright through the
  first 0.3, then the floor fades to teal as it deepens toward open water (the crystal sea's absorption, with the floor
  raised to meet the new apron).
- On the shallow floor: sand ripples (a soft ridged pattern in the floor shading), patches of sea grass that sway, small
  coral heads in two or three candy colours (coral pink, lilac, butter) near the harbors, stones, starfish, a sunken amphora,
  a small school of fish that darts as a group, and one ray that glides slowly round the island.
- At the waterline, the foam lace: a bright white, broken line that follows the real waterline of the sloping sand, a second
  fainter line behind it, and the swash that runs up the wet sand and slides back with each swell (the crystal sea's edge
  strip, moved to the new waterline).
- Ripple rings round every pile, rock and hull at the waterline; bright caustics on the shallow floor and on the piles.

THE HARBORS (one per dock, all built from the same kit, laid out per dock so no two match)
- The pier: a timber jetty from the dry sand out over the water, about 0.55 long and 0.2 wide, its deck about 0.12 above the
  water: planks running across with dark gaps and the odd paler plank, two edge beams, standing on pairs of round piles
  (warm grey-brown, darker and furred with weed and mussels below the waterline, visible through the jelly) with X
  cross-bracing between them. At the sea end a T-head; bollards with rope coils; a ladder down into the water; a lamp post
  with a lantern that glows at dusk; a lifebuoy (orange and white) on a post; old tyres hung as fenders where the ship lies.
- The dockhouse at the root of the pier: a small timber shed on low piles (the hexes' house kit: plank walls, a pitched roof
  of the harbor's colour family, a door, a window with a warm light), a crane arm or a hoist on one, a hanging sign board
  painted with the good's colour.
- The goods, stacked on the pier by the house, in the hexes' forms: timber, a log stack and a few sawn planks; clay, pallets
  of red bricks and a pot or two; wool, tied cream bales and a fleece on a rail; grain, sacks and a golden sheaf on a cart;
  ore, a crate heaped with grey lumps, one glinting, and a little rail cart; 3:1, barrels, crates and a net, mixed.
- The ship: moored alongside the T-head, its bow to the shore, about 0.5 long:
  - 2:1 harbors: a cog or sloop with a planked wooden hull (strakes visible as fine ridges, a darker wale, a painted band in
    the good's colour, a red-brown bottom showing just under the water), a deck with hatch and a small aft cabin with a
    window, one mast with a boom and gaff, a mainsail with real belly (plain cream canvas, the good's colour
    band at its foot, seams as faint lines), a jib on the forestay, shrouds and stays as thin dark lines, a flag at the
    masthead in the good's colour.
  - 3:1 harbors: a larger two-masted ketch (white hull, navy band), the same rig, a second mast with its sail furled.
  - Mooring lines from bow and stern to the bollards. It rocks on the swell and rides it (as today), with a soft wake line
    along its waterline.
- Life at each harbor, one small story each, seeded: a fisherman sits on the pier end with a rod (a bob in the water); a gull
  stands on a bollard or the masthead and now and then flaps; a cat on the goods; a rowboat tied to the ladder; fish gather
  under the pier; at one harbor a crate is hoisted up and down on the crane. The hexes' person and creature kit, at the
  hexes' size ladder (person 0.13, gull 0.04, cat 0.03).

OPEN WATER (around, never over the harbors)
- Two or three yellow mooring buoys and one red-and-white channel marker, bobbing on the swell.
- Gulls circling high, landing on the ships, the lamps and the dockhouse roofs.

LIGHT AND LOOK
- The hexes' light and materials: toon ramp, sky Fresnel sheen, warm soft creases, no outlines; the piles and hulls cast
  crisp shadows on the shallow floor through the water; at night the lamps, windows and lanterns glow and their light
  catches the water.

PERFORMANCE (the owner's phone, as the hexes)
- Built once per island inside the jelly-board chunk after the hexes swap in, in steps (as the hexes), at board detail.
- Static parts (apron, dunes, rocks, piers, houses, goods) baked into a few merged meshes; ships one group each (they move);
  creatures and fish instanced. Budget over today's beach and docks: at most 12 draws and 80k triangles.
- The lite board (software GPUs) keeps today's beach and docks.
