# Polished cartoon terrain specification

- status: design
- issue: #599
- owner-decision: 2026-10-14
- author: builder-size

## Vision

This specification defines next-generation cartoon terrain tiles for Emberisle.
It references the sculpted 3D miniature style of Taylor S. Ellis.
Tiles appear as polished, tactile miniatures.
Each tile represents a distinct sculpted diorama.
Tiles use cartoon-clean geometry and soft lighting.
Water, camera, pieces, and HUD remain unchanged.

## 2026-10-14 Owner Decision

The owner rejected quick placeholder renders.
The target quality requires polished, sculpted assets.
Assets must drop in as real 3D assets via glTF.
They replace procedural code-built boxes.
Asset sources include licensed models, purchased packs, or curated AI models.
Phase E1 establishes the glTF asset pipeline.
The pipeline uses Draco compression and strict triangle budgets.

## Tile Foundation and Strata

Every tile shares a standard geometric foundation.

- **Hex bounds**: Radius 1.0 unit across vertices.
- **Side height**: 0.18 units of raised edge.
- **Bevel**: 0.03 unit bevel along top rims.
- **Strata bands**: Two visible horizontal layers representing soil over rock.
- **Coastal lip**: Shoreline sides display a pale sand lip into water.
- **Clearance mask**: Ground stays flat at `topOf` within 0.40 units of center.
- **Rim mask**: Ground stays flat at `topOf` within 0.07 units of borders.

## Per-Terrain Sculpted Features

### 1. Clay (Hills)
- Two to three stepped red-rock mesas with flat tops.
- Terraced cliffs with lighter top surfaces and darker rust sides.
- Scattered low-poly boulders resting near cliff bases.
- Dark rust-red soil along low ground.
- Triangle budget: maximum 900 triangles.

### 2. Ore (Mountains)
- Cluster of five to eight tall faceted grey pillars.
- Dusting of lighter rock and snow across high summits.
- Rocky scree and tumbled stones around the base.
- Timbered mine adit entrance framed in dark brown beams.
- Narrow cart tracks emerging from the adit for mine carts.
- Triangle budget: maximum 1,200 triangles.

### 3. Forest (Timber)
- Dense pine stand in two distinct heights filling 70 percent of hex.
- Multi-tiered conical canopies with dark undersides.
- Cleared lumber landing with timber stacks and logs.
- Standing spots for worker figures.
- Triangle budget: maximum 1,400 triangles using instanced trees.

### 4. Grain (Wheat)
- Four to six rectangular crop patches with raised furrow rows.
- Deep golden-yellow crop ridges with warm amber soil.
- Traditional red barn with grey gambrel roof.
- White cylindrical grain silo next to the barn.
- Winding dirt track connecting barn to field borders.
- Triangle budget: maximum 800 triangles.

### 5. Pasture (Wool)
- Rolling green mounds with gentle undulations.
- Wooden two-rail split post fence along one outer edge.
- Carved water trough near the grazing line.
- Scattered sheep figures grazing on outer rings.
- Triangle budget: maximum 600 triangles.

### 6. Waste (Desert)
- Cracked pale sand earth with shallow sunken plates.
- Weathered dead tree trunk without foliage.
- Two bleached rock outcrops.
- Wayfarer standing circle at hex center kept completely flat.
- Triangle budget: maximum 400 triangles.

## Board Fit and Placement Contracts

All visual features must obey strict gameplay clearance rules.

- **Center clearance**: Center circle radius 0.40 units remains completely clear for number tokens.
- **Token disc**: Number tokens sit flat at `topOf` without clipping terrain props.
- **Corner spots**: Vertices stay clear within 0.12 units for settlements and cities.
- **Edge spots**: Path midpoints stay clear within 0.08 units for road pieces.
- **Dock piers**: Coastal dock structures connect cleanly to sand lips.
- **Visibility rule**: Props shrinking rule clears lines of sight to numerals.
- **Wayfarer spot**: The desert center stays level for the wayfarer miniature.

## Technical Budgets and Constraints

- **Whole island geometry**: Under 45,000 triangles total across nineteen hexes.
- **Draw calls**: Main terrain pass under 40 draw calls.
- **Texture format**: Shared vertex colors or single small atlas texture.
- **Asset loader**: Three.js GLTFLoader equipped with KTX2 and Draco decoding.
- **Bundle size**: glTF parser components load inside dynamic IslandCanvas chunk.
- **Frame performance**: Scene maintains 60 fps during active gestures.
- **Idle throttle**: Engine throttles to 12 fps during idle periods.
- **Reduced motion**: Dynamic props remain completely stationary under reduced motion.

## Delivery Phases

### Phase E1: glTF Pipeline and Base Geometry
- Build glTF loader pipeline with Draco compression.
- Create automated geometry budget verification proof.
- Implement standardized hex base with strata edge and bevel.
- Verify `board-look-prove` and `tokens-prove` remain green.

### Phase E2: High-Relief Terrain (Clay, Ore, Forest, Grain)
- Integrate Clay stepped mesas and Ore crystal pillars.
- Integrate Forest pine clusters and Grain field barn.
- Verify number token clearances and settlement placements.
- Validate draw-call batching through InstancedMesh.

### Phase E3: Low-Relief Terrain and Lighting Pass
- Integrate Pasture rolling hills and Waste cracked plates.
- Align key lighting and warm soft shadows with diorama angle.
- Run complete proof suite across mobile and desktop viewports.
- Deliver visual comparison against Taylor S. Ellis reference.
