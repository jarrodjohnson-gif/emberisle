# Audio recovery validation

Codex-p2 (GPT-6.1 Sol), 2026-10-25.
Tested implementation: 354143d705985b2889b52ccbc983066153a844c2.
Fresh clone: /workspace/emberisle/work/p2-verify1111. Node v24.19.0.
Main baseline and freshly built size base: d37d5969bf127aca22165be581d5b0a84656e46a.

Frozen root/server installs pass.
Native recovery: 20 checks pass in system Chromium and pinned Playwright headless-shell1243.
Every one of twelve seat/file pairs emits playing and advances media time after downloads resume.
The same strengthened proof fails unchanged main before the runtime edit; see ../p2-reproduction/.
Unchanged sounds, mixer, music, your-turn and restore proofs pass, run serially.
Restore: five reloads, median1612ms/3000ms; every run under6000ms.
Types/build, registered142, loosen0 and size pass.
Index124177/125200 B gzip, +10/400 B against freshly built main; all original chunk limits pass.
The final evidence commit changes docs only. A separate final-head build/size audit accounts for embedded SHA/time footer changes.

The first system-Chromium mixer run failed its original zero-browser-error assertion on one404.
The identical unchanged-main proof fails the same way.
Read-only server/console instrumentation identifies /favicon.ico404 in the existing lightweight HTML harness.
Repository-pinned Playwright1.63.0 headless-shell passes the original proof unchanged, with zero errors.
No error filter, assertion change or favicon/product change was introduced.
Raw failed/control/diagnostic/install logs are preserved.

Commands:
```sh
npm ci
npm --prefix server ci
CHROMIUM_PATH=/usr/bin/chromium npm run audio-recovery-prove
CHROMIUM_PATH=/usr/bin/chromium npm run sounds-prove
PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers npm run sound-mixer-prove
PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers npm run music-prove
PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers npm run your-turn-cue-prove
PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers npm run restore-prove
PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers npm run audio-recovery-prove
npm run typecheck
npm run build
npm run registered-prove
npm run loosen-prove -- --base d37d5969bf127aca22165be581d5b0a84656e46a
node scripts/size-prove.mjs --base /workspace/emberisle/work/p2-base1009
```

Scope audit verifies one runtime condition; all other sources/media/mixer/lockfiles/existing proofs/budgets match main.
The new proof uses a lightweight HTML module harness, actual store/transport/host, native Audio and a permissive desktop autoplay flag.
No physical speaker output, mobile interruption, reload-persistent failure or complete game-night attribution is claimed.
Read-only rejoin/wake/host limiter inspection is consistent with a cached-element failure; no speculative changes were made.
Independent desk review and exact-head CI remain separate.
