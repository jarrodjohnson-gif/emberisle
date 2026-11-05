# Current-game composite assessment

Runtime underlay: palette refresh `50045c636206f6c84685a67f8cb3124583eebcda`.
Synthetic overlay: Fortunes proposal `ed815c3764df7e21e6ccd3656580f455609d614f`.
Browser: Chromium153.0.8010.12. Four viewport captures, 2026-11-05.

The page uses a crafted local four-seat state. An iframe displays the proposal over the running game. Runtime source is unchanged. Mock safe areas do not emulate the runtime device safe areas. These are diagnostic composites, not integration or gameplay proofs.

| Size | Mock top | Runtime header bottom | Result |
|---|---:|---:|---|
| 390×844 | 250 | 56 | Header clear |
| 844×390 | 12 | 56 | Header covered; wrong side for existing dock |
| 1280×720 | 126 | 56 | Header clear |
| 320×568 | 44 | 56 | Header covered by12px |

The landscape mock spans x480–800. Existing `fortune-tray-prove.mjs` requires the tray inside the left half. It also requires the tray below the header/seat strip. Preserve these assertions. Decision8A does not authorize removing them.

The current proposal therefore fails integration geometry at two sizes. Do not build these dimensions unchanged. Refine against the live dock after coordination with #1144. The simplest correction reserves the actual header bottom plus gap and retains the existing left column. Its usable list height needs a new measured mock before acceptance.

The raw runtime captures show the fixture's existing dock and banner. Do not treat these as an accepted dock design. The overlay omits the synthetic scrim so the conflicts remain visible.

| Size | Runtime | Proposal overlay |
|---|---|---|
| 390×844 | [Runtime](390x844-runtime.png) | [Composite](390x844-proposal.png) |
| 844×390 | [Runtime](844x390-runtime.png) | [Composite](844x390-proposal.png) |
| 1280×720 | [Runtime](1280x720-runtime.png) | [Composite](1280x720-proposal.png) |
| 320×568 | [Runtime](320x568-runtime.png) | [Composite](320x568-proposal.png) |
