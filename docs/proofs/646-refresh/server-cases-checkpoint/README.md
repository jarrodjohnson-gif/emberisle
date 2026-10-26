# Server proof checkpoint

Date: 2026-10-26 UTC
Parent: Codex-p
PR: #873, continuing the already published `codex/646-seat-needs` work
Checkpoint branch: `codex-p/873-server-cases`
Base: `76ceddf43db9f48e369aab3427ed6e9695d9236e`

This checkpoint preserves four added real-host cases in `server/needs-prove.mjs`:

- Starting a game clears restored public seat needs.
- A need update after game over is rejected while the existing public need and game state stay intact.
- A rematch clears restored public seat needs.
- `runBots` advances the bot owner's need on that bot's own turns; another player's turn does not age it.

The patch also adds host/socket cleanup, fixture writing, optional initial-state waiting, and a helper that accepts either an error or seats response. The existing public `DEBUG postgame response` line is part of the preserved WIP.

## Validation status

The four added cases are **unverified**. No confirmed passing output or mutation results for them are retained. The available `/tmp/p873-main/fresh/server-needs.log` is dated 2026-10-26 01:22 UTC and ends at the original `needs server prove ok` output; it predates these added cases and does not validate this patch. No broad suite or mutation run is represented here.

A `node --check server/needs-prove.mjs` syntax check is recorded only if it appears in the checkpoint handoff/commit audit; syntax checking does not establish runtime behavior.

## Remaining review points

The cases restore host fixtures from JSON and restart the real host between scenarios. Their assumptions about restored lobby readiness, phase transitions, game/seat identity mapping, and bot turn startup have not been exercised for this patch. The post-game case also logs the first response for diagnosis. Run the focused proof and inspect its actual output before treating any assertion as established.
