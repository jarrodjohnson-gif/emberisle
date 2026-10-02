# Design: a rematch that keeps the table and gives the winner first seat (issue #265)

Source: [docs/research/rematch.md](../research/rematch.md) (#150), `server/host.mjs` (`handle`, `startGame`, `letGo`,
`pushState`, `save`), `createGame` in `board.ts`, `src/lib/net/table.ts`, `src/lib/game/store.ts`,
`src/components/game/WinScreen.tsx`, [first-player.md](first-player.md) (#149). Jarrod, 2026-09-27: "winner gets to go
next first if the game continues."

## Decisions

The research note left four open items. Each has a default here.

| Open item | Default | Why |
|---|---|---|
| Consent | Host-only `again`. No second ready round. | Everyone is on the same win screen. "Back to menu" is the opt-out. |
| Fewer than 3 at the table | Error, nothing changes. No path back to the lobby. | A lobby path is a bigger change. The host opens a new table. |
| Practice and hotseat | Hotseat yes. Practice no. See "Hotseat". | |
| Third game | The winner of the last game sits first, every time. | "If the game continues" reads as every rematch. |

## The message

`{ "type": "again" }`. No fields. Host only. Sent from the win screen.

## Host (`server/host.mjs`)

### Where it goes in `handle`

```
if (msg.type === "start") return room.game ? ... : startGame(ws, room);
if (msg.type === "again") return rematch(ws, room);      // new line, right after `start`
if (msg.type === "chat" || msg.type === "react") return talk(ws, room, msg);
if (!room.game) return send(ws, { type: "error", message: "not ready" });
```

It must sit above the `!room.game` line. Below it, `again` would fall through to `play` and `toAction` would answer
"not ready". `rematch` checks `room.game` itself, so it is safe above that line.

### Steps of `rematch(ws, room)`

| # | Step | On failure |
|---|---|---|
| 1 | `ws.seat.id === room.host` | error `Only the host can start.` |
| 2 | `room.game?.phase === "over"` | error `Game is not over.` |
| 3 | `live = room.seats.filter(s => s.ws?.readyState === OPEN)`; `live.length >= 3` | error `Need 3 or 4 at the table.` |
| 4 | Let go of every seat not in `live`: `clearTimeout` both its timers, remove it from `room.seats`. | |
| 5 | Order `room.seats`: the seat whose `pid === room.game.winner` first, the rest in their current order. If the winner's seat was let go in step 4, keep the current order. | |
| 6 | `closeOffer(room)`. | |
| 7 | `game = createGame({ humans: room.seats.map(s => ({ name: s.name })), bots: 0 })`. Then `s.pid = game.players[i].id` and `game.players[i].color = s.color`, as `startGame` does. `room.game = game`. | |
| 8 | `hear("ui_confirm")`. `say(room, "<name> won last time and places first.")`. | |
| 9 | `publish(room)` (the seat list changed), then `pushState(room)`. | |

Notes:

- Steps 1 to 3 change nothing. A refused `again` leaves the old game and every seat as they were.
- The host check comes first, so a guest always gets `Only the host can start.`, even when the game is not over. That
  is the same string `startGame` uses. A double click on `again` is the host's second message: it finds a new game in
  phase `setupSettle` and gets `Game is not over.`
- Step 4 does not call `letGo`. `letGo` is the hold timer's own callback: it clears only the grace timer, and it calls
  `publish`. Called early, the hold timer would fire later on a seat that is already gone. The host is always in
  `live`, so the host never moves.
- In step 4 a seat's `avatarId` stays in `room.avatarIds`, as `letGo` leaves it today.
- Step 5 sets the line "<name> won last time and places first." Step 8 skips the "won last time" half when the winner
  was let go: the line is then `<name> places first.`, the same wording `startGame` uses.
- `ready` is not touched. Every seat that stays is still `ready: true` from the lobby.
- `room.chat`, `room.chatSeq`, `room.next`, `room.host`, every `secret`, name, color and picture are kept.
- Step 7 gives the winner `p0`. Seat ids (`s0..s3`) do not change. `pid` does, and `you` in the next `state` message
  carries the new one.
- The new game takes a fresh random seed from `createGame`. The old state is never reused. `viewFor` hands out the old
  `seed` and `rng` at `over` (#111), so reuse would give the new island away.

### Error strings

| String | When | New? |
|---|---|---|
| `Only the host can start.` | A guest sends `again`. | no, `host.mjs:422` |
| `Game is not over.` | No game, a game in play, or a second `again`. | yes |
| `Need 3 or 4 at the table.` | Fewer than 3 open sockets. | no, `host.mjs:423` |

### Log line

`say(room, "Ember won last time and places first.")`. `createGame` also writes its own first log line,
`The isle is dealt. Ember places first.`, into `game.log`. Both are true. The `say` line is the one on the wire; the
`game.log` line is the one the HUD shows.

## `createGame`

Signature today: `createGame(opts: { seed?: number; humans: { name: string }[]; bots: number; hostId?: string })`.

**No new option for player order.** The order of `humans` is the order of `players`, and `p0` is the first entry.
The rematch passes the winner first. `setupAdvance` then gives that seat the first outpost, the last outpost of the
reverse pass, and the first production roll (`rules.ts:253`, `current = players[0]`). No change in `rules.ts`.

`hostId` defaults to `players[0].id`, and nothing reads it. The rematch ignores it. `room.host` is the real host.

## How it joins #149 (roll-off)

#149 is design only today. Nothing named `rollOff` exists in `src` or `server`. Whichever PR lands second takes the join.

| Order | What changes |
|---|---|
| Rematch lands first | Nothing for the roll-off. The new game starts in `setupSettle`. |
| #149 lands first | `createGame` gains `rollOff?: boolean`, default `true`. When `false`, it skips the roll-off: `phase: "setupSettle"`, `rollOff: null`, `current: players[0].id`, and the log line is `The isle is dealt. <name> places first.` The rematch (host and hotseat) passes `rollOff: false`. |

The option is a skip, not an order. Order already comes from `humans`. #149's first-time start (`startGame`,
`startAi`, `startHotseat`) does not pass it, so the first game of a table still rolls off.

## Client

### `src/lib/net/table.ts`

Add `again: () => void` to `TableClient` and `again: () => send({ type: "again" })` next to `ready` and `start`
(line 296-297).

### `src/lib/game/store.ts`

| Change | Detail |
|---|---|
| `playAgain: () => void` | Online: `get().net?.again()`. Hotseat: build the next game locally (see "Hotseat"). Practice: never called. |
| `state` handler (online push, line 514) | When the previous `state.phase === "over"` and the new one is not, it is a new game. Skip `awardLine` (below). Reset `buildMode: "none"`, `roadPicks: []`, `pendingPlace: null`, `tradeOpen: false`. |

Why the new-game branch is needed:

- **`awardLine`** compares the old and new game. The old winner holds the longest path or largest army, the new game
  holds nobody, so it would show "<name> loses the longest path" with a name looked up in the new `players`, which
  can be a different person. Skip it when the previous phase was `over`.
- **`loadState`** already clears `pendingSteal` and `error`, and sets `state`, `localId` (the new `pid`), `host` and
  `legal`. It does not touch `buildMode`, `roadPicks`, `pendingPlace`, `tradeOpen`. The dispatch path resets
  `buildMode` and `roadPicks` on every online action, so they are usually already clean, but `pendingPlace` (the
  touch confirm) and `tradeOpen` (the panel) can be left open at the win. Reset all four on a new game.
- `offer`, `declined` and `tradeOutcome` are driven by the server's trade messages. `closeOffer` in step 6 sends the
  close, so they clear without a client change.
- `chat`, `reactions`, `unread`, `code`, `seats`, `seatId`, `isHost` belong to the table and are kept.
- The `WinScreen` panel is keyed by `winnerId` and unmounts when `winner` becomes `null`, so its "Look around"
  state resets on its own.
- A client that was let go still holds a secret. If it comes back, `rejoin` answers `Seat is gone.`, the same as
  after the hold. No new code.

### `src/components/game/WinScreen.tsx`

Who sees what:

| Viewer | Buttons | Extra line |
|---|---|---|
| Online host | `Look around`, `Play again` (primary), `Back to menu` (secondary) | none |
| Online guest | `Look around`, `Back to menu` (primary, as today) | `Waiting for Ember to start another.` |
| Hotseat | `Look around`, `Play again` (primary), `Back to menu` (secondary) | none |
| Practice (bots) | `Look around`, `Back to menu` (as today) | none |

- The host is `seats.find(s => s.host)`. The line uses its name. Test ids: `win-again` for the button,
  `win-waiting` for the line. The chip (after "Look around") gets the same `Play again` for the host
  (`win-again-chip`), so hiding the panel does not hide the rematch. A guest's chip is unchanged.
- The flag is `canAgain = mode === "hotseat" || (mode === "online" && host)`. `host` is the store's flag, which
  `loadState` sets from `isHost`.
- When the server refuses (`Need 3 or 4 at the table.`), the existing error toast shows it. The button stays.
- The header exit and the HUD sentence "The isle has a ruler." do not change.

## Hotseat

**Yes for hotseat, no for practice.**

| Mode | Decision | Why |
|---|---|---|
| Hotseat | Yes | The same people stay at the same device. It is a table. Without it, a second game means typing every seat's name again. Cost: one store action, no host code. |
| Practice | No | One human against three bots has no table to keep. "Back to menu" then "Practice" is two taps. Seating a winning bot first is not the player's win. |

Hotseat `playAgain`: take `state.players` in order, move the winner to the front, and call
`createGame({ humans: ordered.map(p => ({ name: p.name })), bots: 0 })`. The names are the typed ones ("Ember",
"Seat 2"), not the first seat's saved `name`. Set `state`, `localId: "p0"`, `error: null`, `toast: null`,
`buildMode: "none"`, `roadPicks: []`, `pendingPlace: null`. Colors come from the new game's default palette, so a
hotseat player's color can change; that matches `startHotseat` today, which also takes the palette. If #149 has
landed, pass `rollOff: false`.

## Persistence and rejoin

No new code. Step 9 saves through `publish` and `pushState`, which write the whole room (`game`, `seats`, `host`,
`chat`). Every change is made before the first save, so a crash never leaves the old game with the new seat list on
disk. A restart loads the new game, holds each seat, and a `hello {code, secret}` gets a `state` with the new `pid`.
A seat that was let go is not in the file.

## README (needs Jarrod, #266 carries `needs: jarrod`)

**This PR does not edit the README.** The rule below changes how the game is played, and the README rules are
Jarrod's. He must approve or reword it before #266 merges.

Proposed sentence for Rule set, Setup, after "Seat order, then the reverse.":

> In a rematch at the same table, the winner of the last game places first. There is no roll-off.

He should know it favors the winner twice: first place takes the first outpost and the first production roll. It is his
rule from 2026-09-27, so this note does not argue against it. Options if he wants it softer: only for the second game,
or no first seat if the winner won by a wide margin.

Two more edits go in #266 and are protocol docs, not rules: a README messages-table row (line 245 area) and a
`docs/BUILD_BIBLE.md` section 10 entry for `{ "type": "again" }`.

If #149 lands first, its README paragraph says "Before anyone places, each player rolls one die." The sentence above
must read as the exception to it.

## Proof plan

A game cannot be played to `over` over the wire: `table-prove` plays only a few turns. The new proof starts from a
finished game on disk instead. `host.mjs` loads rooms from `ROOMS_DIR` (the same path `persist-prove` exercises).

### New: `server/rematch-prove.mjs` (added to `server/package.json` `test`)

Fixtures, written to a temp `ROOMS_DIR` before the host starts: a room with a 3-seat `createGame` forced to
`phase: "over"`, `winner: "p2"` (the third seat, not the host), and seats `s0..s2` with known secrets. A second room
with the same game plus a fourth seat. Env: `HOLD_MS` and `GRACE_MS` long, so held seats are not let go by timers.
Clients rejoin with `hello {code, secret}`.

| Check | Expected |
|---|---|
| 3-seat table, all rejoin, guest sends `again` | error `Only the host can start.`; no new `state`. |
| 3-seat table, host sends `again` | Every socket gets a `state`: `phase setupSettle`, `winner null`, `players[0].name` is the winner's name, three players, new `seed` not equal to the fixture seed (check on disk, not the wire), `seq 0`. |
| New `pid` per seat | The winner's socket has `you === "p0"`. Every seat's `you` matches its own name in `players`. Colors match the seat colors. |
| Log | A `log` message `<name> won last time and places first.` arrived on every socket. |
| Leak check | No `seed` or `rng` in the new `state` (as `net-prove`). |
| Host sends `again` again | error `Game is not over.`; `seq` unchanged. |
| Persist | `ROOMS_DIR/<code>.json` has `game.phase setupSettle` and `players[0]` the winner. |
| Game in play | A fixture room with `phase "main"`: host `again` gets `Game is not over.` |
| 4-seat table, only 2 sockets | host `again` gets `Need 3 or 4 at the table.`; the saved file still has `phase over` and 4 seats. |
| 4-seat table, 3 sockets, the 4th has no socket | `again` works. The seat list (`seats` message) drops to 3. The new game has 3 players. The 4th seat's secret rejoin gets `Seat is gone.` |
| 4-seat table, 3 sockets, the winner has no socket | `again` works. `players[0]` is the first live seat in seat order. The log line is `<name> places first.` with no "won last time". |
| Host `again` in a lobby (no game) | `Game is not over.` Add to `table-prove` after the `Not everyone is ready.` check, one line. |

### `scripts/client-prove.mjs`: a step after the existing win-screen step (line 298-342)

The existing step reaches `over` in practice mode. Add a step that puts the store in online mode with a fake `net`:

| Check | Expected |
|---|---|
| Practice at `over` | `win-again` count is 0 (practice has no rematch). |
| Inject `mode "online"`, `host true`, `net { again }` that records a call | `win-again` shows; clicking it calls `again` once. |
| Same with `host false`, seats with a host named "Ember" | `win-again` count is 0; `win-waiting` text is `Waiting for Ember to start another.` |
| Host, "Look around" | `win-again-chip` shows beside `win-show`. |
| Push a new `state` (a `createGame`, phase `setupSettle`) after `over` | `win-screen` is gone; `buildMode` is `none`; `pendingPlace` is `null`; no award banner appeared; zero console errors. |

### `scripts/hotseat-prove.mjs`: new case

Four-seat hotseat to `over` is long, so force it: set `state` to a four-seat game with `phase: "over"`, `winner: "p2"`,
then click `win-again`. Expect `phase setupSettle`, `winner null`, `players[0].name` the old winner's name, the other
three names present, `localId "p0"`, and zero console errors.

### Already covered, unchanged

`net-prove`'s per-state `seed`/`rng` check runs over the new game's states. `rejoin-prove` and `persist-prove` already
cover the load path that the new proof relies on. `npm test`, `npm run client-prove`, `npm run hotseat-prove`,
`npm run typecheck` and `npm run build` must pass as for any change.

## Files to touch (#266)

| File | Change |
|---|---|
| `server/host.mjs` | `rematch`, one line in `handle` |
| `src/lib/net/table.ts` | `again` on `TableClient` |
| `src/lib/game/store.ts` | `playAgain`; reset on a new game in the `state` handler |
| `src/components/game/WinScreen.tsx` | `Play again`, `win-waiting`, chip button |
| `server/rematch-prove.mjs`, `server/package.json`, `server/table-prove.mjs` | per the proof plan |
| `scripts/client-prove.mjs`, `scripts/hotseat-prove.mjs` | per the proof plan |
| `README.md`, `docs/BUILD_BIBLE.md` | the Setup sentence (after Jarrod), the messages row |

**Size: S, one PR.** The host is about thirty lines, the client about twenty, and the proof is one new file and two
short steps.

## Not decided here

- A consent round (everyone taps ready again). Add it only if Jarrod asks. It needs a reset of `ready`.
- A way back to the lobby when fewer than 3 are present.
- A rematch for practice mode.
