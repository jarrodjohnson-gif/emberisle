# The pre-join color peek (issue #156)

Sources: [docs/design/menus.md](menus.md) `Row_Colors` ("A taken color is 35% opacity and not clickable", line 31),
[docs/design/title-lobby.md](title-lobby.md) (#136), [docs/design/connection.md](connection.md) "First message",
[docs/design/chat.md](chat.md) "Validation" (the `allow` bucket), `server/host.mjs`, `src/lib/net/table.ts`,
`src/lib/game/store.ts`, `src/components/game/EmberisleApp.tsx`, #142's revised scope (PR #145 review), #269
(the quiet auto-rejoin, merged).

## What is wrong today

The Title card shows four swatches (`Title`'s `role="radiogroup"` block in `EmberisleApp.tsx`) and a join code
field (the "Join code" input below it). A color already taken in the table you are about to join looks exactly
like a free one. The only signal is the host's `"Color taken."` error after you click Join (`sitDown` in
`host.mjs`), shown on the error line under the Join button. The browser client has no seat data before `hello`,
because the first frame on a socket is always `hello` (`handle()`'s `!ws.room` branch), and `hello` seats you.

## The premise, corrected

#156 was filed expecting #136 to split Title into separate Host and Join screens. #136's design did not:
`title-lobby.md` keeps one card, with "Join code + Join: unchanged fields and handler, grouped directly under
Host" (lines 89-90) and the swatches shared by both paths (line 97). This design works on that combined card
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
| `{ "type": "peek", "code" }` on a socket with no seat | `seats { code, seats[] }`, the exact `seatsOf(room)` shape | None. The socket is not seated, nothing is broadcast, nothing is saved. |
| `peek` with a code that is not a 4-character alphabet string | nothing | The frame is dropped. |
| `peek` for a code with no room, or a room whose game has started | `seats { code, seats: [] }` | None. |

`code` in the reply is the asked code, uppercased (`String(msg.code).toUpperCase()`, as `sitDown` already
does). The client uses that echo to tell a stale reply from a current one (below).

Why an empty `seats` and not an `error` for an unknown or started table:

- The client's `error` handler in `connect()` (`store.ts`) sets `error` and `toast`. A peek is not something
  the user asked for, so it must never toast. Reusing `seats` means the existing `seats` handler
  (`set({ code, seats })`) is the whole client side, with no new message type in `table.ts`.
- An empty list dims nothing, which is the right picture for both cases. The real Join still gets the real
  error, `"No table with that code"` or `"Game already started."`, from `sitDown`.
- A peeker learns only "a joinable lobby exists here", not "exists but started" vs "does not exist". `hello`
  already tells more than that today (`sitDown`'s three distinct error strings), so the peek does not widen the
  oracle.

A peek from a seated socket is not special-cased on the host. It falls through `handle()`'s lobby routing to
`"not ready"`. The client only ever sends a peek on a connection it opened for peeking (below), never on a
seated or rejoining one, so that branch is only reached by a hand-rolled client.

## Host: `peek(ws, msg)`

In `handle()`'s `!ws.room` branch, one line before `create`/`hello`:

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

`send` goes to this socket only. `publish`, which broadcasts and saves, is not called. `ws.room` and `ws.seat`
stay unset, so `leave()` does nothing when the peeking socket closes, and `room.seats` never sees it.

## Rate limit

Today a socket with no seat has no limit at all: `allow` (`chat.mjs`) runs only in `talk()` on `seat.bucket`,
and a bucket exists only once a seat does (`openTable`, `sitDown`). The code space is 32⁴ = 1,048,576 codes
(`ALPHABET`, `code()`). A bare `hello` with a guessed code already answers `"No table with that code"` as fast
as the socket can carry it.

| Rule | Where |
|---|---|
| Every socket gets `ws.bucket = { tokens: 5, at: Date.now() }` on connection. | `wss.on("connection")` |
| In the `!ws.room` branch, `allow(ws.bucket, now)` runs first, before `peek`, `hello`, `create`, `join`, and the rejoin `hello`. An invalid peek spends a token like any other frame. | `handle()` |
| Over the limit, a `peek` is dropped with no reply. Nothing dims, and the real Join corrects it. | `peek` |
| Over the limit, a `hello` (any form) gets `error "Slow down."`, the same string and shape as chat. | `handle()` |

Same bucket as chat: 5 tokens, refilled at 1 per second. What this buys, honestly: it throttles **one
connection**. A client stuck in a loop, a tab re-peeking on every keystroke, or a flooding script on one socket
gets one answer per second. It does not stop code guessing, because sockets are free: a guesser opens a new
socket per burst and pays only a handshake per five guesses. That is the same exposure `hello` has today, and
the peek does not make it cheaper. The reconnect client sends one rejoin `hello` per socket (`dial()`'s
`onopen` in `table.ts`), and a player retrying after `"Color taken."` sends one, so no honest path reaches the
limit. The seated `seat.bucket` is unchanged; `talk()` keeps using it.

Per-IP or global caps are out of scope. Behind the Cloudflare tunnel (`scripts/night.mjs`) every socket shares
the tunnel's address, so a per-IP rule would need `cf-connecting-ip` from the upgrade request and a test setup
that fakes it. If sweeping ever shows up in the host log, that is the next step, not this one.

## Client: `table.ts`

One method on `TableClient`, next to `join`:

```ts
// Ask which seats a lobby holds before sitting down (docs/design/color-peek.md). Answered as `seats`.
peek(code: string): void;
```

```ts
peek: (code) => send({ type: "peek", code: code.toUpperCase() }),
```

`send` queues until the socket opens, so a peek sent right after `connectTable` goes out on `open`. The reply
arrives through the existing `case "seats"` in `handle`. No change to `handle`, `TableEvents`, or the reconnect
logic: a peeking socket has no `seat`, so if it drops, `onclose` fires `on.closed()` once and does not redial.

## Client: `store.ts`

`connect()` today takes `quiet = false` (#269): until the first `welcome`, a dead seat is dropped without a
toast. The peek needs a second kind of connection with its own rules, so the boolean becomes a kind:

```ts
type ConnectKind = "normal" | "quiet" | "peek";
function connect(set: Set, get: Get, first: (t: TableClient, me: Me) => void, kind: ConnectKind = "normal")
```

`rejoinTable` passes `"quiet"` where it passes `true` today. Everything else about `quiet` stays as #269 wrote
it. The store gains one field, `peeking: boolean`, so the rest of the store can tell what `net` is.

| Change | Detail |
|---|---|
| `peeking` | New field. `connect()` sets it to `kind === "peek"` at the same point it sets `net`. `goTitle` resets it to `false` alongside `net: null`. |
| `peekTable(code)` | New action. Returns if `screen !== "title"`. Then: `net && peeking` → `net.peek(code)`. `net && !peeking` → return. That `net` is the page-load auto-rejoin (`rejoinTable`, called from `EmberisleApp.tsx` on mount), and a peek queued on it would go out after the rejoin `hello`, land on a seated socket, and come back as `"not ready"`. Leave it alone; the swatches stay enabled; if the rejoin fails, `closed` nulls `net` and the next re-peek (5 s) opens a peek connection. `!net` → `connect(set, get, (t) => t.peek(code), "peek")`. |
| `error` handler | `if (!pending && kind !== "peek") set({ error: message, toast: message })`. A peek connection never carries a user-asked request, so nothing it receives may toast. |
| `closed` handler | New first branch, before the `keepSeat` check: `if (kind === "peek") { if (get().net === table) set({ net: null, peeking: false }); return; }`. It does not call `rememberSeat(null)`, does not touch `screen` or `state`, and does not set an error. The rest of the handler (`keepSeat` → `rememberSeat(null)` → `pending` → "Lost the table") is unchanged, so #269's clearing of a stale seat and the "Your seat is open in another tab" message both still happen for every non-peek connection. |
| `joinTable(code)` | Signature unchanged. Derives `taken` itself: `const { code: peeked, seats, color } = get(); const free = color && !(peeked === code.toUpperCase() && seats.some((s) => s.color === color));` and passes `{ ...me, color: free ? me.color : undefined }` to `t.join`. `connect()` closes the peek socket (`get().net?.close()`, first line) and dials a fresh `"normal"` one for the `hello`. A close by us fires no `closed` event (`closedByUs` in `table.ts`). |
| `hostTable` | Unchanged. Same `connect()` cleanup. |
| `seats` handler | Unchanged. It already stores `code` and `seats`. |

Two things to know, neither needing code:

- `connect()` sets `mode: "online"` when it opens the peek connection, so a player who types a code and then
  clicks Practice has `mode === "online"` for a moment on the title card. `startAi` and `startHotseat` set
  `mode` themselves and close `net` first, and nothing on Title reads `mode`. Harmless, but it is there.
- The rejected alternative was to keep the peek socket warm and send the join `hello` on it. It saves one dial
  (about one round trip through the tunnel) and makes `joinTable` depend on which connection `net` is at click
  time, with the auto-rejoin as a third possibility. The redial keeps `joinTable` and `hostTable` as they are.

## Client: the Title card lifecycle

State lives in `Title` (`EmberisleApp.tsx`), which already owns `join` as local state. Store fields used:
`seats`, `code`, `color`, `peekTable`.

| Moment | What happens |
|---|---|
| Field changes | `setJoin(value.toUpperCase())` as today. A `useEffect` on `join`: if it matches `CODE`, start a 300 ms timer that calls `peekTable(join)`. Any change clears the pending timer. |
| Paste of 4 characters | Same path: one timer, one peek. |
| Reply arrives | `seats` handler sets `code` and `seats`. The card derives `taken = code === join ? seats.map((s) => s.color) : []`. Nothing else is stored. |
| Reply for an old code | Its `code` echo differs from `join`, so `taken` is empty for it. When the current code's reply lands it replaces `code` and `seats`. No sequence numbers, no cancel. |
| Unknown code, or a started game | `seats: []`, so `taken` is empty. No error line. The user has not submitted anything. |
| Field edited below 4 characters | `code !== join`, so `taken` is empty at once. No message is sent. |
| Waiting with a full code | The effect also sets a 5 s interval that re-peeks the same code, so a friend who sits down while you hesitate dims too. One token per 5 s, well under the refill. This interval is also what opens the peek connection once a pending auto-rejoin has failed and nulled `net`. |
| A saved-seat rejoin is pending | `peekTable` returns without sending (above). Swatches stay enabled. If the rejoin succeeds the screen is the lobby and `Title` is gone. |
| Join clicked | `joinTable(join)` as today. `connect()` closes the peek socket. |
| Host clicked, or Practice / Hotseat | `hostTable`, `startAi`, `startHotseat` all `net?.close()` first. |
| `Title` unmounts (lobby or play) | The effect's cleanup clears the timer and the interval. The `screen !== "title"` guard in `peekTable` stops any peek that was already scheduled. |
| Back to Title via `goTitle` | Already resets `seats: []`, `code: ""`, `net: null`; gains `peeking: false`. |

## The swatch

`menus.md` line 31: "A taken color is 35% opacity and not clickable." On the existing swatch button in `Title`:

| Prop | Free | Taken |
|---|---|---|
| `disabled` | unset | `true` |
| `className` | `size-8 rounded-full border-2 transition` | plus `opacity-35 cursor-not-allowed` |
| `aria-checked` | `color === c` | `false`. A taken swatch is never shown selected, even if it is the saved color. |
| `title` / `aria-label` | `Ember` | `Ember (taken)` |
| `onClick` | `setColor(c)` | not reached (`disabled`) |

`opacity-35` is Tailwind's `opacity: 0.35`, the spec's number exactly. The saved color in `localStorage`
(`setColor` / `savedColor` in `store.ts`) is not touched by a peek: a taken swatch is dimmed for this table
only, and comes back the moment the code changes.

When Join is clicked and the chosen color is dimmed, `joinTable` sends `hello` with `color: undefined`
(the derivation above). `seatColor(room, raw)` in `host.mjs` then assigns the first free palette color, the
same thing it does for a player who never picked or who sent anything outside the palette. The seat list in
the lobby shows what you got.

## The race

Between the peek and the `hello`, another player can take the color the peek showed free. The host is the
only truth: `sitDown` still checks `room.seats.some((s) => s.color === color)` and answers `"Color taken."`.
The client shows it on the same error line as today, and the 5 s re-peek dims the swatch the next time it
runs. Nothing in this design removes or weakens that check. The peek makes the common case look right before
you click; the `hello` makes the rare case correct.

The reverse race is harmless: a seat freed after the peek stays dimmed until the next re-peek, and a `hello`
for it would simply succeed, but the client never sends a dimmed color.

## Files the implementation touches

| File | Change |
|---|---|
| `server/host.mjs` | `peek()`, `CODE`, `ws.bucket` on connection, the `allow` check at the top of the `!ws.room` branch. |
| `src/lib/net/table.ts` | `peek(code)` on `TableClient`. |
| `src/lib/game/store.ts` | `peeking`, `peekTable`, `connect()`'s `kind` parameter (and `rejoinTable`'s call), the `error` and `closed` peek branches, `joinTable`'s `taken` derivation, `goTitle`'s reset. |
| `src/components/game/EmberisleApp.tsx` | The debounce and re-peek effect, `taken`, the swatch props. |
| `docs/design/connection.md` | One row in "First message" for `peek`. |
| `README.md` | The proof rows below. |

No new dependencies. No change to `seatsOf`, `publish`, `sitDown`, `seatColor`, or the `seats` handler.

## Test plan

| Proof | Cases added |
|---|---|
| `server/table-prove.mjs` (after the "Color taken." block) | 1. A fourth socket sends `peek {code}` and gets `seats` with 3 seats, Ember's color among them, `code` uppercased, and the host's socket receives no `seats` publish within 300 ms. 2. `peek` with the code lowercased returns the same. 3. `peek "ZZZZ"` returns `seats: []`. 4. The peeker then sends `hello` with Ember's color and gets `"Color taken."` (the race, proven as a plain sequence), then with a free color and gets `welcome`. 5. After `start`, a fresh socket's `peek` for the code returns `seats: []`. |
| `server/harden-prove.mjs` (next to the junk loop) | 6. On a fresh socket: `peek` with `code: {}`, `"ABC"`, `"ABCDE"`, and `"ABC0"` (0 is not in the alphabet) get no reply within 300 ms; one valid `peek` after them gets exactly one `seats`. Those four invalid peeks spend four tokens, because `allow` runs before the shape check, so the fifth frame is the last one inside the burst. 7. A fresh socket sends 6 `peek`s in a row: 5 `seats` replies and then silence for 300 ms. 8. A fresh socket sends 6 `hello`s with a bad code: 5 `"No table with that code"` then one `"Slow down."`. |
| `server/net-prove.mjs` | 9. A `connectTable` client calls `peek(code)` and receives the `seats` event with the right `code`, then `join`s with a free color and gets `welcome`. |
| `scripts/tabs-prove.mjs` (the host already picks Tide, the #142 block) | 10. Before tab B clicks Join: fill the code, then `until` the Tide radio has `disabled` and `opacity: 0.35` (computed style), and `aria-checked="false"`, while Ember, Dune, and Pine are enabled. Tab B joins; the game-state color check that follows stays. This is #156's completion test. |
| `scripts/client-prove.mjs` (the #259 block, same spare host) | 11. Save a stale seat, load the page, and type a 4-character code while the auto-rejoin is still pending. Assert: no `error`, no `toast`, `screen === "title"` throughout; after the rejoin fails, the `emberisle-seat` key is cleared (the #259 assertion still holds), and within 6 s `peeking === true` and `net !== null` (the re-peek opened a peek connection once the rejoin was gone). |
| `npm run typecheck`, `npm run build`, `npm test`, `npm run hotseat-prove`, `npm run served-prove`, `npm run chat-prove` | Unchanged, must stay green. `served-prove` covers the tunnel case: the peek goes over the same socket as everything else. |

README: `table-prove` row gains "peek before sitting", `harden-prove` row gains "a peek or hello flood",
`tabs-prove` row gains "a taken color dims before Join", `client-prove` row gains "a peek during a pending
rejoin is quiet".

## Out of scope

A separate Join screen (#136 decided against it). Per-IP or global rate limits (above). Dimming on the Host
path (a new table has no seats). Live `seats` pushes to peekers (the 5 s re-peek covers it with no host state).
Any change to `seatsOf`, `seatColor`, or the lobby's seat list.

## Child issue filed

- **#271 Implement the pre-join color peek**: `host.mjs`, `table.ts`, `store.ts`, `EmberisleApp.tsx`, the
  proof cases above. Depends on this design landing. Size S.
