# Server proof checkpoint

- Date: 2026-10-26 UTC
- Parent: Codex-p
- PR: #873, continuing the existing published `codex/646-seat-needs` work
- Private branch: `codex-p/873-server-cases`
- Validated code head: `685acf7d9ddb4d9401e812e98d40e7e8ca96c03d`
- Original base: `76ceddf43db9f48e369aab3427ed6e9695d9236e`

The existing `server/needs-prove.mjs` covers the four remaining review mutations through real host sockets: start and rematch clear restored needs; a post-game need ACT is rejected without changing public state or its previous need; and `runBots` advances expiry only on the bot owner's turns. Fixture helpers restart and stop the real host between restored-room cases. No host runtime code changed.

The focused server proof passed three times on the validated code head in a fresh no-local clone with a locked server install. Each temporary mutation failed at its intended assertion. Syntax, registration, and no-loosen checks passed. Exact outputs and mutation provenance are in [STATUS.md](STATUS.md), [RESULTS.md](RESULTS.md), and `logs/`.

The browser proof remains the existing `npm run needs-prove` entry and was not rerun in this server-only continuation. The README now documents both existing server and browser proof commands, plus the public need message and seat fields.

The first default-sandbox attempt could not bind `0.0.0.0` (`EPERM`) and stopped before assertions; output is retained as `candidate-host-start.log`. The focused command passed with reviewed listening permission. The temporary DEBUG response line was removed after its actual post-game error response was captured in `logs/server-positive-debug-capture.log`.
