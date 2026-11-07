# PR905 unchanged-source controls

CI41719821552/job126212069871 fails board-look's shallow-band colour: shore[199,219,205],deep[138,211,213].
CI synthetic4719fb93 merges headb240930d into base0fbaf3b.
One full local run on unchanged head b240930d passes, shore[199,228,219],deep[138,211,213].
One full local run on unchanged CI base0fbaf3b passes, shore[199,229,219],deep[139,212,213].
Same sample coast coordinates: shore(807.7582416875143,287.19072360022994),deep(922.5708091275085,287.19072360022994).

Both original proof commands inherited CHROMIUM_PATH unset and used their default headless launch.
default-runtime-metadata.json verifies Playwright's default spawn is chromium_headless_shell-1243, Chromium153.0.8010.12, Node22.23.4, 1280x720/DPR1, identical SwiftShader flags.
INVALID-for-controls-fullChrome-postrun-metadata.json is a later explicitly fullChrome metadata probe. It does NOT describe the controls; preserved to correct the initial mistaken metadata report.
Source/assets hash files preserve actual inputs; only isle-renderer.ts differs in the scene/proof/assets set.

These local passes do not fix or explain the red hosted sample. No palette, threshold, waits or source changed.
No timing, GPU or renderer root cause is established. CI remains red; independent review and physical-phone acceptance remain required.

## Saved failed CI artifact

Artifact13271888826 (`browser-b-presentation-3-test-results`) belongs to CI41719821552/job126212069871. Downloaded through the GitHub connector; only the relevant 491429-byte PNG is committed, not the archive. Its SHA256 is b88d0d81107e93cbd85661bbc418fee610e14b191ee11eba4dbad83e1c0b0a87. The full-frame 9×9 patch estimate matches the failure log exactly. `screenshot-comparison.json` records all three frame hashes and same-coordinate patch estimates; local screenshot paths there identify the original controls, not files shipped here.

The three screenshots have the same 1280×720 dimensions and sampled coast coordinates, but different dealt terrain/number layouts. The hotseat proof does not pin or record the seed: store.startHotseat calls createGame without one, and board.ts defaults to Math.random. The water shader uses the rendered scene colour/depth as inputs; no mechanism connecting the different deals to this failure has been reproduced. Exact CI seed/state is unavailable in this artifact/log, so a fresh fixed-seed local run would not recreate it. No additional browser run was made.

CI logs identify Node22.23.4, ubuntu-24.04 image20261025.353.1, default Playwright chromium installation; they do not record the spawned binary or GL renderer. Local controls ran on Debian13. Local metadata confirms actual default-shell spawn only; browser version does not establish identical CI executable/system libraries. The first fullChrome probe was post-run and invalid for attributing either control.

This is an evidence-only checkpoint. The hosted colour failure remains unresolved; all original thresholds, samples and runtime source remain unchanged.

Codex-p <codex-p@users.noreply.github.com>
