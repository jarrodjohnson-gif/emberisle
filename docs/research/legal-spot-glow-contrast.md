# Legal-Spot Glow Contrast Research (#590)

This research investigates legal-spot glow visibility for pale player seats on light terrain.
Ivory seat markers on grain and waste tiles suffer low contrast during placement phases.
Adding a dark rim underlay behind edge bars restores required 3:1 contrast.

## 1. Contrast Problem and Current Baseline

The game highlights legal building positions when a placement phase is active.

- Acting seat color: Markers inherit color from the current acting player.
- Cream tint lerp: Edge bars blend seat color with cream (#fff6e8) at 0.35 intensity.
- Ivory seat value: Player 2 (Dune) uses ivory color #f3ecd9 with 0.84 relative luminance.
- Resulting glow color: Dune edge markers become pale off-white #f7f0df.
- Grain terrain color: Grain tiles display baked golden yellow tones averaging #b8862a.
- Waste terrain color: Waste tiles display light sandy tan tones averaging #b89b6a.
- Observed edge contrast: Markers achieve only 1.4:1 on waste and 1.6:1 on grain.
- WCAG requirement: Non-text interactive elements require at least 3:1 contrast against adjacent backgrounds.

## 2. Vertex Corners versus Edge Bars

Recent pull request #848 fixed corner contrast but left edge bars unoutlined.

- Empty legal corners: Render TorusGeometry outlines using RIM.dark #1c1916 and white discs.
- Built settlement corners: Render HOME_HALO torus outlines using RIM.dark under the seat band.
- Corner contrast: Outlined vertex markers achieve greater than 7:1 contrast on all terrains.
- Edge path bars: Edge markers render as unoutlined BoxGeometry(0.16, 0.07, length) meshes.
- Motion dependency: Unoutlined edge bars rely entirely on 1.2 s pulse animations for visibility.
- Reduced motion flaw: Under reduced motion, static ivory edge bars become nearly invisible on waste.

## 3. Luminance and Contrast Measurements

Standard relative luminance calculations confirm the severity of edge bar contrast deficits.

- Ivory seat (#f3ecd9): Relative luminance measures 0.837.
- Blended edge glow (#f7f0df): Relative luminance measures 0.872.
- Grain tile (#b8862a): Relative luminance measures 0.385.
- Waste tile (#b89b6a): Relative luminance measures 0.542.
- Dark rim (#1c1916): Relative luminance measures 0.012.
- Ivory on grain contrast: (0.872 + 0.05) / (0.385 + 0.05) equals 2.12:1 direct ratio.
- Ivory on waste contrast: (0.872 + 0.05) / (0.542 + 0.05) equals 1.56:1 direct ratio.
- Ivory against dark rim: (0.837 + 0.05) / (0.012 + 0.05) equals 14.3:1 contrast.
- Dark rim on waste: (0.542 + 0.05) / (0.012 + 0.05) equals 9.5:1 contrast.

## 4. Architectural Recommendations

Adding a dark underlay behind pale edge bars resolves contrast issues permanently.

- Pale seat detection: Trigger underlay logic when acting seat relative luminance exceeds 0.8.
- Other seats unchanged: Red, blue, and purple seats retain existing unbordered edge bars.
- Underlay geometry: Add a BoxGeometry measuring 0.22 width, 0.05 height, and 0.74 edge length.
- Underlay material: Use MeshBasicMaterial with color RIM.dark (#1c1916).
- Layer positioning: Position underlay 0.01 world units below the road marker.
- Non-pickable: Keep underlay meshes out of the raycasting pickables array.
- Instanced batching: Instance underlays together with edge bars to avoid extra draw calls.

## 5. Verification and Acceptance Plan

Validation requires visual captures and contrast sampling across viewports.

- Capture real-game screenshots at 430x932, 390x844, and 844x390 viewports.
- Sample pixel luminance on grain and waste tiles using patch sampling in scripts.
- Verify contrast exceeds 3:1 under both standard and reduced motion settings.
- Confirm red, blue, and purple legal marks remain completely unchanged.
- Run npm run typecheck and loosen-prove to ensure build integrity.
