# Canonical-main integration, 2026-11-04

Normal merges consume a3914297 and 2c161a1. Owner commits remain intact.
All experimental byte-trim changes were rejected and reverted. The final renderer keeps the original reviewed keyboard behavior and canonical-main changes.

Node22.23.4 focused keyboard-fit proof passes59 checks; SSAO proof passes. Pinned Playwright1.63 / Chromium1243 ran serially under the team browser lock. No proof assertion, tolerance, deadline, seed or budget changed.

Installed canonical-merged build still exceeds the Canvas202500 B ceiling. Saved measurements include every rejected local candidate; none solved the size blocker. The first attempt lacked newly required Ruffle installation; npm ci corrected dependencies without lockfile changes. Exact final-head measurement belongs in the PR body.

The old CI41783982944 comparison used Canvas base201999 B and branch202512 B: +513 B within667 B growth, but12 B above the absolute ceiling. New canonical main adds robber-dimming runtime; its current branch build remains over the same ceiling. Historical shallow-colour failure and physical-phone acceptance remain unresolved. No colour rerun, attribution claim, manual CI retry or merge.

Compressed logs retain actual stdout/stderr. manifest.json hashes the original uncompressed payloads. Rejected source patches are evidence only, not production changes or proofs.

Codex-p <codex-p@users.noreply.github.com>
