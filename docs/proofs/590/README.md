# Ivory path boundaries (#590)

Owner appearance approval is still required. These are Chromium cloud captures, not physical phone acceptance.

Only ivory legal path bars get a non-pickable `RIM.dark` underlay. Corners and halos keep their #830 styling.
The original bar stays 0.16 wide, 0.07 high and 0.72 times the edge length.
The underlay is 0.32 wide, 0.068 high and 0.8 times the edge length.
Its centre is 0.001 below the bar centre. Its bottom aligns with the bar bottom.
Its top stays 0.002 below the bar top. One instanced group shares its geometry and material.

## Real-game command

`PROOF_ARTIFACT_DIR=<output> npm run legal-edge-prove`

Run serially under `/tmp/emberisle-team-browser.lock` with repository-pinned Node and browser tools.
The proof is registered in `package.json` and the CI `scene-life` leg.
Seed 590 uses real game rules with controlled roll-off dice. Native touches select and confirm an outpost and path.
The chosen outpost touches grain and waste. Each capture shows all three legal paths before path placement.
Six ivory cases cover three viewports and both motion preferences. Three more cases check the other seat colours.

The measurement uses five fixed positions along each relevant bar.
At each position it projects the bar silhouette, including its height.
It samples one CSS pixel beyond that silhouette, then adjacent terrain four CSS pixels beyond it.
It compares median linear-sRGB luminances using the WCAG ratio. The required ratio stays 3:1.
These are fixed sample measurements on this seed, not a guarantee for every map or display.

## Captures and measurements

The unchanged-main baseline is `a7122815c489d2fd5dfd660acc1d03a82f739b01`.
The after source SHA256 is `ebeae9f28d47e506f5e872216ad5bf62739270a91fe81bdbc3f284443cf108a2`.
Browser: 153.0.8010.12; Node: v22.23.4.

| Viewport | Motion | Before ratio range | After ratio range | Before | After |
|---|---|---:|---:|---|---|
| 430x932 | normal | 1.000–1.035:1 | 7.752–8.619:1 | [PNG](before/p2-430x932-motion.png) | [PNG](after/p2-430x932-motion.png) |
| 390x844 | normal | 1.000–1.155:1 | 7.554–8.646:1 | [PNG](before/p2-390x844-motion.png) | [PNG](after/p2-390x844-motion.png) |
| 844x390 | normal | 1.003–1.091:1 | 7.327–8.644:1 | [PNG](before/p2-844x390-motion.png) | [PNG](after/p2-844x390-motion.png) |
| 430x932 | reduced | 1.000–1.035:1 | 7.752–8.619:1 | [PNG](before/p2-430x932-reduce.png) | [PNG](after/p2-430x932-reduce.png) |
| 390x844 | reduced | 1.000–1.155:1 | 7.554–8.646:1 | [PNG](before/p2-390x844-reduce.png) | [PNG](after/p2-390x844-reduce.png) |
| 844x390 | reduced | 1.003–1.091:1 | 7.327–8.644:1 | [PNG](before/p2-844x390-reduce.png) | [PNG](after/p2-844x390-reduce.png) |

The baseline completed all nine cases with 42 expected missing-underlay/contrast failures and zero console errors.
The after command completed all nine cases with zero console errors and no failed checks.
It checks unchanged bar dimensions, seat fill, legal pick targets and actual touch placement.
The other three seats have no underlay. Reduced motion preserves the visible dark boundary.

## Preserved failures

- Initial setup imported `worldOfHex` from the wrong module and failed before launching the browser.
- The next run omitted coarse-touch Place confirmation and failed the original 60-second setup guard.
- The first rendered run found contrast failures and later hit the original 30-second control screenshot timeout.
  Its diagnostic screenshot succeeded afterward; that does not establish a fix for the timeout.
- Fixed-world-plane samples could intersect the taller bar instead of its visible boundary.
  Corrected projected-boundary sampling still failed 16 checks with the initial 0.24-wide, 0.035-high underlay.
  All nine cases completed, with zero console errors.
- The wider, raised underlay then passed the same unchanged projected-boundary measurements and 3:1 target.

Each case now uses a fresh pinned browser, serially. No timeout or assertion was removed or relaxed.
The successful isolated run does not establish the cause of the earlier shared-browser screenshot timeout.
Full raw logs, JSON measurements, earlier sources and failure images remain outside the repository.

The first baseline attempt was interrupted by environment restart after three normal-motion captures.
Its partial log has no completion or exit record. The recovered full baseline is recorded separately.

## Related validation

- Typecheck and proof registration pass (241 registered proofs).
- Production build and all size ceilings/growth checks pass.
  IslandCanvas: 201,916 to 202,038 gzip bytes (+122 within 666).
  Index: 125,751 to 125,754 bytes (+3 within 400).
  The preserved 6f40 base has identical runtime source/assets/configuration to main a712.
- `pieces-land-prove` and `keyboard-place-prove` pass.
- Frozen-file `placement-glow-prove` passes desktop, portrait and landscape, with zero console errors.
  The initial run failed when its execution context was destroyed at stronghold sampling.
  Evidence-file writes preceded that failure by about 0.2 seconds, consistent with a Vite reload.
  This timing and the later pass do not independently establish the cause.
- `board-look-prove` fails its original three-frame, 8,000 ms title guard, before any game state exists.
  Captured renders were 1 to 2; elapsed time was 8,491.4 ms; the same renderer remained visible and focused.
  State and seed were null. The rest of that proof was unrun. No unchanged retry was made.

No hosted CI, independent review, or owner acceptance is claimed here.
