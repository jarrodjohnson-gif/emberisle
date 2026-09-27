# Boats and docks that show their trade rate (issue #131)

Sources: [docs/research/visual-polish.md](../research/visual-polish.md) §3; the harbor loop and `makeBoat` in
`src/lib/scene/isle-renderer.ts`; `docs/design/ocean.md` (the coast this seats onto); `docs/HARBORS.md`.

## What is wrong today

The harbor loop in `buildLand` places a pier along the vertex's direction from the world origin
(`v.x / len, v.z / len`), not along the coast's own outward miter from `docs/design/ocean.md`. On this
convex island the two are close but not equal, and the pier's length (0.72, starting at the raw vertex) runs
well past the foam's outer edge (0.42) into open water — the "stick out through the rim" from #124. The boat
is a `0.16 × 0.07 × 0.4` box hull, a stick mast, and a flat `0.2 × 0.26` cream `PlaneGeometry` sail, about
15 px on screen at 1280×720. Nothing on the board shows a dock's rate (2:1 on one resource, 3:1 on any); a
new player has no way to tell what a given dock does without opening a rules sheet. Claimed docks already
recolour the sail via the vertex's `building.playerId` (`buildPieces`); that part stays.

## Reuse the coast's own miter, not a re-derived direction

`docs/design/ocean.md`'s `coastLoop()` already computes, once per island shape, the outward miter `(mx, mz)`
at every coastal vertex — and every harbor sits on a coastal vertex (`README`: "9 docks on the coast, each
on two corners"). Add the vertex id to that function's return so the harbor loop can look it up instead of
re-deriving an approximate outward direction:

```ts
// coastLoop(), in the final .map — add id (everything else in ocean.md's spec is unchanged)
return { id, x: p.x, z: p.z, mx: mx * k, mz: mz * k };
```

Store it once, in the constructor, next to `this.water` and `this.foam`:

```ts
private coastMiter = new Map<string, { mx: number; mz: number }>();
// after `const coast = coastLoop();`
for (const c of coast) this.coastMiter.set(c.id, { mx: c.mx, mz: c.mz });
```

## Jetty

A short plank from the beach's outer edge to just past the foam, not a long one from the raw vertex:

```ts
for (const v of state.vertices) {
  if (!v.harbor) continue;
  const m = this.coastMiter.get(v.id);
  if (!m) continue; // every harbor is coastal; a miss here is a bug in coastLoop, not a fallback case
  const jettyStart = 0.22; // the beach's own outer offset (docs/design/ocean.md)
  const jettyLen = 0.24; // ends at 0.46: just past the foam's 0.42 outer offset
  const px = v.x + m.mx * (jettyStart + jettyLen / 2);
  const pz = v.z + m.mz * (jettyStart + jettyLen / 2);
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.05, jettyLen),
    new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.82 }),
  );
  pier.position.set(px, 0.1, pz);
  pier.lookAt(v.x + m.mx, 0.1, v.z + m.mz);
  pier.castShadow = true;
  this.land.add(pier);

  const boat = makeBoat(v.harbor);
  const bx = v.x + m.mx * (jettyStart + jettyLen + 0.16);
  const bz = v.z + m.mz * (jettyStart + jettyLen + 0.16);
  boat.position.set(bx, 0.08, bz);
  boat.lookAt(v.x, 0.08, v.z);
  boat.userData.vid = v.id;
  this.living.add(boat);
  this.boats.push(boat);
}
```

Width drops from 0.2 to 0.16 (a plank, not a road) and length from 0.72 to 0.24: it now starts where the
sand ends and stops just past the foam, instead of spanning both. The boat sits a further 0.16 out, clear of
the foam's breathing opacity, facing the shore exactly as it does today.

## A real hull

Keep the primitive, "chunky wooden bit" style the rest of the island uses (`makeHouse`, `hexShape`) instead
of a smooth boat model. Replace the box hull with an extruded profile — a shape, not a smooth lathe — for a
canoe-like bow without a new asset:

```ts
function hullShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.24); // stern, flat
  s.lineTo(0.09, -0.2);
  s.lineTo(0.09, 0.1);
  s.lineTo(0, 0.26); // bow, pointed
  s.lineTo(-0.09, 0.1);
  s.lineTo(-0.09, -0.2);
  s.closePath();
  return s;
}
```

Extrude it flat (depth = draft) and lay it on its side, matching how `makeHexTile` already extrudes
`hexShape` for the tile caps:

```ts
const hull = new THREE.Mesh(
  new THREE.ExtrudeGeometry(hullShape(), { depth: 0.09, bevelEnabled: false }),
  new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.7 }),
);
hull.rotation.x = -Math.PI / 2;
hull.position.y = 0.045;
hull.castShadow = true;
g.add(hull);
```

This is the same footprint budget as today's box (one mesh, no new material, no texture) — it changes only
the geometry, so it does not move the draw-call count in `docs/design/ocean.md`'s ledger.

## The sail shows the dock's rate

The sail stays a `PlaneGeometry`, sized up from `0.2 × 0.26` to `0.3 × 0.36` so the rate reads at the
09-zoom distance (today's 15 px at 1280 is the problem this issue names). Bake one small canvas texture per
`HarborKind` (6 total: `any` and the 5 resources) the first time any boat needs it, cached by kind so the
canvas only runs once per kind per session — not per boat, not per frame:

```ts
const sailTextures = new Map<HarborKind, THREE.CanvasTexture>();

function sailTexture(kind: HarborKind): THREE.CanvasTexture {
  let tex = sailTextures.get(kind);
  if (tex) return tex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, 64, 64);
  if (kind !== "any") {
    ctx.fillStyle = PAINT[kind][0]; // the same terrain colour used on the hex sides
    ctx.fillRect(0, 44, 64, 20); // a resource-coloured band along the sail's foot
  }
  ctx.fillStyle = "#1c1915";
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(kind === "any" ? "3:1" : "2:1", 32, kind === "any" ? 32 : 22);
  tex = new THREE.CanvasTexture(c);
  sailTextures.set(kind, tex);
  return tex;
}
```

`makeBoat(kind: HarborKind)` sets `map: sailTexture(kind)` on the sail's `MeshStandardMaterial`, alongside
its existing `color`. `buildPieces`'s claimed-dock recolour is unchanged — `sail.material.color.set(...)`
multiplies over the map, so a claimed dock's sail tints to the owner's colour with the rate number still
legible in dark ink on top of it, and an unclaimed one stays the current cream `#f4efe4`. Boats are rebuilt
in `buildLand` on every `setBoard`, but `sailTextures` is a module-level cache, so a game with all nine docks
draws at most six canvases total, not one per boat per game.

## What the screenshots must show

| Shot | Must show |
|---|---|
| `03-setup-1280x720` | All nine docks: a short plank from the sand to just past the foam, no pier crossing open sand, no pier standing in the water disconnected from any beach. |
| `09-zoom-1920x1080` | Every sail's rate (`2:1` or `3:1`) legible at the closest zoom the controls allow. A resource-kind dock shows its colour band; an `any` dock does not. |

`npm run client-prove` and `npm run tabs-prove` still pass. Draw calls must not rise by more than 20 over
`docs/design/ocean.md`'s ledger (one hull mesh and one sail mesh per boat, same as today; the only addition
is a texture, which does not add a draw call).

## Files the implementation touches

- `src/lib/scene/isle-renderer.ts` — `coastLoop`'s returned id, `coastMiter`, the jetty/boat placement in
  `buildLand`, `makeBoat(kind)`, `hullShape`, `sailTexture`
- No server or store changes: `HarborKind` and the dock deal already exist in `board.ts`/`types.ts`

## Out of scope

- The wayfarer figure and its target rings (#132)
- Path, outpost, and stronghold shapes (#133)
- The camera and lighting budget this is measured under (#135)
