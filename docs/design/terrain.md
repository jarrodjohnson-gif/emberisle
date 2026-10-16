# Sculpted terrain (epic #599)

> Superseded on the board by the Hex Jelly scenes (#624, `jelly-board.md`): the renderer no longer uses `terrain.ts`. Kept
> for the record.

The six terrains are sculpted, polished cartoon tiles built in code from three.js geometry, in the manner of the Atoll Jelly
diorama: a bevelled slab with candy strata on its side, a gently sculpted top, chunky props, flat vertex colour. No photo or
painted textures (the old `TEX_FILE` / `paintedTexture` path is gone). Code: `src/lib/scene/terrain.ts` (`sculptHex`,
`PropKit`, `decorate`), wired in `buildLand` in `isle-renderer.ts`; colours in `palette.ts` (`PAINT`, `STRATA`, `PROP`).
Proof: `npm run board-look-prove` (the "terrain" checks) with `tokens-prove`, `jelly-ocean-prove` and the rest unchanged.

## Every tile

| Part | Recipe |
|---|---|
| Top | A triangular lattice, 12 rings (864 triangles), over the hex inset by the rim. Each vertex is lifted by the terrain's relief (below) times two masks: zero within 0.40 of the centre (the token, smoothly up to full by 0.56), and zero toward the rim (bumps fade out by 0.78 of the inradius, dips by 0.93), so the top is **exactly `topOf`** under the token and on the rim where corners and paths stand. `topOf` is unchanged, so tokens, pieces (`hexTops`, `restY`), the wayfarer and the target rings sit where they did. Normals from the height function (soft); colour from the height (hollows lean to the shade, crests to the base and a lighter tint). |
| Rim | A quarter round, 0.06 out and 0.045 down, three segments, painted from the top's colour into the lip. |
| Side | Five bands with wavy borders (seeded noise along the perimeter): the terrain's lip, sand `#ecdbb2`, a thin shell band `#f7f0e2`, caramel soil `#bb7a42`, chocolate rock `#5f4234`; flat per face, 0.04 below the base so no seam shows through the crystal sea. |
| Variation | `mulberry32(hashStr(id + terrain))`: a rotation in 60° steps (which corner holds the feature, which flat holds the fence, the plots' row directions), the noise seed and the relief strength (0.8-1.2), then every prop's spot. No two tiles of a kind are alike (the proof compares their heights). |
| Material | One `MeshStandardMaterial` per hex (vertex colours, roughness 0.9), so the paying-hex flash still has one material per hex (`caps`); an `aGlow` attribute keeps the glow on the top and rim, off the side. |

## Per terrain

| Terrain | Top | Props |
|---|---|---|
| Forest (timber) | Gentle noise, 0.045 | 22-27 pines (trunk under five soft-bell frond tiers in five greens, three per-tree tints, 0.44-0.68 tall), packed with 28 % overlap around the token; two stumps, a log, two bushes. |
| Pasture (wool) | Rolling hills, 0.07 | 4-5 sheep (body, head, legs) wandering the 0.54-0.74 ring; a post-and-rail fence along one flat and a hedge along another, outside that ring; rocks in three corners; grass tufts. |
| Grain | Three plots of ploughed rows: each row runs along one of the lattice's own directions and a furrow is exactly one lattice line in three (crisp, never aliased); a shallow sandy path between the plots. | Round bales with two twine bands and a darker rolled core, a twined square bale, two wheat tufts (one field mesh per hex), the farmer and his sickle. |
| Clay | A quarry pit (radius 0.33, toward a corner) of three flat ledges with short steep risers, ledges in alternating orange, risers and floor in the shade. | A plank derrick beside the pit (tripod, cross-braces, boom with pulley, rope and bucket over the terraces, a pennant), two brick stacks on pallets, two spoil mounds. |
| Ore | Ridged noise, 0.075 | Two or three faceted peaks (7 sides, 4 jittered bands, so 2-3 facet planes per face; grey at the foot to pale stone at the summit) leaning to one corner; on the far side a rock face with a dark adit in a timber frame, rails on sleepers out of it, the ore cart rolling on them, and the miner with his pickaxe. |
| Desert (waste) | Dunes across the tile with fine wind ripples on them | A cactus with two arms, a dead tree, bleached rocks, dry tufts. The wayfarer stands on the flat centre. |

Nothing comes within 0.42 of a hex centre (the token's 0.34 plus its 0.05 of ground, and a little more; `tokens.md`), and
nothing reaches past 0.95 of the inradius. The #604 rule (a prop between a token and the diorama eye shrinks until the
numeral clears it, never below 0.3) now covers the ore peaks and the clay derricks as well as the pines: they are in
`trees`, and each keeps its own base scale (`userData.base`); only pines sway. The props arrive a frame after the tiles,
so their arrival clears the shade pass's cached pose and the rule runs again with them in `trees`.

## How the props stay cheap

Every prop kind that moves or is shrunk per object (pines, peaks, derricks, sheep, cart, miner, pickaxe, farmer, sickle) is
**one `InstancedMesh`** drawn from invisible proxy meshes in `living`. A proxy holds the transform, the old `userData`
(`prop`, `hex`, `reach`) and the real geometry, so a proof's raycast or bounding box measures what is drawn; `PropKit.sync`
copies the proxies' matrices into the instances on every drawn frame. Everything that stands still is merged into one mesh per
terrain (grain's per hex, as its `field`), each listing its `footprints`. All props share one material.
A tile tap's wobble (`wobble.ts`) scales the proxies and the grain field with the tile; for the merged statics it scales
`PropKit.anchor(hex)`, and `sync` rescales that hex's run of vertices about the tile's origin from a rest copy.

## Numbers (standard 19-hex board, measured by `board-look-prove`, `window.__terrain`)

| | Measured | Budget |
|---|---|---|
| Draw calls, terrain and props (main pass) | 37 (19 tiles, 9 instanced kinds, 5 merged terrains, 4 grain fields) | 40 |
| Triangles, tiles | 82,080 (4,320 each) | |
| Triangles, props | about 38,600 | |
| Triangles, whole island (land, props, tokens, docks, pieces) | about 125,000 | 220,000 |
| Nearest prop vertex to a token's centre | 0.43 | 0.37 (the disc at its 1.08x diorama scale) |
| IslandCanvas chunk | 188.80 kB gzip (+4.9 kB) | 189.50 kB |
| New textures | none | none over 512 px |

Frame cost, SwiftShader in this container (`scratchpad/tbench/frame.mjs`: the whole play scene, diorama at 1280x720, median
of 40 synchronous draws, three interleaved runs against the camera branch): simple sea 101-108 ms before, 124-132 ms after;
crystal sea 316-447 ms before, 391-679 ms after (noisy). Renderer calls per frame (every pass) fell from about 490 to 245
(simple) and 790 to 420 (crystal); frame triangles rose from about 66k to 260k (simple). Software GL is vertex bound, so it
pays for the triangles; an iPhone 15 Pro's GPU is bound by calls and fill long before 260k triangles. The knob, if a real-GPU
measurement (#464) says otherwise, is `RINGS` in `terrain.ts` (now 12 rings, 864 triangles per tile top; grain's rows stay exact at any
ring count).

## What a real asset kit would replace

The glTF pipeline (`claude/gltf-pipeline-599`, `docs/design/assets.md`; not a dependency here) defines a kit of `tile_<terrain>`
and `prop_*` parts, each ready for an `InstancedMesh`. Against this module:

- `sculptHex` would become one instance of `tile_<terrain>` per hex, turned by the same 60° step. The kit's tiles must keep the
  contract this one holds: flat at `topOf` within 0.40 of the centre and along the rim, so `topOf`, `hexTops` and the token
  pose need no change; the paying-hex flash then needs a per-instance colour or emissive attribute instead of a material per hex.
- Each `PropKit.proxy` kind (`pineGeo`, `peakGeo`, `derrickGeo`, `sheepGeo`, the workers) would take its geometry from a kit
  part instead of a builder: the proxies, `sync`, the shade rule and the proofs stay as they are.
- The merged statics (stumps, fences, bales, bricks, adit, cactus) would become instanced kit parts placed by the same
  `decorate` spots and footprints.
- The ground sampler (`Sculpt.ground`) is what props stand on; a kit tile needs either a matching height function or a raycast
  down onto the tile at placement time.
