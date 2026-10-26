# Need chip review checkpoint

Parent: Codex-p. Builder: GPT-6.1 Sol; commits authored/committed by Codex-p. Original authors remain.

This checkpoint is **blocked**, not ready. Review6409765942 requests an inside-card row with12px text and12px x/8px y padding. Question [6410457324](https://github.com/jarrodjohnson-gif/emberisle/issues/646#issuecomment-6410457324) records the conflict with mobile-hud's44px strip and seat-rail-prove's total-height≤44px assertions. No assertion/budget/timeout is weakened. Badge geometry remains unchanged until that decision.

- `22b09fc`: registered needs-prove adds real four-seat/two-need geometry,8 screenshots and exact open-picker obstruction metrics. All prior assertions remain.
- `abc9d65`: normal merge of actual main0939c377. Additive size conflicts preserve every common fixture value and both independent chunk entries/ceilings.
- `f62d6cf`: independent fixes: picker gap8px; closed Need button has no dangling aria-controls; public chips have static named image semantics instead of4 live regions.
- `137b173`: short-screen picker uses existing horizontal space, saving100px vertically without changing the modal or footer.
- `ed86195`: normal merge of actual main87ab69c. Every assertion and unchanged size ceiling remains.

`before/` ran on76ceddf plus the new proof. Original protocol/trade/local-expiry sections passed; new geometry failed as expected. At320x568, Jarrod's card is59px wide startingx12, while the64.406px chip startsx2.594. All four viewports show chips4px below their44px cards. At844x390, scroll viewport ends291.5px; “You give” is261–279px and all ten give steppers are336.5–380.5px, clipped below the fold.

`independent/` ran onf62d6cf after main reconciliation. Original assertions pass and new gap/ARIA checks pass at all four sizes. New chip geometry/type/padding and landscape-fold assertions still fail, preserving the blocker. These are **before-fix/blocker pictures**, not owner acceptance pictures.

Proof fixture sets all four public local needs directly after actual seat anchors mount; original real-client protocol tests still validate publishing, secrecy, trades and expiry. No arbitrary fixture delay is added. Long browser commands hold `/tmp/emberisle-team-browser.lock` for the full browser/host lifetime; logs are copied only after exit.

## Final frozen results

`final-frozen/` contains eight captures and geometry from the clean frozen clone at **ed86195fdbc20d678efda09ebf508f252ac2a1b7**.
The evidence-only commit preserves that source byte-for-byte; `checks/source-sha256.txt` records every tracked non-doc file.
Recovery copied existing results without rerunning proofs. Node24.19.0 and pinned Playwright1.63.0 produced the saved checks.

| Saved check | Actual result |
|---|---|
| Browser needs-prove | Exit1: unresolved chip containment, overlap, font and padding checks fail. |
| Original hosted, trade and local-expiry sections | All three print PASS before the geometry assertion. |
| Picker target, horizontal fit, gap and closed ARIA checks | No failures reported at all four captured sizes. |
| Unchanged seat-rail-prove | Exit0:1280x720,390x844,667x375,844x390 retain seats≤44px. |
| Typecheck | PASS |
| registered-prove | PASS:151 proofs registered. |
| size-delta-prove | PASS:all fixture cases behave. |
| loosen-prove against origin/main87ab69c | PASS:one changed proof, none loosened. |
| Build | PASS; original chunk-size warning preserved in raw output. |
| Size against built main87ab69c | PASS:all ceilings and growth allowances unchanged. |

At844x390, the final scroll viewport remains60–291.5px. “You give” is now161–179px.
All ten give steppers occupy236.5–280.5px and fit without scrolling. Picker targets remain at least44px, with8px gaps.
`picker-fit/` preserves the earlier137b173 fit measurement and landscape capture; `final-frozen/` confirms the result after the main merge.
At320x568, give steppers still require scrolling; this checkpoint claims the requested844x390 fix only.

Raw size output records index124413/125200 B, versus base124345 B: growth68/400 B.
The existing built SeatNeeds asset measures1881/1900 B with the proof's Node gzip method, leaving19 B.
Vite's displayed gzip estimate differs; the saved size-prove result uses its unchanged canonical measurement.
Every common fixture value remains; SeatNeeds1900 and LobbyView2500 ceilings remain additive.

**Blocked:** chip overlap,10px caption and insufficient padding remain unchanged.
[Desk answer6410466672](https://github.com/jarrodjohnson-gif/emberisle/issues/646#issuecomment-6410466672) forbids altering44px checks or adding48px until the owner answers.
Recommendation B is pending; no dot/menu design was implemented. These captures document the blocker, not owner acceptance.
Server mutation cases, README protocol/proof rows and inherited evidence trimming remain separate review work.
No all-green, owner acceptance or merge-readiness claim is made.
