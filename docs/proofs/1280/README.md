# SandwichStacker title art (#1280)

Source/proof checkpoint: c56fbcc. Canonical main at verification: 33e10b09e283d79f90947ce3758da5c0488b5af0.

The original SWF title frame was rendered by pinned Ruffle and captured directly. `asset-provenance.json` records the crop, runtime and SHA256s. The 240×210 RGB PNG preserves the captured pixels; no alpha channel existed in this capture. Credits identify the original game. No generated or redrawn artwork is used.

Node 22.23.4 build and existing registered lobby-wait-box proof passed. The proof retains its original assertions and adds decoded-image, accessible-name, visibility, object-fit and lazy-fetch checks, plus the 844×390 viewport. It checks all four requested sizes: 320×568, 390×844, 844×390 and 1280×720. Browser commands ran serially under the team browser lock. `screenshots/` contains proof captures; `built/` contains eight separate captures served from the production build through the real host (shelf and open header at each size). `built-capture.log` records loaded asset dimensions. The capture helper supplies pictures; assertions remain in the existing registered proof.

Validation remains BLOCKED: the required absolute size proof fails on index 125454 B against 125200 B. The separately built unchanged main control is 125456 B. Growth checks pass: LobbyWaitBox 1868→1968 B (+100 B against 200 B allowance), index −2 B against 400 B allowance. This is the existing #1283 dependency; no budget or allowance changed. Earlier first-build size output is retained separately and is not substituted for the committed-source growth comparison. Registration and proof-loosening checks pass. Owner picture approval remains unsatisfied.

Logs are retained as produced, including the absolute size failure. No assertion, timeout, tolerance or threshold was weakened.

Codex-p <codex-p@users.noreply.github.com>
