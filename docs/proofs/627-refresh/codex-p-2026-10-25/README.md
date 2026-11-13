# Keyboard fit and pan: current-main refresh

Codex-p (GPT-6.1 Sol), 2026-10-25. Existing PR905 / issue627.
Tested mergee2397f2 joins priorad27897 and main3db641d normally.
The renderer merges automatically; the only conflict is an adjacent CI registration.
Every main CI condition/script remains unchanged, plus keyboard-fit-prove once in package.json and flows-b.
The keyboard proof remains byte-identical ad27897; all44 checks and original tolerances remain.
The hole proof retains main's error/assertion guards and0.5px tolerance.
Its widened sweep retains every main width and adds375–379,440x956 and safe-area cases.
No runtime edits followed the mechanical merge.
The five-file implementation scope is unchanged; all other sources/proofs/lockfiles/budgets match tested main.
See scope-initial.log for hashes and exact parents.

Fresh clone: /workspace/emberisle/work/p-verify905, Node v24.19.0.
Frozen root/server installs pass. Initial worktree installation logs are separately named; tests use the independent fresh clone.
Keyboard44, pan, hole580 size/phase pairs with0 failures, rotate, rotate-overlays, HUD safe-area and client proofs all pass serially.
Keyboard records real CDP two-finger dragging with ratio0.9389632794492144 while cropped; pan and full projection restore.
Types/build, registered146, loosen1-none and size pass.
Tested merge index124283/125200 B gzip, +0/400 B against built main124283 B.
IslandCanvas201025/202500 B, +458/662 B against main200567 B.
All existing ceilings and growth allowances remain unchanged and pass.
The exact main size base was independently cloned/installed/built during the preceding934 task; raw logs are copied here.
Final evidence-only head receives a separate footer-sensitive build/size/hash/clean audit.
Every recorded command in exit-status.json exits0; root/server/base installations and base build also exit0.

Commands:
```sh
npm ci
npm --prefix server ci
PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers npm run keyboard-fit-prove
npm run typecheck
npm run registered-prove
npm run loosen-prove -- --base 3db641d6744617ebc55a3dbb6add1ce34855a72b
npm run build
node scripts/size-prove.mjs --base /workspace/emberisle/work/p-base934
PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers npm run pan-prove
PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers npm run hole-prove
PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers npm run rotate-prove
PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers npm run rotate-overlays-prove
PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers npm run hud-safe-area-prove
PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers npm run client-prove
```
Repository-pinned Playwright Chromium runs one browser proof at a time.
Original five mutation controls remain historical; no new logic change warrants repeating them here.
Old exact-head CI39869714339 was cancelled; historical job statuses are retained without asserting an underlying test failure.

Owner physical-device acceptance remains UNSATISFIED.
Real iPhone Safari and Android Chrome must pan, open the chat or PlaceList keyboard, switch inputs, close it, and confirm pan/fit.
These cloud DOM-focus/viewport/CDP proofs do not establish physical keyboard behavior and do not replace that gate.
Independent different-model review and exact-head CI remain required.
No assertion, timeout, rate, budget, lockfile, automation setting or unrelated UI/design change was made.
