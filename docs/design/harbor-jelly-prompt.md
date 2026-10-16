# Harbor Jelly — the build prompt (#599)

Written 2026-10-16 after the owner signed off the six hexes ("You should jelly prompt the ship harbor now. And the
beaches, ports etc"). The same look as `hex-jelly-prompt.md`, for everything round the island that is not a hex: the
beach, the foam, the nine docks and their boats. Design first in a standalone studio (`scripts/harbor-jelly.html`,
`src/lib/scene/harbor-jelly.ts`, `node scripts/harbor-jelly.mjs`), then on the board once the owner signs it off.

PROMPT

Dress the island's shore as a Material Studies jelly diorama, to match the hexes it rings: a soft candy beach that rolls
into translucent jelly water, foam lace that breathes in and out, and nine little harbors, each a chunky toy pier with its
cargo and a chubby boat that bobs at its end. Each harbor reads at a glance, from the whole-board camera, as what it trades
and at what rate. Everything procedural, no models, no textures (the sail's rate is the one canvas, as today).

THE GAME (what must stay true)
- A dock spans one coastal edge; both its corners carry the harbor. Nine docks: four 3:1 (any) and five 2:1 (one each of
  timber, clay, wool, grain, ore). The deal spaces them at least three edges apart.
- The rate and the good must read from the board camera on a phone: the sail carries "2:1" or "3:1", a 2:1 sail a band in
  its good's colour (the hex palette), and the cargo on the pier is the good itself.
- A claimed dock (an outpost or stronghold of a seat on either corner) shows that seat's colour on its sail, as today.
- Nothing on the beach or a pier rises within 0.14 of a coastal corner (pieces stand there), and nothing on the beach
  stands taller than 0.05 anywhere (it never hides a piece or a path).
- None of it is pickable; a tap on the beach or the sea does what it does today.

THE BEACH
- The strip round the coast (inner 0.04 under the slabs, outer 0.22) becomes a jelly sand bank: pale sand (#f0dfb4) on top
  with its outer edge rolled over (~0.04) into the water, so it reads as moulded, not a flat ribbon; a darker wet band
  (#d6c08e) where it meets the water, and the sand seen faintly through the jelly shallows beyond.
- Scatter, seeded from the island, sparse and low: white pebbles, a few pink and cream shells, a starfish or two, small
  rock clusters (the hexes' strata browns) with a lick of green weed, a bleached driftwood log. Near each dock a little more
  (a coil of rope, a beached rowboat on one).
- Life: two or three small crabs that scuttle sideways and pause; the odd gull that lands on the sand and takes off again.
- Foam: the lace beyond the sand is scalloped, not a band, and slides out and back with a slow tide (it breathes today; now
  it moves).

THE DOCKS
- Pier: from the beach's outer edge to just past the foam (0.22 to about 0.5), a chunky plank deck in warm jelly wood
  (#b07a4c, the gaps darker) on four fat round posts each wearing a rope ring, the deck's ends rolled, not cut. A bollard
  at the sea end with a rope looping to the boat, and a fat lantern on a post that glows at night.
- Cargo, on the deck's land half, the good itself in the hexes' own forms:
  - timber: a stack of three logs, ends pale;
  - clay: a pallet of red bricks;
  - wool: two cream bales, tied;
  - grain: sacks and one golden sheaf;
  - ore: a crate heaped with grey ore lumps, one glinting;
  - 3:1: a barrel, a crate and a sack together.
- Boat: a chubby rounded hull (about 0.34 long) in glossy wood with a cream stripe and a darker rim; a fat round mast; a
  puffed sail (billowed, not a flat plane) in cream with the rate printed large and the good's colour band at its foot; a
  small pennant at the masthead that flutters. It rides the same swell as today.
- The surprise: on one dock a cat sits on the cargo and turns its head; on another a gull stands on the masthead and now
  and then flaps.
- Night: the lanterns and a cabin window glow (the hexes' night palette).

PERFORMANCE
- Built once per island, in the jelly-board chunk, after the hexes: the beach and its scatter baked into a few meshes, the
  piers and cargo merged per material over all nine docks, the boats one group each (they move). Budget: no more than 10
  draws and 40k triangles over today's coast and docks. The lite board (software GPUs) keeps today's beach and docks.
