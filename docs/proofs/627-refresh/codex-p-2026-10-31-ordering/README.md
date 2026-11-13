# Keyboard close ordering and timing evidence

Builder: Codex-p, GPT-6.1 Sol; parent: Codex-p. Usage percentage is not exposed.
Normal mergec8fd51b has parents6f12235 and maina6398e6; it applied automatically, preserving original authors.
Codecb04ec17a6c3893afa8bb09a575b927177fd2b6c fixes Opus6538777574 F1 and adds F2 diagnostics.

## F1

Full-height focusout now calls resize(), so saved renderer dimensions update before projection restoration.
The additive fixture grows the real canvas DOM height768 while saved renderer height remains420.
It blurs the actual in-shell field synchronously, then dispatches the late resize event.
The viewport subsequently returns to1024x768 and the temporary canvas CSS override is removed.
After30frames old runtimec8fd51b retains aspect2.438095 instead of1.333333 and fails the new projection/pan assertion.
Fixed runtime restores1.333333 immediately and keeps the same pan offset; all59 keyboard checks pass.
The pictures show separately randomized games, with the same ordering and pan fixture. Both were visually inspected.
This is deterministic DOM/event evidence, not a physical keyboard test or owner acceptance.

Two initial attempts used native window/visualViewport capture listeners.
Their precondition failed because renderer dimensions had already updated; those runs did not reproduce the bug.
Both failed setup logs remain; no inference about production failure was drawn from them.

## F2

The proof records performance.now() on actual blur and includes the timestamp in its camera sample.
It prints both timestamps, elapsed time and600ms. An absent timestamp or elapsed time at/after600ms throws 'timing inconclusive'.
It exits1; it never passes or skips the original assertions on inconclusive timing.
The600ms runtime timer and every original assertion, tolerance, wait and frame count remain unchanged.
All407 original proof lines remain in order;32 additive lines add diagnostics and two F1 checks.

A separate control copy adds650ms after blur. It fails with 'timing inconclusive' at834.8ms.
The exact one-line control patch and raw output are retained; this delay is absent from the registered proof.
Normal fixed samples remain below600ms, in the full keyboard output.
No new proof was introduced; keyboard-fit remains registered once in package.json and ci.yml.

## Validation

Node24.19.0; frozen root/server installs; Playwright pinned default headless Chromium153.0.8010.12, software rendering.
Every browser command runs serially under flock /tmp/emberisle-team-browser.lock.

- `flock /tmp/emberisle-team-browser.lock npm run keyboard-fit-prove`: old runtime fails F1, fixed59 checks pass.
- `flock /tmp/emberisle-team-browser.lock node /workspace/work/627-context/keyboard-delayed-control.mjs`: exits1 'timing inconclusive' as intended.
- `npm run typecheck`; `npm run registered-prove`: pass,168 registered.
- `npm run build` in candidate and detached main; `node scripts/size-prove.mjs --base /workspace/work/627-main-base`: pass.
- Index124885→124883 B gzip,−2/400; Canvas200940→201469,+529/663. All ceilings/growth allowances unchanged.
- `npm run loosen-prove -- --base c8fd51b62cf4a804f11d119c3a7d8c20a5bc167b`: one changed proof, none loosened.

No dependency, lockfile, size allowance or unrelated application source changes were made.
Shared-renderer browser results are recorded below after completion. Raw compressed logs retain actual output.
Historical #1166 client resource and #1176 lobby-padding failures remain unresolved.
Earlier full-Chrome cropped-home failures remain unattributed; those runs recorded no blur/sample timestamps.
The new timing diagnostic does not establish that the settle timer caused those historical failures.
Fresh exact-head CI and independent Claude review remain required; no manual CI retry or merge.

Physical iPhone Safari/Android Chrome acceptance remains UNSATISFIED, per q905-test at the next game night.
The owner must pan with two fingers, move from chat to PlaceList input, close the keyboard and double-tap empty board with it up.
Cloud emulation does not satisfy that gate.

## Resume audit, 2026-11-02

Runtime remains cb04ec17a6c3893afa8bb09a575b927177fd2b6c.
Exact runtime CI41233547946 passed; Claude review6551861267 is clean.
The following original logs were inspected and preserved byte-exact in gzip archives.
Exit files exist only where the previous worker recorded them; absent exits are not reconstructed.

| Log | Recorded exit | Bytes |
|---|---|---|
| base-build.log | not recorded | 3325 |
| board-look.log | 0 | 14444 |
| build.log | not recorded | 3325 |
| client.log | not recorded | 278 |
| delayed-sample-control.log | not recorded | 5757 |
| fixed-ordering.log | not recorded | 10470 |
| hole.log | 0 | 209 |
| hud-safe-area.log | 0 | 21180 |
| loosen-fix.log | not recorded | 3155 |
| npm-ci.log | not recorded | 25 |
| old-runtime-ordering.log | not recorded | 10499 |
| ordering-both-viewport-capture-precondition.log | not recorded | 10523 |
| ordering-window-capture-precondition.log | not recorded | 10463 |
| pan.log | 0 | 13289 |
| registered.log | not recorded | 689 |
| render-recovery.log | 0 | 6456 |
| robber-prompt.log | 0 | 366 |
| rotate-overlays.log | 0 | 27227 |
| rotate.log | 0 | 13446 |
| server-npm-ci.log | not recorded | 26 |
| size.log | not recorded | 2776 |
| stage.log | 0 | 5697 |
| typecheck-pre-fix.log | not recorded | 29 |
| typecheck.log | not recorded | 29 |
| webgl-recovery.log | 0 | 10177 |

Pan106, hole600 size/phase pairs, rotation71, overlay305, stage25, board-look76,
render-recovery4, WebGL-recovery4, robber3 and safe-area269 checks completed with recorded exit0.
Recovery logs contain deliberately injected exceptions; their terminal recovery checks pass.
Client proof is INTERRUPTED/INCOMPLETE: only six lines, ending during roll-off, with no exit or terminal success.
It must not be reported as passing. No new client run was started for this documentation checkpoint.
Old-runtime F1 failure, both capture-precondition failures and delayed-sample inconclusive failure remain preserved.
Non-browser logs without exit files retain their terminal output, without invented exit status.
The unrelated generated #1137 picture was preserved outside the checkout before restoring its tracked bytes.
Physical-phone acceptance remains required; cloud proofs do not meet it.
