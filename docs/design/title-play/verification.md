# Design verification

Author: Astra-1030-title (GPT-6 Astra), 2026-10-30. This checks the standalone design prototype, **not an implemented game change**. Runtime, server, CI, assertions and size budgets are untouched.

## Observed final results

```text
45 captures: 15 states × 3 viewports
390×844, 844×390, 1280×720
Controls below 44×44: 0
Controls outside viewport: 0
Button text ranges outside button: 0
Card/detail/button scroll overflow: 0
Document dimensions beyond viewport: 0
Minimum adjacent control gap: 8 px
Minimum visible text: 12 px
Interaction runs: 3
Sixth table reachable: 4–6 of 6 at each size
Typed four-character code enables Join: true at each size
Private Back focus: Online private at each size
Dialog background inert: true at each size
Dialog return focus: Wayfarer rules at each size
Sound rerender focus: Sound at each size
Front return focus: Play at each size
Browser errors in final interaction runs: 0
```

Raw observations: [measurements.json](measurements.json), [interactions.json](interactions.json). There are48 PNGs:45 state captures plus3 back-to-front captures. The three JPGs are the real-main scene backdrops. Source/artifact hashes are in [SHA256SUMS](SHA256SUMS).

Measurements inspect controls, button text-node ranges and card/detail/button overflow, plus gaps between siblings in control groups. They are not a general accessibility audit or a proof of every possible name, server error, viewport, zoom or safe-area combination. The three target screenshots were visually inspected; landscape bot wrapping, private detail overflow and desktop rules-label width found during that pass were fixed before the final run.

## Contrast

WCAG relative-luminance ratios from the exact opaque mock tokens:

| Foreground / background | Ratio |
|---|---:|
| Main text #293c3c / card #f4f7f6 | 10.79:1 |
| Secondary #536763 / card #f4f7f6 | 5.59:1 |
| White / primary #285550 | 8.38:1 |
| Error #9d3529 / white | 7.06:1 |
| Control edge #7f908e / white | 3.34:1 |
| Focus #1b726e / card #f4f7f6 | 5.30:1 |

## Repeat the design capture

Use the existing checkout dependencies. Start a local server from the repository root (the capture uses port5177), then run these **one at a time**:

```sh
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5177
# In another terminal, once the server is ready:
node docs/design/title-play/interact.cjs
node docs/design/title-play/capture.cjs
```

`CHROMIUM_PATH` overrides `/usr/bin/chromium`; `MOCK_URL` overrides the default local mock URL. The utilities record measurements and screenshots; they are design research utilities under docs, not new product proof scripts or substitutes for CI. They intentionally do not assert that the game works. The final run used system Chromium, Playwright from the existing lockfile, device scale1. No dependencies installed.

Background provenance: current-main `13f73f44f7f11b30b20eefd330452f9ac43163f2`, live Vite client, reduced motion, three exact viewport sizes. After canvas readiness the screenshot stylesheet hid all DOM chrome and made the canvas visible. JPEG quality88. Those files are static assets only in this docs directory; the actual implementation keeps the existing renderer.

Initial unsuccessful runs are disclosed: Vite injected its refresh tag into a template `<header>` when the HTML lacked explicit head/body tags; full document tags fixed parsing. An early screenshot attempt timed out once; another run was interrupted by Vite HMR while the file was being edited. The final capture ran against unchanged source and finished normally. Interaction checks then caught hidden mobile Sound focus and an escaped inline code-input handler; both were fixed, and the full interaction/capture sequence was rerun. The final reports above supersede those attempts; no thresholds were relaxed.

## What remains

Owner approval of the pictured design, independent Claude desk review, and then implementation on #1117. No game proof or real room flow was run for this docs-only work. Live discovery retry/cancellation, invite persistence, Unicode/taken colors, keyboard/zoom fallback and long-error Details behavior need their stated implementation checks. The compact keyboard and long-error fallback designs need additional owner-reviewed mocks before a builder implements them. This PR does not close the implementation portion of #1151.

Repository checks on the final docs tree:

```text
node --check capture.cjs / interact.cjs / extracted mock script: exit 0
git diff --cached --check: exit 0
Local Markdown links: 0 broken
registered-prove: all 157 proofs are in package.json and ci.yml
loosen-prove: 0 changed proof(s) against HEAD, none loosened
```
