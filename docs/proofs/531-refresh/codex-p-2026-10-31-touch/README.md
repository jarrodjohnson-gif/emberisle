# Current-turn touch-ring correction

Builder: Codex-p, GPT-6.1 Sol; parent: Codex-p. No usage percentage is exposed.

Normal merge `cab0ef296a3361f9dfb934e9cb7c78795b9c9813` joins prior `dac5406` and main `138bdfd`.
TradeToast conflict resolution keeps main's compact demand, fade and accessibility behavior, adding the original turn hooks.
Source `1d55230a4ee9d59f85cdad3157386c03e51679e7` adds `z-index: 1` to the existing ring overlay.
The registered marker proof gains 31 lines. All 291 original lines remain in order, including every assertion.
No dependency, lockfile, timing, tolerance, size allowance or existing test changes were made.

## Reproduction and proof

Node v24.19.0, frozen root/server installs; Playwright's pinned headless Chromium153.0.8010.12, default software rendering.
Every browser command uses `flock /tmp/emberisle-team-browser.lock` and runs serially.

Native touch opens the real current-seat menu. Pinned Chromium does not retain `:hover` from tap alone.
The regression then uses native pointer hover in that touch context to reproduce the problematic sticky-hover state.
It reads actual screenshot pixels at the ring's left, right and bottom edges, using canvas decoding.
No CSS override, DOM ring fixture or computed-shadow-only assertion establishes that result.

Old merged runtime fails at390x844: all three pixels `[238,236,231,255]`, expected seat `[226,61,46,255]`.
Fixed runtime passes upright and sideways: all three pixels `[226,61,46,255]` at both sizes.
Full marker output:31/29/30 moves and seven passes per size; original zero/two/wrong/hidden/no-mark controls remain.

Before/after games have separately randomized boards and hands. Their edge-pixel check concerns the same seat colour and hover state.
The offer pictures use synthetic offers, matching the existing proof; they do not establish natural offer/winner behavior.
Six current owner pictures show desktop, upright and sideways, each without/with the offer band.
Two current touch-menu pictures and one old-runtime negative picture show the correction.
All nine were visually inspected. Owner acceptance remains required.

## Commands and retained failures

- `npm ci`; `npm ci --prefix server`; `npx playwright install chromium`.
- `flock /tmp/emberisle-team-browser.lock npm run turn-marker-prove`: old control fails; fixed command passes.
- `flock /tmp/emberisle-team-browser.lock npm run hud-safe-area-prove`:269 checks pass after server install.
- `flock /tmp/emberisle-team-browser.lock npm run seat-rail-prove`:pass.
- `flock /tmp/emberisle-team-browser.lock npm run trade-prove`:pass, including inherited compact/fade/accessibility behavior.
- `npm run typecheck`; `npm run registered-prove`: pass,167 registered.
- `npm run build` in the PR and detached main baseline; `node scripts/size-prove.mjs --base /workspace/work/531-main-base`: pass.
- Index124882→124920 B gzip,+38/400; absolute ceiling125200. Every chunk passes unchanged ceilings/growth limits.
- `npm run loosen-prove -- --base 138bdfd6ffaf3919a5f32d4999900b546183345f`: pass; marker is new versus main.
- `npm run loosen-prove -- --base cab0ef296a3361f9dfb934e9cb7c78795b9c9813`: one changed proof, none loosened.

Retained hole failure: unchanged hole proof exits1 at line52 after viewport resize, because `window.__emberisle` is undefined.
It reached no geometry assertions. Main control passes500 pairs. The second candidate observation fails at line64: execution context destroyed during navigation.
Neither candidate failure is a passing hole result. No geometry failure or navigation cause is established; no further investigation was made.

Retained setup failures: first launch preceded browser installation; initial safe-area launch exited13 before server dependencies were installed.
Initial native-tap-only hover precondition failed on both old/fixed runtime; it did not establish ring behavior.
The prior-head loosen advisory flags inherited main trade/wayfarer replacements; it does not flag the additive marker change.
See raw logs. No failure was hidden or treated as a passing proof. No manual CI retry or PR merge occurred.

## Decisions

Question6547754105 asks approval for no lobby marker before Start and the inset20% band instead of outer glow.
Desk6547757586 says Jarrod decides from the six pictures; bug work proceeds independently.
The design-dependent pause does not pause or release the independent touch correction claim6547749417.
Fresh independent Claude review and owner picture acceptance remain mandatory.

Code-head CI41232056385 was running with no failed job observed when evidence was prepared; TradeUI41232056422 passed.
Fresh exact evidence-head CI remains required.
