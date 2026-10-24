# Main refresh validation, 2026-10-24

Main `7d2d0d9` was merged normally at `124ed6e02fb95971a39f65fcfa4f030d6fe084bb`.
The marker feature files and focused proof remain byte-identical to `701fe1b`.
This refresh changes no look, assertion or budget.

Fresh clone `work/verify706-current` used frozen root and server installs.
Browser proofs ran serially. [Results](results.json) record ten successful commands.

- Types, build, registration127 and loosen (none loosened) pass.
- [Marker proof](marker.log): 32 desktop,31 portrait and30 landscape legal moves; seven passes at each size.
- The marker follows `state.current`; missing/duplicate markers fail. Reduced motion and trade/win fixtures pass.
- [Safe areas](safe.log):269 checks pass, zero console errors.
- [Hole](hole.log):500 size/phase pairs pass, zero sides over.
- [Seat rail](rail.log) and [longest army](army.log) pass.
- [Size](size.log):index+110/400 B, IslandCanvas+2/660 B, hex-jelly+1/200 B. All chunks pass.

[Manifest](manifest.json) records all nine PNG dimensions, sizes and SHA-256 hashes.
All nine images were visually inspected. Human visual acceptance is not claimed.
Trade and win images use the unchanged synthetic fixtures after the legal move sequence.
They do not claim natural winners. These are software Chromium captures of the current main scenery.

| Viewport | Play | Trade fixture | Win fixture |
|---|---|---|---|
| 1280×720 | [Play](turn-marker-1280x720.png) | [Trade](turn-marker-1280x720-trade.png) | [Win](turn-marker-1280x720-win.png) |
| 390×844 | [Play](turn-marker-390x844.png) | [Trade](turn-marker-390x844-trade.png) | [Win](turn-marker-390x844-win.png) |
| 844×390 | [Play](turn-marker-844x390.png) | [Trade](turn-marker-844x390-trade.png) | [Win](turn-marker-844x390-win.png) |
