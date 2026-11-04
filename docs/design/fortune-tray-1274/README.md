# Fortunes tray: unfinished design checkpoint

Preserved at the user's request for a new agent. This is an incomplete local design draft for #1302 under #1274 decision 8A, not an accepted spec or production implementation. Runtime files are unchanged.

`index.html` is the synthetic prototype. `measurements.json` contains 96 recorded cases: four viewport sizes, two inset settings, and twelve states. Its browser field reports Chromium 154.0.8037.57. Four safe-area long-list PNGs are under `images/`. `SHA256SUMS` records the preserved artifact bytes.

The capture worker reported using `/tmp/emberisle-team-browser.lock` and an intercepted local HTTP page after file-URL navigation failed. The parent has inspected the JSON structure but has **not completed independent visual or interaction review** of this packet. The recorded interaction checks concern the prototype's local counter, not game dispatch, legality, privacy or production accessibility. Do not report production tests as passing from these files.

The prototype includes empty, selected/unselected, unplayable, just-bought, already-played, points, five-kind long-list, before-roll, no-path, empty-bank and Muster scenarios. Terra's source review caught a held-count mismatch and a persistent lock; the draft was revised to show six held fortunes and expose a new-own-turn reset. Bank-aware picks and board-arm versus dispatch labels were also added. These revisions still need review against the source.

Next: inspect all four PNGs and the recorded geometry, verify the latest source corrections, and complete the source inventory and spec. Explicitly distinguish approved bottom anchoring/one selected Play from proposed selection-reset and overlay arbitration. Test bank-stock changes, failure paths, safe-area bounds and logical keyboard order as appropriate for this prototype; retain all failures. Preserve #1144/#1101 dock ownership and keep FortuneTray.tsx/Hud.tsx read-only until the mock is accepted and files released. Do not turn this checkpoint into runtime code or call the design complete.

See [the complete handoff](../issue-1274/HANDOFF.md).
