# Research: a dropped player sits back down in their seat (issue #183)

- step: 1 Research, node #183 (covers #113 and #114), parent #72
- date: 2026-10-02
- agent: Claude

## What I read

`server/host.mjs` (`openTable`, `sitDown`, `leave`, `broadcast`, `pushState`, `runBots`, the `rooms` map);
`src/lib/net/table.ts` (`connectTable`, `ws.onclose`); `src/lib/game/store.ts` (`connect`, the `closed` handler,
`goTitle`); `src/components/game/EmberisleApp.tsx` (`Title`, `Lobby`); `scripts/tabs-prove.mjs`;
`docs/research/L16-serve.md` ("WebSockets through Cloudflare"); `docs/design/connection.md` ("Reconnect: v1 has none");
the `ws` package README on `ping()` and the `pong` event; the Playwright docs on `BrowserContext.setOffline`.

## What is true

### Today one blip ends a friend's game

- `leave()` runs on every socket close. In a game it replaces the player with a bot for good
  (`kind: "bot"`, name gets " (bot)") and calls `runBots`, so the bot may act within milliseconds of the drop.
  Nothing lets the player return: `sitDown` refuses once `room.game` exists ("Game already started.").
- When the last socket closes, the room is deleted. Four phones losing the tunnel at the same moment
  (Cloudflare restarts, see L16) deletes the game.
- The client treats any close it did not ask for as fatal: `closed` sets `screen: "title"` and `state: null`.
  A page reload is the same as a drop.
- The host sends no pings. A half-open socket (phone locked, Wi-Fi changed) can sit undetected until the OS
  gives up, so the table waits on a player who is not there, and the player's tab does not know either.
- Seat ids (`s0`…) and the room code are public to everyone at the table, so neither can prove who a
  returning socket belongs to.

### What the four pieces are

1. **A rejoin secret and a held seat (host).** `welcome` carries a per-seat `secret` (16 random bytes, hex).
   `hello {code, secret}` reattaches a socket to that seat. In a game, `leave()` keeps the seat and the player:
   the socket is marked gone, the table says "<name> lost connection", and two timers start. After a **grace of
   90 s** the player becomes a bot and `runBots` runs, so the table never waits more than that. After a **hold
   of 10 min** the seat is dropped. A rejoin inside the hold restores the human (and the name) at once, even
   after the bot took over. A room is deleted only when it has no live and no held seats. Lobby behaviour is
   unchanged: a seat that leaves the lobby is freed. Child: #195.
2. **A keepalive ping (host).** `ws.ping()` every 30 s with the `isAlive` pattern; one missed pong (no answer
   by the next ping) means `terminate()`, which runs the normal `leave()` path. Browsers answer pings without any client code. This
   also makes Cloudflare's unstated idle timeout irrelevant (L16). Child: #113 (already filed; comment there
   has the shape).
3. **Reconnect with backoff (client).** `connectTable` reopens the socket after an unexpected close with
   1, 2, 4, 8, then 15 s waits for up to 10 min, and sends `hello {code, secret}`. The store shows
   "Reconnecting…" instead of leaving the game, remembers `{code, secret}` in storage, and auto-rejoins on page
   load. The rail shows who is reconnecting. Child: #196.
4. **The real test.** A phone that locks and a laptop that switches Wi-Fi, over the tunnel, both finish the
   game in their own seats. Needs Jarrod. Child: #197.

Pieces 1 and 2 are independent. Piece 3 needs 1. Piece 4 needs all three and #88.

### Why these numbers

- Grace 90 s: longer than a phone unlock, a Wi-Fi handoff, or a Cloudflare restart plus the client's first
  few retries (1 + 2 + 4 + 8 = 15 s to the fifth attempt). Shorter than the point where three friends start
  to grumble. The turn banner should say "waiting for <name> (60 s)" so the wait is visible.
- Hold 10 min: covers a phone reboot or a router restart. After that the seat stays a bot, which is today's
  behaviour, just later.
- Ping 30 s, two misses: a dead socket is gone within about 60 s, before the grace ends, so the bot takeover
  timer starts from a real detection and not from the OS's own timeout.
- Backoff cap 15 s: fast enough that a returning player is back within one roll, slow enough not to hammer
  the tunnel while it is restarting.

### Where the secret lives on the client

`#114` suggested `sessionStorage`, which survives a reload but not a closed tab, and phones close tabs on
their own. `localStorage` survives both. The host's "Seat is taken." reply (a rejoin while the seat's socket
is still open) stops two tabs from fighting over one seat. Recommendation: `localStorage` under one key
(`emberisle-seat`, holding `{code, secret}`), cleared on `goTitle`, on `closed` after the 10-minute give-up,
and on `No table with that code`.

### How the proofs can run in CI

- Host side (`server/rejoin-prove.mjs`): raw `ws` sockets, as `table-prove.mjs` does. Start the host with
  `PING_MS`, `GRACE_MS`, and `HOLD_MS` env overrides so the timers run in milliseconds. Cases: rejoin with the
  same `you`; "Seat is taken."; the table does not move during the grace; the bot takes over after it; the room
  survives all sockets closing at once.
- Browser side (`scripts/tabs-prove.mjs`): Playwright's `context.setOffline(true)` drops the socket the way a
  real blip does and `page.reload()` covers the refresh case. Each tab needs its own `BrowserContext` so
  `setOffline` and storage are per tab (today all three tabs share one context).

## What I am not sure about

- Whether the bot should act at all during a short drop. The grace above says no for 90 s, then yes. The
  alternative (bot acts at once, human takes back on return) never stalls the table but can spend a
  player's cards on a move they did not choose. Design (#195) should keep the grace unless Jarrod prefers speed.
- The exact grace and hold lengths. Both should be constants at the top of `host.mjs`, overridable by env for
  the proofs, so game night can tune them without a code change.
- Whether the host seat should return to a rejoining host. Today `leave()` hands `room.host` to the first
  remaining seat. The host role only matters before `start`, so leaving it where it lands is fine.
- `setOffline` in Playwright affects the whole context; the three-context change to tabs-prove is small but
  touches every existing case in that script.

## Prove output

(research gate — no command)

## Handoff

```
done: the four pieces, their sizes, the numbers and why, and how each proves itself in CI; filed #195, #196, #197 (and #113 reused)
left: #195 is the first leaf (Todo). #113 can run in parallel. #196 after #195. #197 after all three, needs Jarrod.
broke: nothing
next agent: #195
```
