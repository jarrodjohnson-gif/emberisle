# Rendered path-boundary evidence (#590)

The [desk’s confirmed scope](https://github.com/jarrodjohnson-gif/emberisle/issues/590#issuecomment-6848295949) covers ivory legal path bars.
It adds a non-pickable `RIM.dark` underlay and preserves #830 corner rings and outpost/stronghold halos.
The builder chooses the dimensions. This note prescribes no geometry or additional design.

## Reproducible evidence

[Rendered evidence at d98661b4](https://github.com/jarrodjohnson-gif/emberisle/tree/d98661b4b039bdf584c1d4e473931ed7651bff0e/docs/proofs/590) records the captures and measurements.
The validated renderer and proof source is commit `01a731340b19b6728ebadc6c2e08536df988a7a1`.
The clean-reviewed evidence revision is `d98661b4b039bdf584c1d4e473931ed7651bff0e`; its renderer and proof are identical.

Run `PROOF_ARTIFACT_DIR=<output-directory> npm run legal-edge-prove` from that checkout, under the team browser lock.
The [before/after report](https://github.com/jarrodjohnson-gif/emberisle/blob/d98661b4b039bdf584c1d4e473931ed7651bff0e/docs/proofs/590/README.md) names every viewport and motion case.
It links full-size real-game PNGs at 430×932, 390×844 and 844×390, with per-case contrast ranges.

The completed run covers six ivory captures and three other-seat controls, using real rules and seed 590.
Native touches select and confirm an outpost and path. The proof preserves bar dimensions, legal targets and other-seat styling.
The ivory captures measure grain and waste at the overhead camera, with normal and reduced motion.

## What the measurements establish

Five fixed positions sample one CSS pixel beyond each projected bar silhouette, including the bar’s height.
Terrain samples sit four CSS pixels beyond that silhouette. The proof compares median linear-sRGB luminances using the WCAG ratio.
The required ratio remains 3:1. The measured ivory boundary ratios range from [7.327:1 to 8.646:1](https://github.com/jarrodjohnson-gif/emberisle/blob/d98661b4b039bdf584c1d4e473931ed7651bff0e/docs/proofs/590/README.md).
The run completed all nine cases with zero console errors and no failed checks.

A palette calculation measures input colours. These figures measure rendered boundary pixels under one camera and seed.
The unchanged-main baseline, `a7122815c489d2fd5dfd660acc1d03a82f739b01`, has no underlay and produced [42 expected failed checks](https://github.com/jarrodjohnson-gif/emberisle/blob/d98661b4b039bdf584c1d4e473931ed7651bff0e/docs/proofs/590/README.md).
Those baseline samples mark the absent boundary; they do not measure the pale bar’s fill contrast.

The report retains earlier failures and their limits. A passing retry does not establish a screenshot timeout’s cause.
These captures support the owner’s appearance review; they do not establish owner acceptance or physical phone acceptance.
The look still needs Jarrod’s OK on Desk card `q1749-ivory-edge`.
They do not guarantee every map, camera position or display reaches the same ratio.
