# glTF asset pipeline (epic #599, step E1)

The island terrain is code-built primitives today. The goal is real sculpted glTF assets at "next-gen Catan tile" polish. This
step builds only the pipeline and a placeholder kit. It does not touch `isle-renderer.ts` or any scene file; hooking a kit
into the terrain is a later step.

Files: `src/lib/scene/assets.ts` (loader), `public/kits/placeholder/kit.glb` (made by `scripts/make-placeholder-kit.mjs`),
`public/draco/` (Draco decoder, copied from `three/examples/jsm/libs/draco/`, served locally, no CDN),
`scripts/assets-prove.mjs` with `scripts/assets-harness.html`.

## The kit contract

A kit is one `.glb`. Each part is one named mesh at the top level of the scene (node transforms are baked on load).

| Part | Count | Budget |
|---|---|---|
| `tile_forest`, `tile_pasture`, `tile_grain`, `tile_clay`, `tile_ore`, `tile_waste` | one each | at most 3,000 triangles |
| `prop_tree_<n>`, `prop_rock_<n>`, `dock_sign` | at least one tree, one rock, one sign | at most 800 triangles |
| whole kit | | at most 40,000 triangles, at most 6 materials, no texture over 1024 px |

- **Units.** A tile is 1 unit flat-to-flat. The island's hex pitch is `HEX_SIZE * SQRT3` (1.12 * 1.732 = 1.94 world units),
  exported as `KIT_TO_WORLD`; scale instances by it. Props share the mean tile scale, so author them against the tile.
- **Orientation.** Y up. Tiles are pointy-top, as the game's hexes are (corners at -30, 30, 90... degrees; the flats face +-x), so
  flat-to-flat is the x extent. The loader recentres each part on its footprint (x, z) and stands it on y = 0, then scales
  tiles one by one to exactly 1 in x.
- **Materials.** The loader converts everything to `MeshStandardMaterial` and keeps vertex colours (`vertexColors` is set when the
  mesh has a `COLOR_0`). Prefer one shared material per kit so every part is one instanced draw call. Textures are
  downscaled to 1024 px on load if larger; do not ship them larger. Attributes other than position, normal, uv and colour are
  dropped.
- **Instancing.** `loadKit(url)` returns `{ parts: Map<name, { geometry, material }> }`, ready for `new THREE.InstancedMesh(geometry, material, n)`.
  `partStats(kit)` returns triangles, draw calls (one per part), material count and texture bytes.
- **Compression.** The loader reads Draco and meshopt kits. The placeholder is uncompressed (about 58 kB) because
  `@gltf-transform` is not a dependency and its tree (sharp) is not worth it for 58 kB. A real kit should be compressed with
  `npx gltf-transform optimize kit.glb out.glb --compress draco` (or `meshopt`).
- **Bundle.** Import `assets.ts` with `import()`. It carries the glTF, Draco and meshopt loaders and must stay out of the index
  chunk (`scripts/size-prove.mjs` keeps that honest).

## Replacing the placeholder

1. Author or acquire the kit to the contract above (part names are exact).
2. Compress it, put it at `public/kits/<name>/kit.glb`, and load it with `loadKit("/kits/<name>/kit.glb")`.
3. Check it with the harness: `http://127.0.0.1:<port>/scripts/assets-harness.html?kit=/kits/<name>/kit.glb` under `npm run dev`,
   or point `assets-prove` at it. Tiles that are not exactly 1 wide, or parts over budget, fail the proof.

## Where the art comes from (open choices for the owner)

Not chosen yet. Licence notes are a summary, not legal advice; read the actual licence of any specific asset.

1. **Owned or licensed models** (a stock-model marketplace, or a freelancer's one-off models). Check that the licence allows
   redistribution inside a shipped web game (some "royalty-free" licences forbid embedding source files where a user can
   download them, and a glTF in `public/` is downloadable). CC0 is the safest; CC-BY needs credit in the game.
2. **A purchased pack.** Same redistribution question, plus whether the licence is per seat and whether it covers a game that
   is free to play. Packs are consistent in style, which is the main reason to prefer one; budgets are usually met after a
   decimate pass.
3. **AI-generated tiles.** Fast and cheap to iterate, but the output licence is the tool's terms and not settled law:
   the owner of the image or mesh may not be copyrightable, and some tools restrict commercial use by plan. Meshes need
   retopology to hit the budgets and a consistent scale and orientation pass.

A commission (an artist builds the whole kit to this contract) is the fourth option; it costs most and gives the clearest rights.
