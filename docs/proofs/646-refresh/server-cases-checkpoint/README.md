# Server proof checkpoint

- Date: 2026-10-26 UTC
- Parent: Codex-p
- PR: #873, continuing the existing published `codex/646-seat-needs` work
- Private branch: `codex-p/873-server-cases`
- Validated code head: `e0da09e5d4d97ca7dbeeb2c3def5d971c3593c36`
- Original base: `76ceddf43db9f48e369aab3427ed6e9695d9236e`

The existing `server/needs-prove.mjs` covers the four remaining review mutations through real host sockets: start and rematch clear restored needs; a post-game need ACT is rejected without changing public state or its previous need; and `runBots` advances expiry only on the bot owner's turns. It also proves that a public need survives disconnect grace and a same-secret rejoin, clears on actual human-to-bot takeover, is saved cleared, and stays clear when that person returns. The matching guarded `takeOver` runtime path clears `seat.needs` and publishes the changed seat before its no-connected-human return.

The focused server proof passed on the validated code head in a fresh clone with a locked server install. The takeover-clear-removal mutant failed at its intended public projection assertion after confirming the real bot takeover. The earlier four mutation controls remain documented below; their source paths do not intersect the takeover runtime change. Syntax, registration, and no-loosen checks from the earlier checkpoint remain recorded. Exact outputs and mutation provenance are in [STATUS.md](STATUS.md), [RESULTS.md](RESULTS.md), and `logs/`.

The browser proof remains the existing `npm run needs-prove` entry and was not rerun in this server-only continuation. The README now documents both existing server and browser proof commands, plus the public need message and seat fields.

The first default-sandbox attempt could not bind `0.0.0.0` (`EPERM`) and stopped before assertions; output is retained as `candidate-host-start.log`. The focused command passed with reviewed listening permission. The temporary DEBUG response line was removed after its actual post-game error response was captured in `logs/server-positive-debug-capture.log`.
