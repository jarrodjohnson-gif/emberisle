# The pre-join color peek (issue #156)

Sources: [docs/design/menus.md](menus.md) `Row_Colors` ("A taken color is 35% opacity and not clickable", line 31),
[docs/design/title-lobby.md](title-lobby.md) (#136), [docs/design/connection.md](connection.md) "First message",
[docs/design/chat.md](chat.md) "Validation" (the `allow` bucket), `server/host.mjs`, `src/lib/net/table.ts`,
`src/lib/game/store.ts`, `src/components/game/EmberisleApp.tsx`, #142's revised scope (PR #145 review).

## What is wrong today

The Title card shows four swatches (`EmberisleApp.tsx:88-102`) and a join code field (`:108-114`). A color
already taken in the table you are about to join looks exactly like a free one. The only signal is the host's
`"Color taken."` error after you click Join (`host.mjs:400`, shown at `EmberisleApp.tsx:125`). The browser
client has no seat data before `hello`, because the first frame on a socket is always `hello`
(`host.mjs:614-620`), and `hello` seats you.

## The premise, corrected

#156 was filed expecting #136 to split Title into separate Host and Join screens. #136's design did not:
`title-lobby.md` keeps one card, with "Join code + Join: unchanged fields and handler, grouped directly under
Host" (lines 86-90) and the swatches shared by both paths (line 97). This design works on that combined card
and needs no split:

| Field state | Swatches |
|---|---|
| Empty, or fewer than 4 characters | All four enabled. This is the Host path. |
| 4 characters of the alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` | A peek fires. Colors in the reply dim. |
| Edited back below 4 | All four enabled again. No message. |

The dimming is a property of "the code in the field right now", never of the screen.

## Protocol

One new client → host message, answered with a shape the client already handles.

| Client sends | Host answers | Side effects |
|---|---|---|
| `{ "type": "peek", "code" }` on a socket with no seat | `seats { code, seats[] }`, the exact `seatsOf(room)` shape (`host.mjs:79-90`) | None. The socket is not seated, nothing is broadcast, nothing is saved. |
| `peek` with a code that is not a 4-character alphabet string | nothing | The frame is dropped. |
| `peek` for a code with no room, or a room whose game has started | `seats { code, seats: [] }` | None. |

`code` in the reply is the asked code, uppercased (`String(msg.code).toUpperCase()`, as `sitDown` already does at
`host.mjs:395`). The client uses that echo to tell a stale reply from a current one (below).

Why an empty `seats` and not an `error` for an unknown or started table:

- The client's `error` handler (`store.ts:483`) sets `error` and `toast`. A peek is not something the user asked
  for, so it must never toast. Reusing `seats` means the existing handler (`store.ts:469`, `set({ code, seats })`)
  is the whole client side, with no new message type in `table.ts` and no "is this error from a peek" branch.
- An empty list dims nothing, which is the right picture for both cases. The real Join still gets the real
  error, `"No table with that code"` or `"Game already started."`, from `sitDown` (`host.mjs:396-397`).
- A peeker learns only "a joinable lobby exists here", not "exists but started" vs "does not exist". `hello`
  already tells more than that today (three distinct error strings at `host.mjs:396-398`), so the peek does not
  widen the oracle.

A peek from a seated socket is not special-cased on the host. It falls through `handle()`'s lobby routing to
`"not ready"` (`host.mjs:628`). The client never sends one while seated (below), so that branch is only reached
by a hand-rolled client.

## Host: `peek(ws, msg)`

In `handle()`'s `!ws.room` branch (`host.mjs:614-620`), one line before `create`/`hello`:

```js
if (msg.type === "peek") return peek(ws, msg);
```

```js
const CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;

// Answers which seats a lobby holds, without sitting down (docs/design/color-peek.md).
function peek(ws, msg) {
  const code = typeof msg.code === "string" ? msg.code.toUpperCase() : "";
  if (!CODE.test(code)) return;
  const room = rooms.get(code);
  send(ws, { type: "seats", code, seats: room && !room.game ? seatsOf(room) : [] });
}
```

`send` (`host.mjs:66-68`) goes to this socket only. `publish` (`host.mjs:92-95`), which broadcasts and saves,
is not called. `ws.room` and `ws.seat` stay unset, so `leave()` (`host.mjs:707`) does nothing when the peeking
socket closes, and `room.seats` never sees it.

## Rate limit

Today a socket with no seat has no limit at all: `allow` (`chat.mjs:17-24`) runs only in `talk()` on
`seat.bucket` (`host.mjs:535`), and a bucket exists only once a seat does (`host.mjs:381, 408`). The code
space is 32⁴ = 1,048,576 codes (`host.mjs:24, 60-64`). A bare `hello` with a guessed code already answers
`"No table with that code"` as fast as the socket can carry it. The peek must not make guessing cheaper, and
this is the place to make the existing hole smaller too.

| Rule | Where |
|---|---|
| Every socket gets `ws.bucket = { tokens: 5, at: Date.now() }` on connection. | `wss.on("connection")`, `host.mjs:581` |
| In the `!ws.room` branch, `allow(ws.bucket, now)` runs first, before `peek`, `hello`, `create`, `join`, and the rejoin `hello`. | `host.mjs:614` |
| Over the limit, a `peek` is dropped with no reply. Nothing dims, and the real Join corrects it. | `peek` |
| Over the limit, a `hello` (any form) gets `error "Slow down."`, the same string and shape as chat. | `handle()` |

Same bucket as chat: 5 tokens, refilled at 1 per second (`chat.mjs:16`). Sustained, that is one guess per
second per socket, about 12 days to sweep the space from one socket, against a room that lives minutes to hours.
The reconnect client sends one rejoin `hello` per socket (`table.ts:182-188`), and a player retrying after
`"Color taken."` sends one, so no honest path reaches the limit. The seated `seat.bucket` is unchanged; `talk()`
keeps using it.

Per-IP or global caps are out of scope. Behind the Cloudflare tunnel (`scripts/night.mjs`) every socket shares
the tunnel's address, so a per-IP rule would need `cf-connecting-ip` from the upgrade request and a test setup
that fakes it. If sweeping ever shows up in the host log, that is the next step, not this one.

## Client: `table.ts`

One method on `TableClient` (`table.ts:72-85`), next to `join`:

```ts
// Ask which seats a lobby holds before sitting down (docs/design/color-peek.md). Answered as `seats`.
peek(code: string): void;
```

```ts
peek: (code) => send({ type: "peek", code: code.toUpperCase() }),
```

`send` queues until the socket opens (`table.ts:166-170`), so a peek sent right after `connectTable` goes out
on `open`. The reply arrives through the existing `case "seats"` (`table.ts:228-230`). No change to `handle`,
`TableEvents`, or the reconnect logic: a peeking socket has no `seat` (`table.ts:157`), so if it drops, `onclose`
fires `on.closed()` once and does not redial (`table.ts:193-196`).

## Client: `store.ts`

| Change | Detail |
|---|---|
| `peekTable(code)` | New action. Returns if `screen !== "title"`. If `net` exists, `net.peek(code)`. Otherwise `connect(set, get, (t) => t.peek(code))`, which dials and queues the peek. |
| `joinTable` (`store.ts:425`) | Unchanged. `connect()` closes the peek socket (`store.ts:451`) and dials a fresh one for the `hello`. A close by us fires no `closed` event (`table.ts:192`), so there is nothing to clean up. |
| `hostTable` (`store.ts:424`) | Unchanged, same reason. |
| `closed` handler (`store.ts:484-491`) | New first branch: if `get().screen === "title"`, `set({ net: null, seats: [], code: "" })` and return. A peek socket that dies (the host is down) must not toast "Lost the table" on a screen that has no table. |
| `seats` handler (`store.ts:469`) | Unchanged. It already stores `code` and `seats`. |

The rejected alternative was to keep the peek socket warm and send the join `hello` on it. It saves one dial
(tens of milliseconds on a LAN, about one round trip through the tunnel) and costs a "which socket is this"
flag in the store, plus care around the auto-rejoin socket `rejoinTable` opens on page load
(`EmberisleApp.tsx:31`, `store.ts:426-431`), which also lives while `screen === "title"`. Not worth it for
this node.

The `closed` branch touches the same handler #259 ("Fail a stale auto-rejoin quietly on page load", in
progress) is changing. The implementation child rebases on #259 and keeps whichever quiet-on-title rule lands
first; the two want the same thing.

## Client: the Title card lifecycle

State lives in `Title` (`EmberisleApp.tsx:48`), which already owns `join` (`:57`). Store fields used: `seats`,
`code`, `color`, `peekTable`.

| Moment | What happens |
|---|---|
| Field changes | `setJoin(value.toUpperCase())` as today (`:110`). A `useEffect` on `join`: if it matches `CODE`, start a 300 ms timer that calls `peekTable(join)`. Any change clears the pending timer. |
| Paste of 4 characters | Same path: one timer, one peek. |
| Reply arrives | `seats` handler sets `code` and `seats`. The card derives `taken = code === join ? seats.map((s) => s.color) : []`. Nothing else is stored. |
| Reply for an old code | Its `code` echo differs from `join`, so `taken` is empty for it. When the current code's reply lands it replaces `code` and `seats`. No sequence numbers, no cancel. |
| Unknown code, or a started game | `seats: []`, so `taken` is empty. No error line. The user has not submitted anything. |
| Field edited below 4 characters | `code !== join`, so `taken` is empty at once. No message is sent. |
| Waiting with a full code | The effect also sets a 5 s interval that re-peeks the same code, so a friend who sits down while you hesitate dims too. One token per 5 s, well under the refill. |
| Join clicked | `joinTable(join)` as today (`:118-120`). `connect()` closes the peek socket. |
| Host clicked, or Practice / Hotseat | `hostTable`, `startAi`, `startHotseat` all `net?.close()` first (`store.ts:207, 223, 451`). |
| `Title` unmounts (lobby or play) | The effect's cleanup clears the timer and the interval. The `screen !== "title"` guard in `peekTable` stops any peek that was already scheduled. |
| Back to Title via `goTitle` | `store.ts:251-276` already resets `seats: []`, `code: ""`, and `net: null`. |

## The swatch

`menus.md` line 31: "A taken color is 35% opacity and not clickable." On the existing button (`EmberisleApp.tsx:90-100`):

| Prop | Free | Taken |
|---|---|---|
| `disabled` | unset | `true` |
| `className` | `size-8 rounded-full border-2 transition` | plus `opacity-35 cursor-not-allowed` |
| `aria-checked` | `color === c` | `false`. A taken swatch is never shown selected, even if it is the saved color. |
| `title` / `aria-label` | `Ember` | `Ember (taken)` |
| `onClick` | `setColor(c)` | not reached (`disabled`) |

`opacity-35` is Tailwind's `opacity: 0.35`, the spec's number exactly. The saved color in `localStorage`
(`store.ts:199-202`) is not touched by a peek: a taken swatch is dimmed for this table only, and comes back the
moment the code changes.

When Join is clicked and the chosen `color` is in `taken`, `joinTable` sends `hello` with `color: undefined`,
so the host assigns the first free color (`host.mjs:399`), the same thing it does for a player who never picked.
The seat list in the lobby then shows what you got. This is the one line `joinTable` gains:
`color: taken.includes(color) ? undefined : color`, where `Title` passes `taken` through, or `joinTable` derives
it the same way from `code`, `seats`, and the asked code.

## The race

Between the peek and the `hello`, another player can take the color the peek showed free. The host is the
only truth: `sitDown` still checks `room.seats.some((s) => s.color === color)` (`host.mjs:400`) and answers
`"Color taken."`. The client shows it on the same line as today (`EmberisleApp.tsx:125`), and the 5 s re-peek
dims the swatch the next time it runs. Nothing in this design removes or weakens that check. The peek makes the
common case look right before you click; the `hello` makes the rare case correct.

The reverse race is harmless: a seat freed after the peek stays dimmed until the next re-peek, and a `hello`
for it would simply succeed, but the client never sends a dimmed color.

## Files the implementation touches

| File | Change |
|---|---|
| `server/host.mjs` | `peek()`, `CODE`, `ws.bucket` on connection, the `allow` check at the top of the `!ws.room` branch. |
| `src/lib/net/table.ts` | `peek(code)` on `TableClient`. |
| `src/lib/game/store.ts` | `peekTable`, the `closed` title branch, the `color: undefined` line in `joinTable`. |
| `src/components/game/EmberisleApp.tsx` | The debounce effect, `taken`, the swatch props. |
| `docs/design/connection.md` | One row in "First message" for `peek`. |
| `README.md` | The proof rows below. |

No new dependencies. No change to `seatsOf`, `publish`, `sitDown`, or the `seats` handler.

## Test plan

| Proof | Cases added |
|---|---|
| `server/table-prove.mjs` (after the "Color taken." block, `:61-74`) | 1. A fourth socket sends `peek {code}` and gets `seats` with 3 seats, Ember's color among them, `code` uppercased, and the host's socket receives no `seats` publish within 300 ms. 2. `peek` with the code lowercased returns the same. 3. `peek "ZZZZ"` returns `seats: []`. 4. The peeker then sends `hello` with Ember's color and gets `"Color taken."` (the race, proven as a plain sequence), then with a free color and gets `welcome`. 5. After `start`, a fresh socket's `peek` for the code returns `seats: []`. |
| `server/harden-prove.mjs` (next to the junk loop, `:110-121`) | 6. `peek` with `code: {}`, `"ABC"`, `"ABCDE"`, and `"ABC0"` (0 is not in the alphabet) get no reply within 300 ms; one valid `peek` after them gets exactly one `seats`. 7. A fresh socket sends 6 `peek`s in a row: 5 `seats` replies and then silence for 300 ms. 8. A fresh socket sends 6 `hello`s with a bad code: 5 `"No table with that code"` then one `"Slow down."`. |
| `server/net-prove.mjs` | 9. A `connectTable` client calls `peek(code)` and receives the `seats` event with the right `code`, then `join`s with a free color and gets `welcome`. |
| `scripts/tabs-prove.mjs` (the host already picks Tide, `:121-128`) | 10. Before tab B clicks Join: fill the code, then `until` the Tide radio has `disabled` and `opacity: 0.35` (computed style), and `aria-checked="false"`, while Ember, Dune, and Pine are enabled. Tab B joins; the game-state color check at `:138-142` stays. This is #156's completion test. |
| `npm run typecheck`, `npm run build`, `npm test`, `npm run client-prove`, `npm run served-prove`, `npm run chat-prove` | Unchanged, must stay green. `served-prove` covers the tunnel case: the peek goes over the same socket as everything else. |

README: `table-prove` row gains "peek before sitting", `harden-prove` row gains "a peek or hello flood",
`tabs-prove` row gains "a taken color dims before Join".

## Out of scope

A separate Join screen (#136 decided against it). Per-IP or global rate limits (above). Dimming on the Host
path (a new table has no seats). Live `seats` pushes to peekers (the 5 s re-peek covers it with no host state).
Any change to `seatsOf` or to the lobby's seat list.

## Child issue filed

- **#271 Implement the pre-join color peek**: `host.mjs`, `table.ts`, `store.ts`, `EmberisleApp.tsx`, the
  proof cases above. Depends on this design landing. Size S.
