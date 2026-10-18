# Local Durable Object feasibility spike

Issue: [#779](https://github.com/jarrodjohnson-gif/emberisle/issues/779).
Baseline: `ea9be1d4dcfc7d58dacd25e2e281e0998e41e237`.
Keep this throwaway branch separate from the production game.
Do not merge this folder into `main`.

## Run locally

Use Node 22 and npm.
From the repository root:

```sh
npm ci
npm run build
cd spikes/durable-object
npm ci
npm run prove
```

The proof uses installed Google Chrome on macOS when available.
Otherwise install Playwright Chromium from the repository root:

```sh
npx playwright install chromium
```

Set `CHROMIUM_PATH` when using another compatible Chromium executable.
Leave local port `8799` available.
No Cloudflare login, account, deployment, or paid subscription is required.
`wrangler dev --local` runs workerd and SQLite on this computer.
For manual exploration, run `npm run dev` inside this folder.

## What the proof exercises

- Build and serve the unchanged production client through Worker Static Assets.
- Open two isolated browser contexts and use real Host, Join, Ready, Add bot, and Start controls.
- Exchange the actual protocol's hello, welcome, seats, and private game-state messages.
- Send a stamped roll through the captured real socket, running the shared TypeScript rules engine.
- Send chat through that socket and verify both browsers receive it.
- Persist the snapshot in SQLite before broadcasting.
- Gracefully stop the entire Wrangler process group, then restart with the same local persistence directory.
- Verify the reconstructed object's boot counter increases and its game digest stays identical.
- Let the unchanged client automatically rejoin both original seat IDs using their original secrets.
- Refuse an invalid secret and check browser errors and runtime cleanup exceptions.

The roll and chat checks inject real protocol frames through browser instrumentation.
They do not click their gameplay UI controls.
Instrumentation remains in proof memory; production client files remain unchanged.

## Boundaries

This implements one fixed `TEST` room and a protocol subset.
The short lease only approximates held seats for this restart experiment.
It does not reproduce production grace, hold, offer, silence, or timer semantics.
Bot support covers a bounded initial action loop, not complete automated gameplay.
Alarms, profiles, invitations, watchers, uploads, abuse controls, and multiroom routing remain unimplemented.
The local-only hostname check is an experiment guard, not production authentication.
Do not deploy this prototype.

`acceptWebSocket()` and serialized attachments use the hibernation-compatible API.
The restart drops connections before the client rejoins.
It proves neither connected-socket hibernation nor abrupt-crash durability.
Local results establish no deployed CPU headroom, billing, latency, quota, or account entitlement.
Worker-first asset routing also consumes Worker invocations; production routing needs separate design.

## Evidence and private state

See [RUN-LOG.txt](RUN-LOG.txt) for sanitized fresh-clone output.
An earlier run exposed invalid close-code cleanup; the corrected run checks runtime logs after shutdown.
The proof keeps SQLite snapshots, runtime logs, and screenshots in ignored local directories.
Those files can contain seat secrets and must never enter Git.
Every proof creates a fresh ignored state directory; it preserves previous runs.
Only the sanitized console output belongs in the committed run log.
