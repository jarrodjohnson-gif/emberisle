# Fortunes visual polish — 2026-11-06

This is Astra's best completed pass within the accepted geometry and existing visual language. The previous pass solved geometry; it was not a finished visual pass. This version is cleaner and more deliberate, but I would not call it finished-game quality. It remains a proposal for Jarrod's review.

The repeated outlined form boxes are now quiet rows with aligned counts, a restrained selected edge and a check. Type uses the game's system font and existing 20px title / 15px body / 12px caption scale. Close keeps a 44px target without a permanent box. The fixed action region uses actual selected goods, the existing goods symbols, visible names, and a strong legal Play button. Unavailable Play remains visually unavailable. No invented fortune illustrations or decorative symbols were added.

The second visual inspection removed the empty caption gap, restored visible goods names inside the 44px targets, and aligned the small-phone scroll position to complete rows. The selected name remains in the footer because its row can scroll out of view. It is a useful repetition, although landscape makes that repetition particularly conspicuous.

## Four pictures

All four show Plenty selected with Wood and Grain picked. The selected goods and enabled Play are actual mock state, not screenshot-only styling. The hero images use pointer presentation; keyboard focus is shown separately.

| Picture | Unchanged sheet x / y / width / height | List height | Goods target |
|---|---|---:|---:|
| [390×844](390x844-proposal.png) | 16 / 250 / 358 / 560 | 325px | 60×44px |
| [844×390](844x390-proposal.png) | 44 / 64 / 320 / 305 | 78px | 54×44px |
| [1280×720](1280x720-proposal.png) | 416 / 126 / 448 / 560 | 325px | 78×44px |
| [320×568](320x568-proposal.png) | 16 / 64 / 288 / 470 | 235px | 46×44px |

The 390px and desktop lists start at the first row. Small phone is deliberately scrolled to Path; landscape is scrolled to Plenty. DOM order remains Wayfarer, Path, Plenty, Monopoly, Points. These scroll examples are not a proposal to reorder the list or automatically scroll on opening. The compact action footer is 149px high, with a 44px Play target. Its position remains fixed as the list scrolls.

Outer bounds match the previous redraw exactly. Top clearance remains 8px on small phone and landscape, 194px on portrait and 70px below the desktop header. Landscape stays x44–364 in the left column. Safe-area examples remain 44/0/34/0 portrait and desktop stress; 0/44/21/44 landscape, applied to the drawing only.

## What remains weak

- Fortune identities are still text-led. The cleaner list is readable but does not provide distinctive card art. Adding an art language is a separate owner decision; random decorative icons would make this worse.
- Landscape has room for only one whole row. Its scroll affordance is weak, even though scrolling and keyboard navigation work. A native thin scrollbar is not sufficient discovery on every device. This needs owner review before calling the drawing final.
- Small phone still covers most of the island. This is the accepted geometry constraint for this pass, not proof of the stationary dock's island-height target.
- The runtime underneath is a crafted local fixture. Desktop's cramped first-seat inventory text and the existing dock/banner remain untouched. They detract from the complete frame; these drawings do not claim to polish those other owners' surfaces.

## Edges, goods and motion

Sheet radius remains 20px; rows and controls use 8px. Unselected rows use a quiet lower separator instead of a repeated enclosing border. Selection uses a 3px inset ink edge, pale mist, an enclosing hairline and a check; color is not its only signal. A subtle contact/depth shadow keeps the white sheet distinct from the board.

Goods paths are copied directly from `src/components/game/ResourceSymbols.tsx` into this standalone drawing. Wood, brick and ore marks retain their existing resource hues; wool and grain use dark readable marks on pale resource-tinted selection grounds. These local drawing tints do not change runtime resource tokens. Names and accessible names remain present, selected counts are explicit, and empty-bank Brick is unavailable. No hand-card style is changed.

The entrance reuses the game's existing hand-in timing: 220ms, opacity 0→1 and translateY 8px→0, cubic-bezier(.22,1,.36,1). It does not bounce or glow. The final layout is reserved before motion. Selection fill settles over 120ms; pressing legal Play moves 1px without changing its hitbox layout. Reduced motion removes the entrance, row transition and pressed translation. Dismissal remains immediate; no new sound is specified.

Actual paused animation frames: [0ms](motion-0ms.png), [110ms](motion-110ms.png), [220ms](motion-220ms.png). Browser samples at those times are in the measurements: opacity 0 / .961383 / 1 and vertical translation 8 / .30894 / 0px. These are synthetic mock frames, not evidence of production motion performance.

## Validation and provenance

[measurements.json](measurements.json) contains 96 records: four sizes × two safe-area modes × twelve states. Checks cover sheet bounds, unchanged baseline geometry, left landscape placement, normal order, 44px goods/Play/Close targets, no page overflow, and fixed Play after scrolling. Actual runtime header/seat-strip rectangles from the underlay capture are in [assessment.json](assessment.json). The prior redraw's seat-card measurements remain preserved; this pass did not move those surfaces.

Eight interaction groups passed: selection does not dispatch; bank depletion drops an unaffordable pick; refusal stays open and permits explicit retry; double activation dispatches once and board cancellation unlocks; reopen resets selection, Tab wraps both ways and Escape restores focus; off-turn offer preserves sheet/selection/focus with zero dispatch and one dialog; impossible own-turn arrival is rejected; reduced motion has no entrance animation. [Keyboard picture](390x844-keyboard-focus.png) records Close focused with a visible 2px outline.

State pictures: [empty](state-empty.png), [unselected](state-unselected.png), [off-turn](state-unplayable.png), [just bought](state-just-bought.png), [already played](state-already-played.png), [points](state-points.png). The ready hero provides selected/long-list state. The full matrix also covers before-roll, no-path, empty-bank and muster.

One initial capture utility check failed because it read the old JSON rectangle at `proposal` rather than `proposal.tray`. The utility path was corrected; the equality assertion was retained. The first focus picture did not visibly demonstrate focus, so it was replaced with an explicitly measured keyboard focus capture. Neither issue was a production test failure. No production proof was run, edited or weakened.

Underlay: detached main `f29c36fbfe6bf38f0101e64fbfd6b8c69b170344`, matching the previous redraw. Chromium 153.0.8010.12. Four-seat local fixture; 17-card mock deck count is illustrative. Random board deal differs from the prior pictures. New raw runtime PNGs are included unchanged; final pictures place the HTML drawing over those captures. This is not integrated runtime behavior. Capture utilities remained temporary under `/tmp`; `index.html` is the reproducible interactive drawing.

All 23 previous PNG/JSON/log/checksum artifacts are byte-identical to branch base `def5444e7e66a34d08e2c2226efba321bf3504f4`; see [preserved-evidence.json](preserved-evidence.json). The old failed composites and all earlier measurements remain intact. New artifact hashes are in `SHA256SUMS`.

## Gates

Direction acceptance is not polish acceptance. Jarrod still needs to accept these pictures, including the disclosed landscape and text-led limitations. Independent review is also outstanding. Runtime remains prohibited by the task and blocked on dock #1144/#1101 and shared Hud.tsx release. The off-turn policy is settled: sheet stays open, offer stays in the dock, no extra modal or waiting line. No new decision is requested for that policy.

The publish-then-stop instruction was lifted by desk comment6693803418. Continue the existing #1274 child work within drawings/docs scope; do not treat this publication as completion of the whole audit.
