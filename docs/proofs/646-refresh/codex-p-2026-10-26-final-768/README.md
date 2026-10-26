# PR #873 integrated validation at 7686967

Validation ran on a fresh `git clone --no-local` of `codex/646-seat-needs` at `7686967fd59c335513511dbe58c35d46c87b4d04`, whose parents are `6c0c564c28265040de827023f4297f88cc1339fa` and `875365bb78311e89037bbbbb755b5cedc45dab8d`. The actual `origin/main` was `810ed85c2c090d591d186da51d007a93be1d4112`. The test clone's tracked source remained unchanged; `server/host.mjs` SHA256 is `6dd7c41228d7d39df5821dc8aca28e64cf646c5c07a061b41d1b893b952dff1f`, `server/needs-prove.mjs` is `a069f38addbbcb83c8f36d5fecf99dec8bf32b3aee0ef1123d78deb96d2f7267`, and `src/components/game/SeatRail.tsx` is `77347bd948f32955a9b9ce53e165f197e478dcff5bfd3395b52bebd271382229`.

Environment: Node v24.19.0, npm 11.9.0. Both `npm ci` and `npm ci --prefix server` exited 0.

| Check | Result |
|---|---|
| `npm run --prefix server needs-prove` | Exit 0; all existing Need server cases, including human-to-bot takeover and returning-seat persistence, passed. |
| `npm run takeover-prove` | Exit 0; registered server takeover behavior passed. |
| `npm test --prefix server` | Exit 0; full server regression chain passed. Lossless gzip log is in `logs/server-full.log.gz`; raw log SHA256 `3e3c1d86a0387e7ed9d46deb4f59502315b37e7bdc25aa079f2b670cee8183fa`, gzip SHA256 `ebf66603fa4044fec53d542f00fed7cf670d37fb2e6166403b6c6c849229084f`. |
| Registered browser `npm run needs-prove` under `flock /tmp/emberisle-team-browser.lock` | Exit 1 only at the known four-seat chip geometry assertions. All five Need behavior sections passed first. No geometry assertion was changed or filtered. |
| `npm run typecheck` | Exit 0. |
| `npm run registered-prove` | Exit 0; all 151 proofs are registered. |
| `npm run loosen-prove` | Approved process-permission rerun exited 0; one changed proof versus `810ed85c`, none loosened. The initial default attempt failed before comparison with `spawnSync git EPERM`. |
| `npm run build` at 7686967 | Exit 0; the existing large-chunk warning was emitted. |
| Fresh main `810ed85` build | First attempt exited 1 because disk was full. After the parent freed space, the same build exited 0; both actual outputs are retained separately. |
| `npm run size-prove -- --base /tmp/emberisle-873-main-size-base` | Exit 0; all ceilings and growth allowances passed. Base was separately cloned and built at exact main `810ed85c2c090d591d186da51d007a93be1d4112`. |

The sole test failure is the already-known chip geometry issue. At the four measured viewports (320x568, 390x844, 844x390, 1280x720), the rendered chips violate containment, overlap, and approved font/padding assertions. The 320x568 picker also places give controls below the scroll fold. The owner decision for the 44 px chip placement remains pending; no layout change was made here.

The browser runner's default Playwright executable was missing at `/home/agent/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`; the captured setup error transcript is in `logs/needs-browser-default-path-error.log`. The single actual browser run used system `/usr/bin/chromium`, version `Chromium 154.0.8037.57 built on Debian GNU/Linux 13 (trixie)`, not a pinned Playwright headless-shell. The actual browser log was written inside the Vite checkout at `/tmp/emberisle-873-final-validation/needs-browser.log`; captures were written under `/tmp/emberisle-873-final-validation/needs-captures/`. Copies of the log, geometry JSON, and eight screenshots are under `logs/` and `captures/` here.

One initial `loosen-prove` attempt and one initial main build failure were environmental: child-process permission and disk capacity. Both attempts and successful reruns are preserved separately; build output files containing terminal whitespace are gzip-compressed losslessly. No source was edited for validation, no test was repeated after completion, and no browser rerun was performed for logging.
