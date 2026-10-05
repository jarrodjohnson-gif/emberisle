# Research: a dropped player sits back down in their seat (#114)

- step: 1 Research; refresh of completed node #183 (covers #113 and #114), parent #72
- original research: 2026-10-02, Claude
- refreshed: 2026-10-05, ChatGPT; docs only
- code reviewed: main `05184fb` and PR #477 branch snapshot `8c09099`; the rejoin, storage and retry paths match between them

## Finding

Online play already holds a dropped seat, reconnects automatically, and restores that seat after a page reload.
The original #183 research described these as future work under #195, #196 and #113. They are now implemented.
The remaining work for #114 is to assess the current behavior and complete the real phone/network gate from
#197, rather than build the original plan again. This note records source review, not a new proof run or an
issue-status audit.

## Sources

- [server/host.mjs](../../server/host.mjs): `openTable`, `sitDown`, `rejoin`, `leave`, `hold`, `takeOver`,
  `letGo`, `handOffHost`, `armTurns`, `pushState`, `rematch`, `save`, `load`, and the WebSocket ping/pong loop.
- [src/lib/net/table.ts](../../src/lib/net/table.ts): `hostUrl`, `connectTable`, backoff, `wake`, and rejoin errors.
- [src/lib/game/store.ts](../../src/lib/game/store.ts): `savedSeat`, `rememberSeat`, `rejoinTable`, `connect`,
  `goTitle`, and the online/visibility listeners.
- [src/components/game/EmberisleApp.tsx](../../src/components/game/EmberisleApp.tsx): automatic rejoin on mount.
- [Lobby.tsx](../../src/components/game/Lobby.tsx), [SeatRail.tsx](../../src/components/game/SeatRail.tsx)
  and [PlayerMenu.tsx](../../src/components/game/PlayerMenu.tsx): the away/reconnecting display.
- [server/rejoin-prove.mjs](../../server/rejoin-prove.mjs),
  [server/reconnect-prove.mjs](../../server/reconnect-prove.mjs),
  [server/persist-prove.mjs](../../server/persist-prove.mjs),
  [server/watch-prove.mjs](../../server/watch-prove.mjs),
  [scripts/tabs-prove.mjs](../../scripts/tabs-prove.mjs) and
  [scripts/client-prove.mjs](../../scripts/client-prove.mjs): existing automated coverage.
- Historical context: [L16-serve.md](L16-serve.md), [connection.md](../design/connection.md),
  [online-client.md](../design/online-client.md), the `ws` README on `ping()`/`pong`, and Playwright's
  `BrowserContext.setOffline` documentation, as read for #183. The older documents contain obsolete
  behavior; the current source paths above establish the behavior below.

## What happens now

### Identity and admission

Each seated player's `welcome` carries a secret made from 16 random bytes (32 hex characters). The table's
public `seats` list does not expose it. A returning browser sends `hello {code, secret}`; a room code, name
or public seat id alone cannot recover a seat. `welcome.you` is the seat id; `state.you` is the game player id
held in `seat.pid`. Rejoin preserves both.

`rejoin` cancels the grace and hold timers, attaches the new socket, sends `welcome` with the retained chat,
publishes the seats, then pushes the current game state and legal actions. It restores a bot-controlled
player to `kind: "human"` with the original name. Bot moves already made remain part of the game; returning
does not rewind them. Other bot seats can act before the returned state is sent.

The host returns `No table with that code`, `Seat is gone.` or `Seat is taken.` as appropriate. A live socket
holding the same secret is refused. A late close from a replaced socket cannot detach the replacement
(`leave` checks `seat.ws !== ws`). A fresh join to a started game remains refused: this is recovery of an
existing seat, not admission of a new player to an ongoing game.

### Drop, grace and expiry

| Situation | Current host behavior | Default |
|---|---|---|
| Lobby socket closes | Hold the seat, mark it away, clear Ready; it must ready again after returning | `LOBBY_HOLD_MS = 90 s` |
| Game socket closes | Hold the seat and its player, mark it away, disarm its normal turn timer | Immediate on detected close |
| Game grace expires | Bot controls that player; append ` (bot)` to the name | `GRACE_MS = 90 s` after detected close |
| Game hold expires | Remove the seat/secret; the game player remains a bot | `HOLD_MS = 10 min` after detected close |
| Last held seat expires | Delete the room and its saved file, close watchers | When no seats remain |
| Connected human takes too long | Make one move for that seat while keeping it human | `TURN_MS = 120 s` |

All these host durations have environment overrides. The drop grace and hold start together when the host
detects the close; the hold is not an additional ten minutes after the grace. During grace, the dropped
player stays human and the bot does not take that player's moves. Other humans can continue wherever the
game permits; the whole game is not paused merely because one seat is away.

When every seated socket is gone, bot progression waits, even if spectators are still watching. Grace
timers can mark players as bots, but `takeOver` does not run them until a seated player returns. The room
survives an all-socket drop until its holds expire. A rematch includes live seats only and removes held
seats, so an absent player's old secret does not retain admission to the new game.

In the lobby, a dropped host hands the role to the first connected seat and does not regain it on return.
During a game, dropping alone does not hand off the role; expiry of the host's seat does. `handOffHost`
chooses a connected seat first, otherwise a held seat. This matters for the host-only rematch action as
well as starting a lobby.

### Detecting a dead connection

The host pings every socket every `PING_MS` (30 s). A pong marks it alive. At the next interval, a socket
that did not answer its preceding ping is terminated, taking the usual held-seat path. Browsers answer
WebSocket pings themselves. For a newly silent socket this normally detects the loss within roughly two
intervals (up to about 60 s), subject to host scheduling. It is one unanswered ping checked at the next
interval, not two unanswered pings. A clean close is detected sooner.

Therefore the default grace can start well after the physical network loss. The nominal time to bot
takeover for an undetected half-open socket can be roughly 60 s detection plus 90 s grace. A suspended
host, delayed timers or network intermediaries can extend that. Source review cannot establish actual
phone or tunnel timing.

### Browser reconnect and reload

`connectTable` retries after unexpected closes using 1, 2, 4, 8, then 15 s waits, capped at 15 s. It targets
a ten-minute retry window. The time limit is checked on socket close, not by an independent deadline
timer, so it is not a strict ten-minute cutoff for a socket stuck connecting or open without a reply.
The host hold and browser retry window also begin at different observed closes. The shorter lobby hold
can expire while the browser is still retrying.

The rejoin hello is sent once per new socket. Messages queued while the connection was down are discarded
on rejoin, preventing an old roll or placement from replaying into the returned state. `wake()` cancels a
pending backoff and dials immediately when the browser reports `online` or becomes visible; it does not
replace an existing live or connecting socket.

After a mid-game drop, the store keeps the board state and displays `Reconnecting… (try N)`. On welcome
it keeps `screen: "play"`, preserving mounted game UI. Other players see an away marker and reconnecting
seat facts. This is distinct from a cold reload: `EmberisleApp` calls `rejoinTable()` on mount, the first
welcome briefly sets the lobby, and the following state moves it to play.

The browser remembers `{code, secret}` in `localStorage` under `emberisle-seat`. It survives reloads and
closed tabs in the same browser storage origin. Blocked storage is caught: live reconnect still works,
but a reload cannot recover the secret. There is one saved seat, not a per-table or per-host collection.
It does not provide recovery on another device, another browser or a different site origin. `hostUrl`
uses `?host=` first, the development host on port 8787 next, or the built page's own origin; the saved
record contains no host URL. Stable page/host routing is therefore part of the real-device gate.

A fresh automatic rejoin refused with `Seat is taken.` stops, shows `Your seat is open in another tab`
and preserves the saved secret. It does not automatically claim the seat later. The same reply after an
established connection drops is treated as a possible half-open old socket and keeps backing off. A
missing room, expired seat or ordinary retry give-up clears the saved seat. A stale saved seat on page
load fails quietly; an established connection that gives up shows `Lost the table`.

`goTitle` clears the seated player's saved secret and closes the client intentionally. The host still
receives an ordinary close and holds that seat until expiry; there is no distinct leave message that
immediately frees it. The source comment saying intentional exit "frees the seat" describes the browser's
choice to forget it, not current host behavior. Spectators have no seat secret, do not retry their own
drop, and preserve any saved player seat belonging to another table.

### Host restart

`save` writes game state, chat, seat identity/secrets and host role to `server/rooms/<code>.json` (or
`ROOMS_DIR`) using a temporary file and rename. On boot, `load` restores compatible room files saved less
than 24 hours ago. Current `ROOM_SHAPE` is 2; files from another shape are discarded. Saves can fail and
are logged, so restoration depends on a successful disk write and the same persistent directory.

Restored sockets, watchers, avatars, open trade offers and timers are absent. Seats are held anew at boot,
so their grace/hold periods restart rather than deducting downtime; lobby Ready flags are cleared.
Players with their saved secrets can return to the saved game. This is not a promise that a room stays
available for 24 hours during normal running: live hold expiry still deletes it.

Welcome already carries retained chat on rejoin/restart. The separately authorized chat task requires the
last 30 lines after a mid-game reload and a check in `chat-prove`; that acceptance check should determine
the new history limit. Reactions are transient and cleared on welcome. Neither historical mentions of
chat recovery nor the seat-reload proof below establish the new 30-line browser gate by themselves.

## Existing proof coverage and limits

These are coverage statements from reading the scripts; no commands were run for this docs-only refresh.

| Proof | What its checks cover |
|---|---|
| `server/rejoin-prove.mjs` | Unique secrets, away/no move during grace, same seat/player on return, cancelled grace, duplicate/wrong secret rejection, return after bot takeover, all sockets closed, hold expiry, silent ping termination, lobby hold/Ready/start refusal, lobby host handoff |
| `server/reconnect-prove.mjs` | Fake-socket retries, failed first dial sends one hello, duplicate tab keeps secret, half-open old seat retries, queued move discarded, seat gone/give-up, wake during pending backoff |
| `server/persist-prove.mjs` | Saved host killed and restarted, same seat/game sequence and retained chat, stale/incompatible files rejected, watchers absent, restored lobby cannot start while away |
| `server/watch-prove.mjs` | All seated players away: bot progression waits despite live watchers; returning players become human again |
| `scripts/tabs-prove.mjs` | Separate browser contexts; three-second offline period plus explicit socket drop; same player on return, game UI stays mounted; another tab reloads from storage into its seat; table synchronized afterward |
| `scripts/client-prove.mjs` | Stale automatic rejoin fails quietly and pre-join peek does not interfere with a pending held-seat rejoin |

`tabs-prove` explicitly drops its socket because Chromium can keep an existing socket open under
`context.setOffline(true)`. This exercises retry behavior and the offline period, not detection of a
locked phone's half-open socket. The fake socket proof does not reproduce radio handoff, browser process
eviction, background timer throttling or a Cloudflare restart. Those remain a real-device gate.

## Handoff and test gate

For a future implementation change, retain the existing defaults unless a reviewed design changes them.
Run the affected host/reconnect/persistence proofs with their existing isolated room directories and
shortened timers; run `tabs-prove`/`served-prove` when browser reconnect behavior changes. Add acceptance
coverage for a new behavior rather than treating this research refresh as test output.

Jarrod's #197 gate should use the current served build and the actual online address: a phone locks and
returns, a device changes Wi-Fi or switches to mobile data, a tab reloads, all seated clients lose the
tunnel together, and the host process restarts with the same room directory. Record device/browser,
URL/host routing, elapsed physical loss and detected loss, return time, same seat/player identity, away
marker, whether a bot moved, state convergence and the next legal player action. Include return inside
grace, after grace but inside hold, expiry, and the second-tab refusal. Complete a game after recovery.
Automated local checks alone do not satisfy that gate.

Follow-up decisions require evidence: are the existing 90 s grace, ten-minute game hold and 90 s lobby
hold suitable for real phones; should intentional exit free a seat immediately; is recovery needed across
devices/origins; and should an in-flight connection have a strict retry deadline? None is implemented or
approved by this note. The old proposal for a drop-grace countdown is also not present: the current
countdown describes the separate connected-player turn window.

`connection.md` still says lobby drops free seats and the browser does not use rejoin secrets; those
sentences conflict with current code. Its Unreal-era URL/config description and the historical
`online-client.md`/L16 notes also need their own scoped documentation refresh. They are cited here as
history, not as the current online contract.

```text
done: #114 research reconciled with the current host and browser recovery paths; original #183 preserved as history
left: real phone/network evidence for #197; review the explicit behavior gaps above; refresh stale design docs separately
broke: nothing; docs only, no runtime changes and no new proof run
next agent: Claude reviews this research before any implementation; Jarrod performs the real-device gate
```
