# Research: a spectator seat that watches and cannot play (issue #311)

- step: 1 Research
- date: 2026-10-03
- agent: Claude

## Jarrod's answer

**Yes, spectators, opponent view only** (issue #311 comment, 2026-10-03). A spectator gets `viewFor(game, null)`: the board,
public counts and chat. No hands, no hidden points. This note takes that as given.

## Children filed (Backlog)

| Step | Issue | Size |
|---|---|---|
| Design | #346 Design the spectator seat | S |
| Implementation | #347 host: watch, no seat, opponent view | S |
| Implementation | #348 client: spectator view and Watch entry | S |
| Test | #349 Test the spectator seat | S |

## What I read

`server/host.mjs` (`viewFor`, `legalFor`, `broadcast`, `pushState`, `seatsOf`, `sitDown`, `handle`, `rejoin`, `hold`, `leave`,
`takeOver`, `letGo`, `dropRoom`, `talk`, the pinger), `src/lib/game/store.ts` (`connect`, `welcome`, `state`, every `localId`
actor), `src/lib/net/table.ts` (`hello`, the redial), `Hud.tsx`, `TradePanel.tsx`, `PlayerMenu.tsx`, `TradeToast.tsx`,
`turn-title.ts`, `server/harden-prove.mjs` (ROOM_MAX), `server/table-prove.mjs`, and the open issues #344 and #232.

## What is true

**`viewFor(game, null)` already is the opponent view.** It strips `seed` and `rng`, empties `deck`, and rewrites every player
(`p.id === you` matches none) to a goods count, `fortunes` count and zeroed `hidden`/`boughtThisTurn`. `legalFor(game, null)`
finds no `me` and returns all-empty lists. Once `phase === "over"` `viewFor` reveals everything to every seat, so a watcher
sees the same ending the players see. No rules change is needed. Nothing in `rules.ts` changes.

**Host side.**
- Today a late `hello {code}` hits `sitDown`: "Game already started." (`host.mjs:452`), or "Table full." at 4 seats. A watcher
  is a new branch before that: `hello {code, watch:true}`.
- `broadcast` and `pushState` walk `room.seats` only, so a watcher needs its own list, `room.watchers` (a `Set` of sockets).
  Both functions send to it too. `pushState` should build `viewFor(game, null)` once and reuse the string for every watcher.
- A watcher has **no seat, no secret, no `pid`**. It is never in `room.seats`, so `seatsOf`, `save`, `hold`, `takeOver`,
  `letGo`, `handOffHost` and the "is anyone connected" test (`room.seats.some((s) => s.ws)`) cannot see it. That is wanted:
  watchers must not keep a room alive or wake the bots.
- **`handle()` must route a watcher before it touches `ws.seat`.** Today any socket with `ws.room` is assumed to have
  `ws.seat`; a watcher with `ws.room` set would throw on `ws.seat.act` and be answered "not ready" by the catch. That is
  refusal by accident. The Design should mark watchers with their own field (`ws.watch = room`, `ws.room` left unset) and
  answer every message with one explicit error, throttled by `ws.bucket` (the pre-seat bucket that already exists).
- **`ROOM_MAX` counts rooms, not sockets** (`openTable` only). The issue's premise that a spectator might "count toward
  ROOM_MAX" does not apply. Recommendation: a watcher does not count toward it, and a new `SPECTATOR_MAX` (env, default 8
  per room) bounds sockets. Over it: "Table is full to watch."
- **Watch only after the game starts.** Before `start` there is no `state` to give, and the lobby (seats, colours, ready)
  is a seat-taking screen. A watch `hello` before `start` is answered "Not started yet." The Design may revisit this if
  Jarrod wants to watch a lobby fill.
- **Pings:** watchers are in `wss.clients`, so the pinger already cuts a dead one. `close` removes it from `room.watchers`.
- **`dropRoom`** (last seat let go) should tell watchers "The table closed." and close them.
- **Hidden info leaves only in `state`.** Every other broadcast (`rolled`, `log`, `tradeOffer`, `tradeDeclined`,
  `tradeClosed`, `chat`, `react`, `seats`) is already public to all seats, so a watcher may receive them unchanged. The
  `welcome` for a watcher carries `chat` history and no `secret`. `seats` carries avatar URLs, which are public.
  A trade offer's `give`/`want` is public by design (the asker names it to the table).

**Interaction with the in-progress work.**
- **Turn timer (#344).** It arms for "the seat the game waits on" (`current`, a discard owner, a steal choice). A watcher is
  in no `game.players`, so the timer, built from `game.players` and `room.seats`, can never pick one. The proof asserts it:
  with a watcher connected and every seat idle, only seats are acted for. The timer's `turnDeadline` field goes to watchers
  too (it is public), so the HUD countdown (#345) can show on a watcher with no change.
- **Roll-off (#232).** The `rollOff` phase puts dice in the public state, so a watcher sees them. `legalFor(game, null)`
  gives no "roll" action, so a watcher never gets a Roll button. The `players` reorder at resolution reaches a watcher as
  an ordinary `state`.
- **Lobby hold (#280).** Merged: a held lobby seat is `ws = null`, `away: true`. Watchers play no part in it and need no
  hold, because they exist only after `start`.

**Client side (`you === null`).**
- `welcome` must carry `spectator: true`, and the store gets a `spectator` flag. The `state` message has `you: null`;
  `loadState` and `hear` take `localId` as a string today, so a null must be handled once, in the store.
- Every control keys off `actor = mode === "hotseat" ? state.current : localId` (`Hud.tsx:125`, `TradePanel.tsx:55`,
  `PlayerMenu.tsx:34`, `store.ts` 409/448/484/495/520/535). With `localId` empty none matches, and `Hud` falls back to
  `players[0]` as `me`. That fallback would show seat 0's buttons and hand bar. **A spectator must hide the bar by flag, not
  rely on the fallback.**
- No actions, no legal glow (`legal` is empty already), no hand bar, no trade panel, no player menu (menu actions are trade
  and steal), no your-turn chime (`after.current === me` is never true for null), no "your turn" tab title
  (`turn-title.ts`); it should say "Watching".
- The **rail** shows every seat as an opponent card (counts only). The **dock** is chat read-only (see below). The **win
  screen** shows the result as a third party, with no rematch or "you" line. Check `docs/design/rematch.md` for what the win
  screen offers and hide any seat-only button.
- Entry: a Watch button on the Title join card beside the code, and a `?watch=CODE` link a player can paste. `peek` answers
  only for lobbies, so a watcher does not peek; it sends `hello {code, watch:true}` directly.

**Reconnect.** None. A spectator holds nothing worth saving: no seat, no secret, no `localStorage` entry. `table.ts` redials
only with a saved seat, and a watcher has none, so a dropped watcher lands on the Title ("Lost the table") and reloads or
re-enters the code. A host restart drops watchers (they are not saved), which is the same.

## Chat or react: recommendation

**Read-only in v1: a spectator receives chat and reactions and sends neither.**

- Jarrod's answer lists chat as something a spectator *sees*. It did not ask for a voice.
- A speaking watcher needs a name (`seatName` uniqueness across seats and watchers), a colour for the chat line, a spectator
  mark so players know who is talking, a bucket (`seat.bucket` is per seat; a watcher would need its own), and history
  persisted in `save(room)` (`ROOM_SHAPE` bump). That is the Design, host, client and proof all growing.
- Hidden info is not the risk (a watcher knows no more than an opponent), but a watcher is an unvetted outsider who got the
  code. Silence removes the abuse and spam surface, and nobody at a four-friend table has asked for more.
- If Jarrod wants a voice later, **reactions first**: they are the smaller step (no text, no history, no name, `react` with
  `seat: null`), then chat. Neither is filed; it goes to IDEAS.md if he asks.

## What I am not sure about

- **Watch before start** is refused here. Jarrod may want to watch a lobby fill. Cheap to add, but it adds a lobby view for a
  seatless socket. The Design should ask him once.
- **A code is the only gate.** Anyone with the 4-letter code can watch. That matches how a player joins today, and the
  watcher sees only what an opponent sees, so I did not add a table password. A host "no watchers" switch is an idea, not a
  child.
- **`SPECTATOR_MAX` default 8** is a guess. Each watcher costs one send of a shared JSON string per state, so the cost is small.
- **The issue names `table-prove.mjs` at the repo root.** It lives at `server/table-prove.mjs` and is already in `npm test`.

## Proof plan

Server proof in `server/table-prove.mjs` (a fifth raw socket), then a spectator tab in `scripts/client-prove.mjs`. In this order:

1. **Hidden info never reaches a watcher.** For every message a watcher receives, from `welcome` through the win: no player
   has `resources`; every `hidden` and `boughtThisTurn` is zero; `deck` is `[]`; `seed` and `rng` are absent; no `secret`
   appears in `welcome`; and the `state` equals `viewFor(game, null)`. Compared with a seat's own `state` in the same step,
   the seat's own hand is present and the watcher's is not.
2. A fifth socket joins a full, started table.
3. It gets every `state` the four seats get, with the same `seq`.
4. Every intent (`roll`, `place`, `buy`, `play`, `rob`, `discard`, `tradeBank`, `pass`), `chat`, `react`, `ready`, `start`,
   `tradeAsk` and `tradeAnswer` is refused, and `game.seq` does not move.
5. A ninth watcher is refused by `SPECTATOR_MAX`; a watch `hello` before `start` is refused.
6. Watchers do not count toward `ROOM_MAX` (extend the `harden-prove.mjs` case).
7. Closing every watcher changes nothing for the seats; with every seat dropped and a watcher still connected, the bots wait
   as they do with nobody connected.
8. With #344 merged: a watcher connected and every seat idle, the timer acts only for seats.
9. Client tab: the board and counts render, zero enabled game controls, no hand bar, no chat input, zero console errors.

## Prove output

Research gate: nothing to run. No code changed.

## Handoff

```
done: note, IDEAS.md mark, children #346 #347 #348 #349 filed in Backlog
left: Design (#346) first; it asks Jarrod whether to watch a lobby
broke: nothing
next agent: take #346 once this PR is merged
```
