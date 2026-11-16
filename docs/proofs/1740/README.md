# Hanging-list timing fixture

Codex-p, GPT-6.1 Sol; Refs #1740, discovered during #1494 validation.
Frozen main4caf824e, Node22.23.4/repository Chromium1243,2CPU plus100ms busy/200ms, external team lock.

- One full native run FAILED6121ms at original3500–4600 bound, after all10viewports/spectator/live/first-paint startup cases passed. Later cases unrun.
- One focused native timing run FAILED4943.8ms: commit/schedule214.4ms after landing; callback378ms late behind a1057ms long task; DOM351.5ms later. This is observed scheduling delay, not a proven cause for historical1494startup or1495frame/navigation errors.
- Focused GL-isolated context PASS4216ms. Other full cases unrun.
- No-bound negative with GL isolation FAILED original8000ms wait, as required. No dialog appeared.
- Controlled2000ms GL draw call near deadline: original fixture FAILED6910ms; GL-isolated fixture PASS4254ms and that draw was not called. This establishes the tested fixture interference; it does not guarantee native product deadlines on arbitrary overloaded devices.

The proposed existing-proof change isolates GL submission only in this no-screenshot hanging-list case. No product/shared renderer, clock, timer, assertion or timeout changes. All other contexts retain native drawing. Original4000ms product timer,3500–4600ms guard,8000ms wait, totals/first-paint and late-chunk swap checks remain. No full post-change result claimed yet. Raw sources/logs/exits/runners retained verbatim. Temporary executable diagnostics removed after completion.

Initial registered-prove setup failed ENOENT .github/workflows/ci.yml because sparse checkout omitted .github; preserved as a setup failure, not a product failure. Added existing .github to sparse checkout; actual rerun log/exit in registration/. No source fix attributed to that retry.
