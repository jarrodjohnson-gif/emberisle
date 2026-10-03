# A wayfarer you can spot across the board (issue #132)

Sources: [docs/research/visual-polish.md](../research/visual-polish.md) §4; `makeWayfarer`, `setBoard`
(`robberTarget`), `tick`, and `buildMarks` in `src/lib/scene/isle-renderer.ts`; `numberToken` (the disc he
stands on); the #128 decision (overhead camera by default in play, the tilted camera behind a toggle);
[docs/design/mobile-camera-touch.md](mobile-camera-touch.md) (the overhead fit this is sized against);
docs/BUILD_BIBLE.md §4.6 and the motion table ("walks hex-to-hex along the island, does not teleport,
600–900 ms"); `src/lib/game/store.ts` `highlights()` (the `robber` phase and the knight both return
`hexes` and nothing else).

## What is wrong today

`makeWayfarer` is a black cone (`#161616`, r 0.1, h 0.38) with a cream sphere (r 0.08) and two eye dots:
0.48 tall, 0.2 wide at the base. `#127` lifted it onto the hex top, but it still stands in the middle of the
hex, which is where the number token is, so the lower 0.065 of the cone is inside the token disc and the
figure's dark base has no outline against a dark cap. On a timber hex (`#2f6b3a`, the darkest cap) a black
cone is 1.5:1 against the ground and the trees close over it. It slides between hexes
(`position.lerp(..., 1 - exp(-dt * 3.2))`): the bible says it walks and does not teleport. Target hexes in
the `robber` phase are a full opaque `hexCap` in ember (`#c45c3e`, emissive 0.55) laid 0.01 above the cap:
every legal hex turns into a flat orange disc and its terrain disappears, and nothing pulses.

## Scale this is sized against

Pieces are judged at the overhead camera, the v1 default in play (#128). With the desktop insets in
`docs/design/mobile-camera-touch.md` the island's 11.2 world units of height fill the 480 px hole at
1280×720: **43 px per world unit**, and 75 px per unit at 1920×1080. The tilted camera today is about 94 px
per unit at the island's centre, so whatever reads overhead reads there too. "Findable at a glance" means a
mark at least 12 px across at 1280×720 that differs from every cap in both lightness and hue.

## The figure

He stands **on the number token**, centred on the hex, feet on the token's face. The token is a cream disc
(`#f4ead6`, r 0.3 today, r 0.34 after #134), so he always has a light halo under him on every terrain,
including timber and ore, without any extra outline mesh. It is also the rule made visible: the number he
covers is the number that pays nobody. The Wayfarer is the one piece whose halo is the board itself.

All heights are relative to the group's origin, which `tick` keeps at the token's face
(`topOf(terrain) + 0.07`: disc centre +0.04, half-thickness 0.025, label +0.03; #134 keeps the face at
+0.07 when it rebuilds the token, so this number does not move).

| Part | Geometry | Position | Material |
|---|---|---|---|
| Cloak | `ConeGeometry(0.15, 0.46, 10)` | y 0.23 | `MeshStandardMaterial` `#2b2420`, roughness 0.75; `castShadow` |
| Hood | `SphereGeometry(0.1, 12, 10)` | y 0.5 | same charcoal `#2b2420` |
| Face | `SphereGeometry(0.07, 10, 8)` | (0, 0.49, 0.045) | `#fff6e8`, roughness 0.5 |
| Eyes ×2 | `SphereGeometry(0.011, 8, 8)` | (±0.024, 0.5, 0.105) | `#111111` |
| Staff | `CylinderGeometry(0.012, 0.012, 0.64, 6)` | (0.17, 0.32, 0.04) | `#4a3220` (the tree-trunk brown) |
| Lantern | `SphereGeometry(0.05, 10, 8)` | (0.17, 0.56, 0.04) | `#ffb347`, `emissive #ff9a2e`, `emissiveIntensity 1.6`, roughness 0.3 |

0.61 tall and 0.30 across the base, up from 0.48 and 0.20. Eight meshes (was 4): +4 draw calls per pass,
+12 per frame against the 2358 `scripts/shots.mjs` measures on main today (2307 in the research, before the
coast and the docks). No `PointLight`: a point light adds a
light loop to every lit shader in the scene, which is #135's budget, and the emissive sphere under ACES tone
mapping at exposure 1.28 already reads as a glowing coal from across the board.

Why it reads on every terrain:

| Looking from | What you see | Contrast (WCAG) |
|---|---|---|
| Overhead | A charcoal disc 0.30 wide (13 px at 1280) on a cream disc 0.6–0.68 wide (26–29 px), with an orange dot | charcoal `#2b2420` on token face `#f4ead6`: 12.8:1 |
| The tilted camera | A dark cone and hood with a pale face, on the cream disc, lantern at head height | the same; face `#fff6e8` on charcoal: 14.2:1 |
| Against a timber cap (worst case for a dark figure) | The cream token under him, not the cap, is what frames him | token face on timber `#2f6b3a`: 5.35:1 |

Charcoal `#2b2420`, not black: with `#161616` the SSAO pass and the sun shadow both disappear into the
cone, so it has no form. Charcoal keeps the shading while staying 10.7:1 against sand and 6.5:1 against the
wastes.

Delete the idle hover (`position.y = target.y + sin(t * 2.4) * 0.025`). Replace it with a breath on the
lantern only: `emissiveIntensity = 1.6 + 0.3 * sin(t * 2.2)`. A figure that bobs in the air is what makes
the current one look sunk: his feet never touch anything.

## Movement: hops along a straight line

`setBoard` already computes `robberTarget`. Keep that, and add a walk the first time it changes:

```ts
private walk: { from: THREE.Vector3; to: THREE.Vector3; start: number; hops: number; dur: number } | null = null;

// in setBoard, after robberTarget is set
if (!this.wayfarer.userData.placed || landChanged) {
  this.wayfarer.position.copy(this.robberTarget); // first board, or a new island: no hop
  this.wayfarer.userData.placed = true;
} else if (this.wayfarer.position.distanceTo(this.robberTarget) > 0.01 && !this.walk) {
  const dist = this.wayfarer.position.distanceTo(this.robberTarget);
  const hops = Math.max(1, Math.round(dist / (HEX_SIZE * Math.SQRT3))); // one hop per hex of distance
  this.walk = { from: this.wayfarer.position.clone(), to: this.robberTarget.clone(), start: this.clock.getElapsed(), hops, dur: Math.min(0.9, 0.3 * hops) };
}
```

`landChanged` is the `this.lastLand !== land` test already in `setBoard`. The walk runs in `tick`:

```ts
if (this.walk) {
  const w = this.walk;
  const u = Math.min(1, (t - w.start) / w.dur);
  const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2; // ease in-out
  this.wayfarer.position.lerpVectors(w.from, w.to, e);
  this.wayfarer.position.y += 0.3 * Math.abs(Math.sin(Math.PI * u * w.hops));
  this.wayfarer.lookAt(w.to.x, this.wayfarer.position.y, w.to.z);
  if (u >= 1) this.walk = null;
}
```

- Adjacent hex (1.94 apart): one hop, 300 ms. Across the island (up to 4 hexes): four hops in 900 ms. That
  is the bible's 600–900 ms for any real move, and it never exceeds 900.
- Each hop is a 0.3-high arc. He faces the hex he is going to.
- If a new target arrives mid-walk (`walk` not null), the walk is left alone and the next `setBoard` after
  it ends starts a new one from wherever he landed. The server never moves him twice in 900 ms.
- The walk needs `HEX_SIZE`, which the file already imports.

`setTitleMode` is unchanged: on the title's demo island he stands on the wastes and does not move.

## Target hexes: a ring that pulses

In `buildMarks`, replace the `hexCap(HEX_SIZE * 0.9, …)` disc with a hexagonal band:

```ts
function hexRing(outer: number, inner: number) {
  const s = hexShape(outer);
  s.holes.push(hexShape(inner));
  const geo = new THREE.ShapeGeometry(s);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

// the hex loop in buildMarks
const ring = new THREE.Mesh(
  hexRing(HEX_SIZE * 0.94, HEX_SIZE * 0.76),
  new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xffb347, emissiveIntensity: 0.6, roughness: 0.6 }),
);
ring.position.set(x, topOf(h.terrain) + 0.012, z);
ring.userData = { kind: "hex", id: h.id };
```

- The band is 0.20 wide (HEX_SIZE × 0.18): 9 px at 1280 overhead, inset 0.07 from the tile's edge so two
  neighbouring targets show two rings, not one blob.
- The lantern's orange as both colour and emissive (cream albedo washed out to the slab rims under ACES), so the glow is the wayfarer's own colour, not a seat's
  colour (today's ember `#c45c3e` is Ember's seat colour, which reads as "Ember's hexes").
- The terrain, the token, and the trees inside the band stay visible, so the player can pick a target by its
  number. That is the whole point of the move.
- Pulse in `tick`: `for (const m of this.marks.children) if (m.userData.kind === "hex") (m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + 0.35 * (0.5 + 0.5 * Math.sin(t * 4));`
  One cycle every 1.6 s. Vertex and edge marks do not pulse; they are not this issue.
- Picking is unchanged. The ring is pickable with the hex id, and so is the tile under it, so a click
  anywhere on the hex, band or middle, lands on the hex.
- The store already excludes the wayfarer's own hex and (for the robber phase) the wastes; the knight path
  (`buildMode === "knight"`) returns every other hex. Both come through this same loop, so a played knight
  glows the same way.

Draw calls: one mesh per target hex, as today. Up to 18 rings.

## Draw calls

| Change | Per pass | Per frame (×3) |
|---|---|---|
| Figure 4 → 8 meshes | +4 | +12 |
| Target ring instead of cap | 0 | 0 |

Budget: `drawCallsPerFrame` from `ONLY=1920 node scripts/shots.mjs` rises by at most 15 over the number
on main before the change.

## What the screenshots must show

| Shot | Must show |
|---|---|
| `07-wayfarer-1280x720` | Every legal target hex has an orange band (`#ffb347`) and its terrain, token, and props are still visible inside it. The wayfarer's own hex and the wastes have no band. The figure is the one dark shape with an orange lantern on a cream disc. |
| `04-turn-1280x720` | The wayfarer stands on his token with his feet on its face, not sunk in the tile and not floating. The token's rim is visible around his base. |
| `09-zoom-1920x1080` | Cloak, hood, pale face, staff, and lantern are all distinct. |

Numeric checks a proof can make (`scripts/wayfarer-prove.mjs`, headless Chromium like `client-prove`, driving
the store through `window.__emberisle` and reading `window.__isle`):

1. **On the token.** After setup, `wayfarer.position.y − (topOf(robberHex.terrain) + 0.07)` is within
   ±0.001 when no walk is running, and `position.x/z` equal `worldOfHex(robberHex)` within 0.001.
2. **Hops, not a slide.** Craft `robberHex` to a hex two hexes away (`st.seq += 1`), then sample
   `wayfarer.position.y` every 50 ms for 700 ms: the y above the destination face must rise above 0.2 at
   least twice (two hops), and after 900 ms the position must be on the new token within 0.001.
3. **Rings on every legal hex.** In the `robber` phase, the number of `marks.children` with
   `userData.kind === "hex"` equals `highlights().hexes.length`, and none has the id of `robberHex`.
4. **Every ring stays above the cap.** For each ring, `position.y − topOf(terrain)` is 0.012.
5. **Contrast.** The constants `#2b2420` against `#f4ead6` (token face, and `#f4ead6` stays #134's face
   colour) give a WCAG ratio ≥ 10. A pure-arithmetic assert on the hex values, the same function
   `docs/design/pieces.md` uses.

`npm run client-prove` and `npm run tabs-prove` still pass.

## Files the implementation touches

- `src/lib/scene/isle-renderer.ts` — `makeWayfarer`, `setBoard` (the walk start), `tick` (the walk, the
  lantern breath, the ring pulse, delete the hover), `buildMarks` (the hex loop), new `hexRing`.

## Out of scope

- The token the figure stands on: its size, face, and rim (#134). This note depends on its face staying at
  `topOf + 0.07`, and on nothing else.
- Which hexes are legal (`rules.ts`, `store.ts`). The client never decides that.
- The camera and the lights (#135). A `PointLight` for the lantern is a #135 question if it ever wants one.
- The "Take from whom?" picker (built, #104).

## Implementation issue (draft)

```
Implement the wayfarer figure, the hop, and the target rings

## Deliverable
For #132, in the one file docs/design/wayfarer.md names: src/lib/scene/isle-renderer.ts.
- makeWayfarer: the charcoal cloak and hood, pale face, staff, and emissive lantern, 0.61 tall, feet at
  the token face (topOf + 0.07).
- setBoard and tick: the straight-line hop (one 0.3-high arc per hex of distance, 300 ms per hop, 900 ms
  cap), snap on the first board or a new island, no idle hover, lantern breath.
- buildMarks: the 0.20-wide hexagonal band (orange `#ffb347`, emissive #ffb347) instead of the full cap, pulsing
  0.5–0.85 every 1.6 s.
- scripts/wayfarer-prove.mjs with the five checks in the design.
Do not start until #132 is on main. The design is the contract. Do not retune the token, the camera, or
the lights.

## Completion test
ONLY=1280 node scripts/shots.mjs writes 07-wayfarer-1280x720.png (every legal hex ringed, terrain and
token visible inside, the figure the one dark shape with an orange lantern on a cream disc) and
04-turn-1280x720.png (feet on the token face, rim visible around the base).
ONLY=1920 node scripts/shots.mjs: 09-zoom-1920x1080.png shows cloak, hood, face, staff, and lantern as
separate parts, and drawCallsPerFrame is at most 15 above main.
node scripts/wayfarer-prove.mjs → ok. npm run client-prove and npm run tabs-prove pass.

## Depends on
#132

## Parent
#132

## Source
docs/design/wayfarer.md

Size: S
```
