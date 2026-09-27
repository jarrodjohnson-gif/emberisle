# Host-button connection (issue #41)

Sources: build bible 2.2 and 10, and `server/host.mjs`.

## Where ServerUrl comes from

At startup, the first match wins:

1. `Saved/Config/host.txt`, first line, trimmed. The gear screen writes this file.
2. `-server=<url>` on the command line, for testing two clients on one PC.
3. The baked default `ServerUrl` in `DefaultGame.ini` under `[/Script/Emberisle.EmberisleSettings]`. That is the named-tunnel hostname from #60.

Turn `https://` into `wss://` and `http://` into `ws://`. The socket path is `/`, and avatars are `<ServerUrl>/avatars/<id>.jpg`.

## First message

The first frame on a new socket is always `hello`:

| Screen | Sends | Server answers |
|---|---|---|
| Host → Open table | `{ "type": "hello", "name", "color", "avatarId" }`, no `code` | `welcome { code, you, host: true }`, then `seats` |
| Join → Sit down | `{ "type": "hello", "code", "name", "color", "avatarId" }` | `welcome { code, you, host: false }`, then `seats`. Or `error`: "No table with that code", "Table full.", "Color taken.", or "Game already started." |

`create` and `join` still work as aliases for older test clients.

## After hello

| Server → client | Client does |
|---|---|
| `seats { code, seats[] }` | Redraw the lobby seats. `host: true` marks the host's seat. |
| `log { text }` | Show it on the lobby line, or the game log after start. |
| `state { you, game, legal }` | `you` is your game player id (`p0`..`p3`). `game` is `GameState`. Others' fortunes are zeroed and counted in `fortunes`, `deck` is empty, and `deckLeft` is the count. `legal` is what you may do now (see [placement.md](placement.md)). |
| `rolled { dice, sum, gains[] }` | Dice animation ([dice.md](dice.md)). |
| `tradeOffer { tradeId, from, give, want, seconds }` / `tradeClosed { tradeId }` | Trade toast |
| `error { message }` | Show it for 2 s and play `ui_error`. State did not change. |

Before `start`, seat ids are `s0`, `s1`, and so on. After `start`, `state.you` is the id to use.

## Reconnect

v1 has none. If the socket drops, show "Lost the table", play `ui_error`, and go back to the main menu. Closing the socket frees the seat.

## Test

Run `cd server && npm install && npm run host`, then `npm test`. `table-prove.mjs` is a text-only client that does hello, joins, readies, starts, places, and rolls.
