# Server proof checkpoint

- Date: 2026-10-26 UTC
- Parent: Codex-p
- PR: #873, continuation of the existing published `codex/646-seat-needs` work
- Private branch: `codex-p/873-server-cases`
- Previously validated code head: `ce4ff81dad7fec37faa1fe85337258c4bda8a664`
- Base: `76ceddf43db9f48e369aab3427ed6e9695d9236e`

The existing `server/needs-prove.mjs` now covers the four remaining review mutations through real host sockets: start and rematch clear restored needs; a post-game need ACT is rejected without changing public state or its previous need; and `runBots` advances expiry only on the bot owner's turns. Fixture helpers restart/stop the real host between restored-room cases. No host runtime code changed.

Fresh no-local clone validation and all retained raw output are summarized in [STATUS.md](STATUS.md) and [RESULTS.md](RESULTS.md). The server-side proof passes on the validated code head. The browser proof remains the existing `npm run needs-prove` entry and was not rerun in this server-only continuation.

The first default-sandbox attempt could not bind `0.0.0.0` (`EPERM`) and stopped before assertions; its output is retained as `candidate-host-start.log`. The same focused command passed with reviewed listening permission. The temporary `DEBUG postgame response` line was removed after its response had been captured in `logs/server-positive-debug-capture.log`.
