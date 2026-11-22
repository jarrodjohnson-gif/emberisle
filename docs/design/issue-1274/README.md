# Issue 1274 dock study — proposed

**This is a proposal for review, not an approved specification or implemented runtime UI.** The issue owner has left all eleven design decisions open. The dock and controls shown here are schematic illustrations.

Open [index.html](index.html) in a browser. The phase and bottom-safe-area selectors update the four frames. [proposal.md](proposal.md) records the recommendations, geometry corrections, limits, and suggested integration boundary.

The proposal studies 250px portrait, 232px landscape, and 672×176px desktop docks. At 320×568, the illustrated clear board height is 41.2% with no bottom inset and 38.0% with a 34px inset; this rectangle does not prove camera or island fit.

The retained artifact record reports 22 phase/safe-area combinations across four frames, matching slot rectangles within each safe-area case, no measured dock/card/control scroll overflow, and zero captured page errors. See [measurements.json](measurements.json). The four recorded frames are [portrait](portrait.png), [landscape](landscape.png), [small](small.png), and [desktop](desktop.png). These measurements cover the static schematic only; they do not validate production accessibility, real-device safe areas, keyboard behavior, or runtime integration. Small-phone seat names truncate in the study.

[capture.mjs](capture.mjs) measures the static proposal in CI; it is not a runtime UI proof. Run `npm run issue-1274-proposal-prove` from the repository root. It uses Playwright’s pinned Chromium by default, or the executable named by `CHROMIUM_PATH`, and writes measurements and screenshots to `test-results/issue-1274-proposal`. Set `ISSUE_1274_OUTPUT_DIR` to another directory to refresh or inspect artifacts. The script loads the local HTML with `setContent` and makes no network request.
