# Design: a spectator seat that watches and cannot play (issue #346)

Source: [docs/research/spectator.md](../research/spectator.md) (#311), `server/host.mjs` (`viewFor`, `legalFor`, `broadcast`,
`pushState`, `publish`, `handle`, `leave`, `dropRoom`, `load`, `save`), `src/lib/net/table.ts`, `src/lib/game/store.ts`
(`connect`, `welcome`, `state`), `Hud.tsx`, `Chat.tsx`, `WinScreen.tsx`, `TradeToast.tsx`, `PlayerMenu.tsx`,
`src/lib/turn-title.ts`, [rematch.md](rematch.md) (#266), [first-player.md](first-player.md) (#232).

## Decisions

Jarrod, 2026-10-03 (issue #311 and #346):

| Question | Decision |
|---|---|
| What does a watcher see? | The opponent view: the board, public counts and chat. No hands, no hidden points. |
| Can a watcher talk? | **No.** It receives chat and reactions and sends neither. |
| When can a watcher join? | **Only after the game starts.** A watch request before start is refused. |

Defaults this design adds (each is cheap to change):

| Item | Default | Why |
|---|---|---|
| `SPECTATOR_MAX` | `8` per room | See "Cap". |
| Anything a watcher sends after its hello | Refused with one error, `Watching only.`, and changes nothing | Explicit beats the accidental "not ready" a seatless socket would get today. |
| A watcher's presence | Silent. No log line, no count on the seats | Smallest step. See "Open question". |
| Final hands at the win | **Not** revealed to a watcher | The #346 completion test says no hand, hidden point, deck, seed or rng "before or after a win". See "The view". |
| Reconnect | None. A dropped watcher lands on the Title | It holds nothing worth saving. |

## Protocol

### The one message a watcher sends

```
{ "type": "hello", "code": "K7QP", "watch": true }
```

`watch` must be exactly `true`. Any other `hello` is the existing join, rejoin or open. Extra fields (`name`, `color`,
`avatarId`, `secret`) are ignored: a watcher has no name, colour, picture or seat. The code is upper-cased as `sitDown`
does. Nothing else is a valid first message; a watcher sends nothing after it.

### Refusals of the watch hello

Each is `{ "type": "error", "message": <string> }`. The socket stays unseated and unwatching, and the room changes in
no way. The client closes it (store `error` handler, `kind === "normal" && !welcomed`).

| Order | Check | Exact string | New? |
|---|---|---|---|
| 1 | `ws.bucket` empty (5 burst, 1 a second, the pre-seat bucket) | `Slow down.` | no, the existing line in `handle` |
| 2 | No room with that code, or no code | `No table with that code` | no, `sitDown`'s string |
| 3 | `room.game` is `null` (the lobby) | `Not started yet.` | yes |
| 4 | `room.watchers.size >= SPECTATOR_MAX` | `Table is full to watch.` | yes |

- `hello {watch:true}` with **no code** is check 2. It must never reach `openTable`: today a `hello` with no code opens a
  table, so the watch branch sits above that line.
- "Started" means `room.game !== null`. That includes the #232 roll-off (the game exists from `start`) and a game that is
  `over`. A room restored from disk with every seat held is also watchable (the board is frozen until a seat returns).
- `Not started yet.` is for a **lobby**. A lobby has no `state` to give and its screen is a seat-taking screen. The peek
  (`docs/design/color-peek.md`) is unchanged and still answers `seats: []` for a started room.

### What a watcher receives

On success the host sets `ws.watch = room`, adds `ws` to `room.watchers` (leaving `ws.room` and `ws.seat` unset), and
sends, in this order and with no log line to the table:

| # | Message | Content |
|---|---|---|
| 1 | `welcome` | `{ type: "welcome", code, spectator: true, chat: room.chat }`. **No** `you`, `host` or `secret`. |
| 2 | `seats` | `{ type: "seats", code, seats: seatsOf(room) }`, so the rail has names, colours, pictures and away marks at once. |
| 3 | `state` | `{ type: "state", you: null, game: closedView(room.game, null), legal: legalFor(room.game, null) }` |

After that a watcher gets, unchanged, every message `broadcast` sends to the seats: `seats` (each `publish`), `log`, `chat`,
`react`, `rolled`, `tradeOffer`, `tradeDeclined`, `tradeClosed`. It gets a `state` on **every** `pushState`, with the same
`game.seq` the seats get. Those are all public already (research, "Hidden info leaves only in `state`"). A trade offer's
`give` and `want` are public by design.

`legalFor(game, null)` finds no `me` and returns all-empty lists, so a watcher never has a legal action or a Roll.

One more message, the last: when the room is dropped (`dropRoom`), each watcher gets
`{ "type": "error", "message": "The table closed." }` and the host closes the socket.

### What a watcher may send after its hello: nothing

**Refused, not ignored.** The first line of `handle`, before the JSON parse:

```
if (ws.watch) {
  if (!allow(ws.bucket, Date.now())) return;                       // over the burst: silent, no reply to a flood
  return send(ws, { type: "error", message: "Watching only." });
}
```

- It sits above the parse and above `if (!ws.room)`. A watcher has no `ws.room`, so without this line its `hello`, `join`
  or `create` would reach `sitDown`, `rejoin` or `openTable` and could seat it or open a table. A `hello {code, secret}`
  from a watcher must not rejoin a seat.
- That covers `intent` (`roll`, `place`, `buy`, `play`, `rob`, `discard`, `tradeBank`, `pass`), `chat`, `react`, `ready`,
  `start`, `again`, `tradeAsk`, `tradeAnswer`, `peek`, a second `hello`, junk JSON and any unknown type. All get
  `Watching only.`; none changes `room`, `game` or `game.seq`.
- Over the bucket the host says nothing. A refusal to every frame of a flood is a reply amplifier; one error per second
  is enough for a confused client.
- A **seated** socket that sends `hello {watch:true}` is unchanged: it already has `ws.room`, so it falls to `play` and
  gets `not ready`.

### Error strings, all together

| String | When | New? |
|---|---|---|
| `Slow down.` | Watch hello over the pre-seat bucket | no |
| `No table with that code` | Unknown or missing code | no |
| `Not started yet.` | Watch hello to a lobby | **yes** |
| `Table is full to watch.` | Watcher cap reached | **yes** |
| `Watching only.` | Any message from a watcher | **yes** |
| `The table closed.` | Room dropped under a watcher | **yes** |

## The view

`viewFor(game, null)` is already the opponent view **until the game ends**. At `phase === "over"` it returns
`{ ...game, deckLeft }`: every hand, every hidden point, the `deck`, the `seed` and the `rng`, to every seat (#111). A
watcher must not get that, because the #346 completion test says it never receives them "before or after a win".

So the over branch is split out, with no change for seats:

- `closedView(game, you)`: the body `viewFor` has today after the `over` early return (strips `seed` and `rng`, empties
  `deck`, turns every other player into counts and zeroed `hidden` and `boughtThisTurn`).
- `viewFor(game, you)`: `game.phase === "over" ? { ...game, deckLeft } : closedView(game, you)`. Behaviour identical.
- A watcher always gets `closedView(game, null)`, before and after the win. `winner` and `phase: "over"` are still in it,
  so the win screen knows who won.

`pushState` builds the watcher string **once** per push (`JSON.stringify` of the state message) and sends that one string
to every watcher.

What this means for the win screen: a watcher knows the winner and every public fact (buildings, longest path, largest
army, public points) but not the winner's hidden points. See "Client". Known limit: the engine's log line
`<name> claims the isle with <N> points.` (`rules.ts` `checkWin`) names the winner's total, and `N - publicVP` is the
hidden points. That line is in `game.log` and `log` for **every** seat today and is a public announcement, so the proof
asserts the structured fields (`hidden`, `resources`, `deck`, `seed`, `rng`), not log text.

## Host (`server/host.mjs`)

### Data

| Name | Where | What |
|---|---|---|
| `SPECTATOR_MAX` | module const, `Number(process.env.SPECTATOR_MAX ?? 8)`, next to `ROOM_MAX` | Watchers per room. `0` turns watching off (every watch hello gets `Table is full to watch.`). |
| `room.watchers` | `openTable`'s room literal **and** `load()`'s rebuilt room (`watchers: new Set()` in both) | `Set` of watcher sockets. Memory only. |
| `ws.watch` | set on the socket | The room it watches, or unset. `ws.room` and `ws.seat` stay unset. |

A watcher has no seat, no `secret`, no `pid`, no name. It is in no `room.seats`, so `seatsOf`, `save`, `hold`, `takeOver`,
`letGo`, `handOffHost`, `startGame`, `rematch` and the test `room.seats.some((s) => s.ws)` cannot see it.

### Changes by function

| Function | Change |
|---|---|
| `handle` | Two additions. (1) The `ws.watch` line above. (2) In the `!ws.room` branch, after the throttle line and before `create`/`hello`-with-no-code: `if (msg.type === "hello" && msg.watch === true) return watch(ws, msg)`. |
| `watch(ws, msg)` (new) | The four checks in order, then add to `room.watchers`, `ws.watch = room`, send `welcome`, `seats`, `state`. |
| `broadcast` | After the seats loop, the same `raw` goes to every open socket in `room.watchers`. This one change delivers `log`, `chat`, `react`, `rolled`, `trade*` and `seats` to watchers. |
| `pushState` | After the seats loop, send the shared watcher `state` string to `room.watchers`. |
| `viewFor` | Split as above. |
| `leave` | First line: `if (ws.watch) { ws.watch.watchers.delete(ws); return; }`. Nothing else: no `say`, no `publish`, no `hold`. |
| `dropRoom` | Send `The table closed.` to each watcher, close it, `room.watchers.clear()`. |

`save` writes an explicit field list, so `watchers` and `ws.watch` are **never saved**. No `ROOM_SHAPE` bump.

### Cap: `SPECTATOR_MAX` default 8

- A table seats 4, and the people most likely to watch are friends waiting for a seat, family on a couch, or a streamer's
  audience of a few. 8 is two tables' worth: enough that the common case never meets the cap, small enough that a leaked
  code cannot turn one room into a broadcast.
- Cost is small: one JSON string per push, written to each socket. 64 rooms x 8 is 512 sockets at the worst, on top of 256
  seats, which `ws` on a home PC carries easily.
- It is an env knob like `ROOM_MAX`, so Jarrod can raise or zero it without a code change. The default is a judgement, not
  a measurement; nothing breaks if it is wrong.

### `ROOM_MAX`

`ROOM_MAX` counts **rooms** (`rooms.size`, checked only in `openTable`). A watcher never creates a room and never
counts toward it. `SPECTATOR_MAX` bounds watchers per room. `harden-prove.mjs` gets a case: fill `ROOM_MAX` rooms, add
watchers, and a further `create` still gets `The host is full.` while the watchers stay.

### Interactions

| Feature | Behaviour |
|---|---|
| **Lobby hold (#280)** | None. Watchers exist only after `start`, so they never meet `LOBBY_HOLD_MS`. A held lobby seat is `ws = null`, `away: true`; a watcher sees that only as `away` in `seats`. |
| **Game hold and bots** | Unchanged. `hold`/`takeOver`/`letGo` act on seats. `takeOver`'s "with nobody connected, the bots wait" test is `room.seats.some((s) => s.ws)`: a connected watcher does **not** count, so a table with only watchers left waits exactly as an empty one does. A watcher never keeps a room alive: `dropRoom` fires when the last seat is let go. |
| **Turn timer (#344)** | Arms for a seat the game waits on, picked from `game.players` and `room.seats`. A watcher is in neither, so it can never be picked and never resets a timer. `turnDeadline` rides the game object or a `broadcast`, so a watcher gets it free and the #345 countdown can show on it. If #344 sends it with its own loop over `room.seats`, that loop must also send to `room.watchers`; #347 checks this when it rebases. |
| **Roll-off (#232)** | The game exists from `start`, so a watcher may join during `rollOff`. The roll-off dice are public state and reach it; `legalFor(game, null)` has no `roll`, so it never has a Roll. The `players` reorder at resolution reaches it as an ordinary `state`. |
| **Rematch (#266)** | `again` from a watcher is `Watching only.`. In `rematch`, `live` is seats only, so watchers do not count toward the 3-or-4 and are not let go. The new game reaches them through `pushState`; they stay and watch it. The new seed is fresh, so nothing carries over. |
| **Host handoff** | A watcher is never host and never inherits it. |
| **Trades** | A watcher sees `tradeOffer`/`tradeDeclined`/`tradeClosed` as a read-only toast. It cannot answer: `tradeAnswer` is `Watching only.`. |

### Room deletion and persistence

- A room is dropped when its last seat is let go (`letGo` then `dropRoom`). Watchers get `The table closed.`, then the
  socket closes. Nothing else ends a watcher.
- Watchers are **never saved**: `save` does not read `room.watchers`. A host restart closes every watcher socket; `load()`
  gives each restored room an empty `watchers` set. A watcher must watch again.
- The pinger already covers watchers (they are in `wss.clients`). A dead one is terminated, `close` fires, `leave` removes
  it from the set.

## Client

### `src/lib/net/table.ts`

- New `watch: (code) => send({ type: "hello", code: code.toUpperCase(), watch: true })`, beside `join`.
- `welcome`'s type: `you`, `host` and `secret` optional, `spectator?: true` added. No `secret` means `seat` is never set,
  so there is **no redial**: a dropped watcher ends in `closed(false)` and lands on the Title.

### `src/lib/game/store.ts`

| Change | Detail |
|---|---|
| `spectator: boolean` | `false` at start. Set from `welcome.spectator`. Reset to `false` in `connect` (every other kind), `goTitle` and `closed`. |
| `watchTable(code)` | `connect(set, get, (t) => t.watch(code), "watch")`. A new `ConnectKind`. |
| `welcome` for a spectator | Sets `code`, `spectator: true`, `seatId: ""`, `isHost: false`, `chat`, `reactions: []`, `unread: 0`, `error: null`. It does **not** set `screen`: there is no lobby for a watcher. The first `state` moves it to `play` (`loadState`). It never calls `rememberSeat`. |
| `state` with `you: null` | `hear(...)` and `loadState(game, you ?? "", ...)`. `localId` is `""`, which matches no player, so the your-turn chime never fires and every `actor` test is false. |
| `closed` | For `kind === "watch"`, **do not call `rememberSeat(null)`**. That call erases the saved seat secret in `localStorage`; a person with a seat saved for another table who then watched and dropped would lose their seat. Show `Lost the table` and go to the Title, as now. |
| Seat-only actions | `dispatch`, `sendChat`, `sendReact`, `askTable`, `answerTrade`, `setReady`, `startTable`, `openMenu` return at once when `spectator`. Defence in depth: the UI hides them first. |

### Title (`EmberisleApp.tsx`)

- **Watch** button on the join card, in the same row as the code field and **Join** (a second `type="button"`, variant
  `outline`, label "Watch"). Enabled at 4 characters, like Join. It calls `watchTable(join)`. No name or colour is needed.
- `?watch=CODE` (`PEEK_CODE`-checked, upper-cased) fills the code field and removes itself from the URL exactly as `?code=`
  does (#304), and sends nothing until a button is pressed. It makes **Watch** the primary (`variant="sea"`) button and Join
  the outline one for that visit. It also means a reload does not re-watch.
- Errors show in the existing `role="alert"` line with the host's strings. A watch of a lobby reads `Not started yet.`

### In the game (`spectator === true`)

Every item is hidden **by the flag**, never by relying on `localId` matching nothing. In particular `Hud.tsx` today does
`state.players.find((p) => p.id === actor) ?? state.players[0]`, so a watcher would be shown seat 0's hand bar and buttons
through that fallback. The `spectator` branch is taken before `me` is derived.

| Part | Watcher sees |
|---|---|
| Header | A **Watching** badge (`data-testid="watching-badge"`) next to the table code. The leave button stays and says Leave. |
| Hand bar, resource tiles, price chips | **Not rendered.** No `resource-*` test ids in the DOM. |
| Build buttons, Roll, Pass, Buy, Trade, knight, discard bar | **Not rendered.** |
| Board | Renders; no legal glow (`legal` is empty and `buildMode` is `none`); no place chip. |
| Rail / seat strip | Every seat as an opponent card with counts, colour, picture and away mark. |
| Trade panel | Not rendered. A `tradeOffer` shows as `TradeToast` with no Accept or Decline. |
| Player menu | Not openable (its actions are trade, steal and reactions). |
| Dock (`Chat.tsx`) | **Read-only.** The chat log and the Chat/All filter (with Copy log) stay. The preset chips, emote tray and input are replaced by one muted line, "Watching - chat is read-only" (`data-testid="chat-readonly"`). The unread count still works. Floating `reaction`s still show. |
| Chat line | `useMyName` returns `""` for a watcher, and `Line` then renders plain text. (`Mention` would otherwise `split("@")` on an empty name.) The typed Title name must not highlight mentions either. |
| Banner / HUD sentence | The turn line names the current player ("Ember's turn"); never "Your turn". |
| Tab title | `Watching - Emberisle` while on the play screen, never the your-turn title (`turn-title.ts`). |
| Sound | Table sounds (win, dice, builds) play as for a seat. No your-turn chime. |
| Win screen | The headline, `Look around` and `Back to menu`. The table has Player, Outposts, Strongholds, Longest path, Largest army and **Public points** (`publicVP`); the Hidden column and the Total are not shown, and a line says "Hidden points are not shown to watchers." No `Play again` and no host-waiting line. When the host starts a rematch, the new `state` clears the panel and the watcher keeps watching. |

## Test plan for #349

`server/table-prove.mjs` (already in `npm test`), raw sockets, in this order. A step does not start until the one before
it passes.

1. **No hidden info reaches a watcher.** Connect a watcher to a started table and record **every** message it receives
   from `welcome` through the win (a bot-driven game to `over`) and after it. For every message, and every `state`:
   - no player has `resources`; every `hidden` and `boughtThisTurn` value is `0`; `deck` is `[]`; `seed` and `rng` are
     absent (also after `phase === "over"`, where a seat's own `state` has them); `legal` is all-empty;
   - `welcome` has no `secret`, `you` or `host`;
   - the `state.game` equals `closedView(game, null)` of the host's own game, and a seat's `state` for the same `seq` shows
     that seat's own hand while the watcher's does not;
   - no message anywhere contains the string value of any seat's `secret`.
2. A fifth socket joins a full (4 seat), started table: `welcome {spectator:true}`, then `seats`, then `state`.
3. It gets every `state` the four seats get, with the same `seq`, and the `log`, `chat`, `react`, `rolled` and `tradeOffer`
   family.
4. Refusals: before any of these, a lobby gives `Not started yet.`, an unknown code `No table with that code`, and
   `hello {watch:true}` with no code leaves `rooms.size` unchanged (it does not open a table). Then every intent (`roll`,
   `place`, `buy`, `play`, `rob`, `discard`, `tradeBank`, `pass`), `chat`, `react`, `ready`, `start`, `again`, `tradeAsk`,
   `tradeAnswer`, `peek`, junk JSON, a second `hello`, and `hello {code, secret}` with a real seat's secret, each get
   `Watching only.`, and `game.seq`, `room.chat` and the seats are unchanged. That secret `hello` does not take the seat.
5. A flood from a watcher gets at most the burst of replies, then silence.
6. A ninth watcher gets `Table is full to watch.`; with `SPECTATOR_MAX=0` the first does.
7. Watchers do not count toward `ROOM_MAX` (`harden-prove.mjs`): with `ROOM_MAX` rooms open and watchers on them, a new
   `create` is `The host is full.`, and the watchers stay connected.
8. Closing every watcher changes nothing for the seats: no `seats`, `log` or `state` goes out, no seat marked away.
9. With every seat dropped and one watcher connected, the bots wait as they do with nobody connected; the game `seq` does
   not move past the grace.
10. `dropRoom` (let go the last seat): every watcher gets `The table closed.` and its socket closes.
11. `server/persist-prove.mjs`: with a watcher connected, the saved room file has no watcher data; after a restart the
    room has an empty `watchers` and the old watcher's socket is closed.
12. Rematch (if #266 has merged): a watcher gets the new `state`; its `again` is `Watching only.`.
13. Roll-off (if #232 has merged): a watcher joins during `rollOff` and sees the dice; `legal` has no `roll`.
14. Turn timer (if #344 has merged): a watcher connected and every seat idle; the timer acts only for seats, and the
    watcher receives `turnDeadline`.

`scripts/client-prove.mjs`, a spectator tab on a started 4-seat table, in this order:

1. No hand bar: no `resource-*` ids in the DOM, while seat 0 (who has cards) has them in its own tab. This is the
   by-flag-not-fallback check.
2. Zero enabled game controls: no build, roll, pass, buy, trade or knight button; no `place-chip`; `chat` has no input and
   no emote tray; a seat click opens no menu.
3. The board and every seat's counts render, the **Watching** badge is shown, and the tab title is `Watching - Emberisle`.
4. At the win: the headline names the winner, there is no Hidden column and no `Play again`.
5. A watcher dropped by closing the host lands on the Title with `Lost the table`, and the saved seat in `localStorage`
   of a tab that holds one is untouched.
6. The Title: Watch is enabled at 4 characters; `?watch=CODE` fills the field and leaves the URL.
7. Zero console errors throughout.

Plus `npm run typecheck && npm run build` and the repo's `npm test` and `npm run client-prove`, from a fresh clone.

## Open question for Jarrod

**Should the players know someone is watching?** The default here is silent: no log line, no count. Anyone with the 4-letter
code can watch, and players will not see them. If you want a notice, the smallest step is a log line "A watcher joined"
and a "Watching: N" count on `seats`. It touches `seats`, the rail and the proof, so it is a separate child if you want it.

## README

This design changes no rule of the game, and this PR does not edit the README. When #347 lands, `docs/BUILD_BIBLE.md`
section 10 gets the `hello {watch:true}` entry and the three new messages above, as a protocol doc.
