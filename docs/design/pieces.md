# Paths, outposts, and strongholds that read in every seat colour (issue #133)

Sources: [docs/research/visual-polish.md](../research/visual-polish.md) §5; `buildPieces`, `makeHouse`,
`disposeGroup`, and `PAINT` in `src/lib/scene/isle-renderer.ts`; `PLAYER_COLORS` in `src/lib/game/types.ts`;
`hexHeight` in `src/lib/game/board.ts`; the #128 decision (overhead camera by default in play, the tilted
camera behind a toggle); [docs/design/mobile-camera-touch.md](mobile-camera-touch.md) (the overhead fit this
is sized against); docs/BUILD_BIBLE.md motion table (outpost drops and settles, stronghold swaps with a
bounce: not this issue, but the shapes below must survive it).

## What is wrong today

- A path is a `BoxGeometry(0.13, 0.07, edge × 0.9)` in the seat colour. At the overhead scale below that is
  6 px wide, with no edge against the cap.
- An outpost is a `0.2 × 0.12 × 0.18` box in the seat colour with a dark roof (`#4a3022`). A stronghold is
  the same box at `0.28 × 0.16 × 0.24` with a `0.12 × 0.18 × 0.12` keep on one side: the same silhouette, a
  bit bigger. From overhead both are a brown roof, because the roof covers the seat colour.
- The seat colour touches the cap directly, so the piece's readability is the seat colour's contrast against
  that cap. The table below shows that this fails for every seat on at least four of the seven grounds.
- Three materials and two or three meshes per piece.

## Scale this is sized against

Pieces are judged at the overhead camera, the v1 default in play (#128). With the desktop insets in
`docs/design/mobile-camera-touch.md` the island's 11.2 world units of height fill the 480 px hole at
1280×720: **43 px per world unit**, 75 at 1920×1080. The tilted camera today is about 94 px per unit at the
island's centre, so anything that reads overhead reads there too. The smallest feature that is still a line
on screen at 43 px per unit is 0.05 world units (2 px); that sets every rim width below.

Vertex spacing is `HEX_SIZE` = 1.12, and the rules keep buildings at least two edges apart, so a building
footprint of 0.54 can never touch another building. A path's ends run under the bases of the buildings at its
corners; that is deliberate (see Paths).

## The contrast check

WCAG 2 contrast ratio (relative luminance, `(L1 + 0.05) / (L2 + 0.05)`) and CIEDE2000 ΔE, computed from the
hex values in the code: `PLAYER_COLORS` for the seats, `PAINT[kind][0]` for the cap of each terrain (the
painted texture's base, which is what the tile shows), and the beach `#e8d7b0`, which a coastal corner sits
beside. The threshold is **3.0:1**, WCAG's minimum for a graphical object against its background
(SC 1.4.11). The renderer lights and tone-maps these, which moves every pair the same way; the ratios are
the albedo pairs, which is what the halo rule has to hold for.

Seat colour straight on the cap, which is today's piece:

| Seat | timber `#2f6b3a` | clay `#b5522a` | wool `#8fbf5a` | grain `#e0b13a` | ore `#6e7580` | waste `#c4a574` | beach `#e8d7b0` |
|---|---|---|---|---|---|---|---|
| Ember `#c45c3e` | 1.51 / 50 | **1.18 / 5** | 1.97 / 52 | 2.13 / 34 | **1.09 / 30** | 1.82 / 26 | 2.99 / 36 |
| Tide `#2a8f8a` | 1.64 / 21 | 1.28 / 47 | 1.81 / 30 | 1.95 / 41 | **1.19 / 22** | 1.66 / 34 | 2.74 / 37 |
| Dune `#e4c9a0` | 4.01 / 43 | 3.13 / 35 | 1.35 / 23 | **1.25 / 14** | 2.91 / 35 | **1.47 / 10** | **1.12 / 5** |
| Pine `#3d6b4f` | **1.04 / 6** | 1.23 / 44 | 2.86 / 32 | 3.08 / 42 | 1.32 / 24 | 2.63 / 36 | 4.33 / 42 |

(ratio / ΔE; bold is a pair under 1.5:1 or ΔE under 15, which is "the same colour" at 12 px.) 23 of 28 pairs
fail 3.0. No single seat palette fixes this, because the four seats were picked to differ from each other, not
from six caps and a beach.

The two rim colours, against the same grounds:

| Rim | timber | clay | wool | grain | ore | waste | beach | min over grounds |
|---|---|---|---|---|---|---|---|---|
| Light `#fff6e8` | 5.97 | 4.66 | 2.01 | 1.86 | 4.34 | 2.18 | 1.33 | 1.33 |
| Dark `#1c1916` | 2.74 | 3.50 | 8.14 | 8.77 | 3.77 | 7.48 | 12.32 | 2.74 |
| **max(light, dark)** | **5.97** | **4.66** | **8.14** | **8.77** | **4.34** | **7.48** | **12.32** | **4.34** |

Neither rim alone passes everywhere: the light rim dies on the beach and the grain, the dark rim on timber.
Together, the better of the two is at least 4.34:1 on every ground, and the two rims against each other are
15.7:1, so wherever one rim vanishes the other draws the silhouette. That is the treatment: **every piece
sits on a two-step base, a cream plinth inside a dark skirt.** The seat colour never touches the cap.

The seat colour then only has to be told from its own rims:

| Seat | vs light `#fff6e8` | vs dark `#1c1916` | better |
|---|---|---|---|
| Ember | 3.96 | 4.12 | 4.12 |
| Tide | 3.63 | 4.50 | 4.50 |
| Dune | 1.49 | 10.97 | 10.97 |
| Pine | 5.74 | 2.85 | 5.74 |

Every seat passes 3.0 against at least one of its two rims, and the rim it fails against is the one next to
a rim it passes against. Seat against seat is a palette question (`PLAYER_COLORS`, #142's picker), not this
one; for the record the closest pair is Tide/Pine at ΔE 17, which is distinct, and Ember/Tide is 1.09:1 by
luminance but ΔE 48 by hue.

## Geometry

One shared material for every piece, and one mesh per piece: the parts are box and extrude geometries,
each given a `color` attribute, merged with `mergeGeometries` from
`three/addons/utils/BufferGeometryUtils.js`:

```ts
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const RIM = { light: "#fff6e8", dark: "#1c1916" } as const; // in src/lib/scene/palette.ts

const PIECE_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
PIECE_MAT.userData.shared = true; // disposeGroup leaves it alone

function tint(geo: THREE.BufferGeometry, hex: string) {
  const c = new THREE.Color(hex); // sRGB in, linear out: the same conversion material.color gets
  const a = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) c.toArray(a, i);
  geo.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return geo;
}

// A box whose bottom face is at y, centred on (x, z). Non-indexed, because ExtrudeGeometry is non-indexed
// and mergeGeometries refuses to mix the two.
function slab(w: number, h: number, d: number, hex: string, y = 0, x = 0, z = 0) {
  return tint(new THREE.BoxGeometry(w, h, d).toNonIndexed().translate(x, y + h / 2, z), hex);
}

function piece(parts: THREE.BufferGeometry[]) {
  const m = new THREE.Mesh(mergeGeometries(parts), PIECE_MAT);
  m.castShadow = true;
  return m;
}
```

All y values are above the piece's origin, which `buildPieces` places at `vertexTop` or `edgeTop` as today.
`w` is across the piece, `d` is along it. Colour `seat` is the player's `color` string, unchanged, so a piece
matches its HUD swatch.

### Outpost (`makeOutpost(seat)`)

| Part | `slab(w, h, d, colour, y)` | Top |
|---|---|---|
| Skirt | `0.48, 0.04, 0.44, RIM.dark, 0` | 0.04 |
| Plinth | `0.38, 0.04, 0.34, RIM.light, 0.04` | 0.08 |
| Body | `0.26, 0.14, 0.22, seat, 0.08` | 0.22 |
| Roof | gable: `Shape` triangle (−0.14, 0) → (0.14, 0) → (0, 0.12) in XY, `ExtrudeGeometry({ depth: 0.24, bevelEnabled: false })` (extrudes along +Z, so the ridge runs along the piece's depth with no rotation), `translate(0, 0.22, −0.12)`, tinted `seat` | 0.34 |

Checked with three 0.186 in Node: the merged outpost is 132 vertices with `position`, `normal`, `uv`,
`color`, bounding box (−0.24, 0, −0.22) to (0.24, 0.34, 0.22). The stronghold below is 288 vertices, top at
0.39. 0.34 tall, 0.48 × 0.44 footprint: 21 × 19 px overhead at 1280×720. From overhead: a 0.05 dark ring, a 0.05
cream ring, and a 0.28 × 0.24 seat-colour roof with the sun across its ridge. The roof is the seat colour,
not brown: overhead it is the only face you see.

### Stronghold (`makeStronghold(seat)`)

| Part | `slab(...)` | Top |
|---|---|---|
| Skirt | `0.54, 0.04, 0.54, RIM.dark, 0` | 0.04 |
| Plinth | `0.44, 0.04, 0.44, RIM.light, 0.04` | 0.08 |
| Keep | `0.32, 0.22, 0.32, seat, 0.08` | 0.30 |
| Courtyard | `0.18, 0.012, 0.18, RIM.dark, 0.30` | 0.312 |
| Merlons ×4 | `0.08, 0.09, 0.08, seat, 0.30, ±0.12, ±0.12` | 0.39 |

0.39 tall, 0.54 square: 23 px overhead at 1280×720. It differs from the outpost in silhouette from every
angle: square, not oblong; a flat top with four corner blocks and a dark centre instead of a ridge; taller.
(#312 later replaced the dark courtyard with the seat's mark in its ink, so the centre figure is the mark; see
[seat-marks.md](seat-marks.md).)
The dark courtyard against Pine is 2.85:1, the one pair in this note under 3.0; the four merlons (each 3.4 px
at 1280, with the sun's shadow between them) carry the stronghold-ness for Pine, and the courtyard is a
figure inside the piece, not its edge, which the rims already draw. Cream would be 1.49:1 against Dune, which
is worse, and a seat-coloured courtyard would make the top a plain square, which is what the outpost is.

### Path (`makePath(seat, len)`)

`len` is `Math.hypot(dx, dz) * 0.9`, which is 1.008 on this island.

| Part | `slab(...)` | Top |
|---|---|---|
| Skirt | `0.36, 0.03, len, RIM.dark, 0` | 0.03 |
| Plinth | `0.26, 0.03, len − 0.06, RIM.light, 0.03` | 0.06 |
| Plank | `0.16, 0.04, len − 0.12, seat, 0.06` | 0.10 |

A raised plank, 0.10 above the seam, 15 px wide and 43 px long overhead at 1280×720. The path keeps its
`rotation.y = atan2(dx, dz)` and its position at the edge's midpoint on `edgeTop`.

A path's end runs 0.17–0.22 under the base of the building at its corner (the path starts 0.056 from the
corner, the skirt reaches 0.22–0.27). Nothing is coplanar: the path's tiers top out at 0.03, 0.06, 0.10 and
the building's at 0.04, 0.08, so the plank shows as a seat-coloured stripe crossing the building's cream and
dark rings up to its wall, which is the right picture: the path reaches the door. Where the two hexes along a
seam have different heights (`hexHeight`: ore 0.24, clay 0.20, timber 0.16, wastes 0.12, others 0.15; the top
differs by up to 0.042), the path sits on the higher cap and its skirt overhangs the lower one by that much,
as today's road does.

### `buildPieces`

```ts
const road = makePath(color, Math.hypot(dx, dz) * 0.9);
// ...
const house = v.building.kind === "stronghold" ? makeStronghold(pl?.color ?? "#ccc") : makeOutpost(pl?.color ?? "#ccc");
```

`makeHouse` is deleted. The claimed-dock sail recolour at the end of `buildPieces` is unchanged.

### `palette.ts`

Move `PAINT` from `isle-renderer.ts` into a new `src/lib/scene/palette.ts` and add `RIM` there, so the proof
below checks the live values and not a copy. `isle-renderer.ts` imports both. No other change to `PAINT`.

## Draw calls

| Piece | Meshes today | After |
|---|---|---|
| Path | 1 | 1 |
| Outpost | 2 | 1 |
| Stronghold | 3 | 1 |

After setup (8 outposts, 8 paths) that is 8 fewer meshes per pass, 24 fewer draw calls per frame. At the
rules' maximum (60 paths, 20 outposts, 16 strongholds) it is 52 fewer. Materials drop from one per piece to
one shared. `drawCallsPerFrame` from `ONLY=1920 node scripts/shots.mjs` must not rise over main; it should
fall by about 24 on the trade screen.

## What the screenshots must show

| Shot | Must show |
|---|---|
| `04-turn-1280x720` | All eight setup outposts and all eight paths. Every piece has a visible dark-and-cream rim on its cap, including Ember on clay, Dune on grain, Pine on timber, and whichever piece stands on the beach side of a coastal corner. The seat colour of each piece is the HUD swatch's colour. |
| `09-zoom-1920x1080` | An outpost's gable and a stronghold's four merlons and dark courtyard, told apart without reading the size. A plank's cream and dark steps, and its end running under a building's base. |

Setup has no strongholds. For the stronghold half of the first row, `scripts/shots.mjs` crafts one
(`st.vertices.find(v => v.building?.playerId === "p0").building.kind = "stronghold"; st.seq += 1`) before
`09-zoom`; that is a one-line addition to the shot script and part of the implementation.

Numeric checks a proof can make (`scripts/pieces-prove.mjs`, plain Node with `--import ./server/register.mjs`,
importing `PLAYER_COLORS` from `src/lib/game/types.ts` and `PAINT`, `RIM` from `src/lib/scene/palette.ts`):

1. **Rims against every ground.** For each of the seven grounds (`PAINT[kind][0]` for the six terrains, and
   `#e8d7b0`), `max(contrast(RIM.light, g), contrast(RIM.dark, g)) ≥ 3.0`. Today's values give 4.34 at the
   lowest (ore).
2. **Rims against each other.** `contrast(RIM.light, RIM.dark) ≥ 7`.
3. **Every seat against its rims.** For each of `PLAYER_COLORS`,
   `max(contrast(seat, RIM.light), contrast(seat, RIM.dark)) ≥ 3.0`. Today's lowest is Ember at 4.12.
4. **The proof prints the full table** in the format above, so a future palette change shows its numbers in
   the PR.
5. **Footprints.** `0.54 < HEX_SIZE / 2` (a building never reaches the midpoint of an edge) and the path plank
   `len − 0.12 > 0.8` (the plank is most of the seam).

`npm run client-prove` and `npm run tabs-prove` still pass.

## Files the implementation touches

- `src/lib/scene/isle-renderer.ts` — `buildPieces`, new `makeOutpost`, `makeStronghold`, `makePath`,
  `tint`, `slab`, `piece`, `PIECE_MAT`; delete `makeHouse`; import `PAINT` and `RIM` from `./palette`
- `src/lib/scene/palette.ts` — new: `PAINT` (moved) and `RIM`
- `scripts/pieces-prove.mjs` — new
- `scripts/shots.mjs` — the crafted stronghold before `09-zoom`
- `package.json` — `"pieces-prove": "node --import ./server/register.mjs scripts/pieces-prove.mjs"`

## Out of scope

- The seat colours themselves (`PLAYER_COLORS`, #142). This note makes any four colours readable on any cap;
  it does not re-pick them.
- The legal-spot marks in `buildMarks`, the ghost piece on hover, and the placement animations in the bible's
  motion table.
- The wayfarer (#132), the tokens (#134), the camera and the lights (#135).

## Implementation issue (draft)

```
Implement the two-step piece bases, the gable outpost, the keep, and the plank path

## Deliverable
For #133, per docs/design/pieces.md:
- src/lib/scene/palette.ts (new): PAINT moved from isle-renderer.ts, plus RIM = { light: "#fff6e8",
  dark: "#1c1916" }.
- src/lib/scene/isle-renderer.ts: makeOutpost, makeStronghold, makePath as single merged meshes with
  vertex colours on one shared MeshStandardMaterial; makeHouse deleted; buildPieces uses them. Sizes,
  tiers, and colours exactly as the design's tables.
- scripts/pieces-prove.mjs (new, npm run pieces-prove): the five checks in the design, printing the
  contrast table.
- scripts/shots.mjs: craft one stronghold for p0 before 09-zoom.
Do not start until #133 is on main. The design is the contract. Do not retune the seat colours, the
marks, the wayfarer, the tokens, or the camera.

## Completion test
ONLY=1280 node scripts/shots.mjs writes 04-turn-1280x720.png: all eight setup outposts and eight paths,
each with a visible dark-and-cream rim, Ember on clay, Dune on grain, and Pine on timber included.
ONLY=1920 node scripts/shots.mjs writes 09-zoom-1920x1080.png: a gable outpost and a four-merlon
stronghold told apart by shape; a plank's steps and its end under a building's base. drawCallsPerFrame
is not above main.
npm run pieces-prove → the table and ok. npm run typecheck, npm run client-prove, npm run tabs-prove
pass.

## Depends on
#133

## Parent
#133

## Source
docs/design/pieces.md

Size: S
```
