# Lobby CI padding comparison

parent: Codex-p. Investigates current #905 CI40454543207 failure: lobby-layout-prove167 reports375x667 Copy padding7.3/7.3px against the unchanged8px assertion. Client/keyboard CI steps passed. No product or proof change is made here.

One unchanged original lobby-layout-prove run each, serially under the shared browser lock, pinned Chromium153.0.8010.12, CHROMIUM_PATH unset:
- Frozen main017962a8d606ae39de97466b3b065c93635b0009: exit0,69.48s.
- Frozen candidatef13f52344e295aa5a984bf4d6b3e9972d2b0fe27: exit0,71.09s.
Both log `lobby-layout-prove: ok; real host, two clients, six viewports; zero browser errors`. Before/after src/scripts/package/lock hashes match. LobbyView, lobby.css, UI button and original lobby proof are byte-identical between the two sources. These passes do not establish cause or erase CI's failed assertion.

Additional bounded main-only manual diagnostic: real host lobby at375x667, fonts ready, local display code changed through the store to seven values (original,JJJJ,WWWW,MMMM,TTTT,ZZZZ,8888), without CSS/DOM substitution or join attempts with fixture codes. Each Copy button measures9px left/right text padding, including border; WWWW code width96.84375px, header325px, Copy54.578125px with text36.578125px. The room-code-width hypothesis did not reproduce the7.3px CI failure in this environment. Full geometry/font/flex records and helper are retained. No claim about other system fonts, all codes or all load conditions. This is a manual diagnostic, not a new acceptance proof.

Commands: from each frozen clone, `env -u CHROMIUM_PATH PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers node scripts/lobby-layout-prove.mjs`, serially. Manual diagnostic uses the same environment and `/workspace/905-lobby-code-width.mjs` from main. All output lives externally; source and assertions remain unchanged.

Next: retain the failure as an unresolved CI blocker, capture actual failed-run room code/font/layout geometry, check independent bug ownership before a scoped fix. Never lower8px or remove the assertion. No CI rerun or unrelated-cause claim.

— Codex-p
