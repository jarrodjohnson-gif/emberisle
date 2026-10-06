# Backend and multiplayer excellence: research synthesis and server audit

Status: research + spec only. No code changed.
Date: 2026-10-05. Branch: `docs/backend-excellence`.
Related: `docs/research/rejoin.md`, `docs/research/turn-stall.md`, `docs/research/online-table.md`, `docs/FRAMEWORK.md`.

Scope: the Node WebSocket host (`server/host.mjs`), its wire protocol (`src/lib/net/table.ts`),
persistence (`server/rooms/*.json`), and the client behaviors that touch them. Rules engine internals
(`src/lib/game/rules.ts`) are out of scope except where the server exposes them.

Method: read the best public engineering writing from production turn-based games (Colonist.io,
Lichess, chess.com, Marvel Snap / ex-Hearthstone, Board Game Arena-adjacent practice), then audited
`server/host.mjs` (1139 lines), `server/chat.mjs`, `src/lib/net/table.ts` against it. Every gap below
names a file and line, a concrete failure, a fix, and a completion test a `*-prove.mjs` script could
check. Claims from sources are cited; the rest is marked (inferred).

---

## 1. Research synthesis

### 1.1 Authoritative server with optimistic UI

The settled pattern for turn-based games is: server is the only authority, client renders instantly
and rolls back on rejection. The clearest worked example found is the open-source Tablecraft
optimistic-updates design
(https://github.com/clarence-g/tablecraft/blob/HEAD/docs/ISSUE_optimistic-updates.md), which lays
down rules Emberisle does not yet follow:

- The optimistic overlay must be deterministic from `(view, action)`. Any action whose outcome
  depends on server RNG (dice, card draws, hidden reveals) overlays only the known parts and uses
  the current view for the rest. (Emberisle relevance: roll, fortune draws, wayfarer steals.)
- On `game:reject` the overlay is cleared and the view snaps back to the last authoritative state.
- If any `game:state` arrives while an overlay is pending (a bot action, a concurrent broadcast),
  the overlay is cleared and the incoming view wins. Clearing on *any* state message is simpler
  and safer than matching sequence ids.
- Server silence must also clear the overlay (their `SEND_TIMEOUT_MS`), or a dropped socket leaves
  a fake state on screen indefinitely.
- A double-click guard (`isSending`) prevents stacked overlays.

Cornell CS 4152's synchronization lecture frames the same trade-off as pessimistic (everyone waits
for the server; speed set by the slowest player; long Internet latency hurts) versus optimistic
(allow drift, best guess plus roll back; works on any network but corrections distract)
(https://www.cs.cornell.edu/courses/cs4152/2021sp/lessons/lesson11/slides-11.pdf). For a
Catan-paced game, pessimistic is *playable* but feels dead on mobile networks; the industry answer
is optimistic overlay with authoritative reconciliation, not full client prediction.

Lichess applies the same idea to clocks rather than pieces: lag compensation measures each player's
ping and adds it back to their clock, so a player on a slow link is not punished for network time
(https://lichess.org/page/lag-compensation). The chess.com community discussion converges on the
same principle: make the local move feel instant, then account for the delay on the clock rather
than in the game rules (chess.com forums, "what can be done to minimize lag cheating" thread).
(inferred) Emberisle's analogue is the turn timer: time a player spends waiting on the network
should not count against their TURN_MS window.

A caution from Hearthstone's history, via a well-known player-community postmortem of its early
netcode: the client used to play animations on its own schedule and the server trusted the pacing,
which produced exploits and desyncs until the server bounded every action itself. The lesson the
industry took: never trust client animation timing; the server must bound actions and the client
must treat its own visuals as a guess (Hearthstone community postmortem, widely cited; no stable
URL retained). Emberisle already does the right thing here: `play()` (server/host.mjs:885)
re-validates every intent through `applyAction`.

A complementary protocol pattern (seen in open-source board-game engine architecture notes, e.g.
the st2eam/boardgames engine doc): the host numbers every outbound message with a sequence, keeps
per-client last-acked cursors, generates diffs against the last acknowledged snapshot, and serves
full snapshots on reconnect; conflicts resolve host-wins. Emberisle has the seed of this
(`room.game.seq`, per-seat `viewFor`) but no wire-level sequence, covered in gap G2.

### 1.2 Turn timers, AFK policy, bot takeover

Colonist.io publishes its per-phase timers per speed mode, and they are *per phase, not per
action*: on Normal speed, robber 40s, discard 40s, dice roll 20s, initial build 180s; on Very Fast,
robber/discard/roll drop to 10s
(https://www.colonist.io/blog/game-speeds-timer-settings-in-colonist-io). ("Robber" is
Colonist's term for the wayfarer-equivalent piece; quoted as their timer label.) Two things matter for us.
First, the timer that matters to the other three players is the *phase total*, not the gap between
inputs; a per-action timer can be gamed by acting just often enough. Second, Colonist pairs timers
with a karma system: disconnects and AFK behavior feed an automatic, non-appealable penalty, and
their FAQ stresses that penalties are automatic even when the disconnect was not the player's fault
(e.g. a server update)
(https://colonist.instantdocsbase.com/colonist-faq/what-happens-if-i-disconnect-during-the-game-while-my-karma-is-falling).

Emberisle's current design is kinder and arguably better for friends-first: TURN_MS (120s,
server/host.mjs:54) rearms on every accepted action, and on expiry the host bot makes one move while
the seat *stays human* (server/host.mjs:387 `turnOut`; Jarrod's call on #324/#344). A dropped seat
gets GRACE_MS (90s) before the bot takes over the seat (server/host.mjs:1070 `takeOver`) and
HOLD_MS (10 min) before the seat is let go (server/host.mjs:1086 `letGo`). The missing piece versus
Colonist is the cumulative cap: nothing bounds total turn length, so one seat can hold the table
indefinitely with trivial inputs (gap G3).

### 1.3 Reconnect, resume, seat holding

Lichess documents the mobile reality well: on disconnect the client retries with exponential
backoff (roughly 1, 2, 4, 8, 16, 30, 30, 30 seconds) and then fails; on reconnect the server
replays the full game so the client can rebuild (https://lichess.org/forum/lichess-feedback/reconnect).
Emberisle's client backoff is `[1000, 2000, 4000, 8000, 15000]`ms then every 15s for up to 10 minutes
(src/lib/net/table.ts:179-180), and the server replays full state on rejoin (`rejoin`,
server/host.mjs:1006, ends with `pushState`). That matches the Lichess shape and is the right call
for a turn-based game: full snapshot on reconnect beats delta replay because the state is small
and the logic is one path.

The websocket-realtime-sync-engine pattern doc independently converges on the same primitives:
`resync_request`/`resync_ack` frames carrying the client's last server sequence, and a `batch` of
missed deltas with a snapshot fallback
(https://github.com/rmazrim/opencode-artes/blob/HEAD/skills/websocket-realtime-sync-engine/websocket-realtime-sync-engine.md).
(inferred) For Emberisle's message sizes, snapshot-always is cheaper to reason about than
delta-replay; keep it.

One genuine hazard the research surfaced, and the audit confirmed, is what the client does with
*unsent* intents across a reconnect: Emberisle's client queues raw messages while disconnected and
replays the whole queue on the new socket (src/lib/net/table.ts:190,204-211). Nothing on the wire
ties an intent to the game state it was made against. That is gap G1, the highest-risk item below.

### 1.4 Matchmaking, lobbies, invites, rematch, spectators

Colonist and Board Game Arena both run lobbies plus matchmaking plus karma because they serve
strangers. Emberisle is friends-first by design: invite by 4-letter code, no matchmaking queue.
That is the right scope (inferred): matchmaking only pays for itself with a stranger pool, and it
brings moderation, smurfing, and rating systems with it. What friends-first tables do need, and
Emberisle already has: rematch at the same table (`again()`, src/lib/net/table.ts), spectators
(server/host.mjs:655-663, SPECTATOR_MAX 8), and a host hand-off when the host leaves
(server/host.mjs:1062 `handOffHost`). The audit found no gaps here worth scheduling; the one
watch-item is spectator rejoin on flaky networks (G8, low).

### 1.5 Anti-cheat for hidden information

The baseline from the multiplayer-game skill (local: `/opt/hatch/skills/multiplayer-game/SKILL.md`)
is: bind identity to connection, validate every input server-side, never trust the client with
hidden state, rate-limit per player. Emberisle's posture is already strong:

- The RNG seed is never sent to clients (prior research decision; not re-proposed here).
- Every client gets a per-seat redacted view (`viewFor`, server/host.mjs:276; `closedView` at :288
  hides hands and fortunes from other seats and from watchers).
- Every intent is re-validated by `applyAction` in `play()` (server/host.mjs:885).
- Rate limits: 20-burst/4-per-second per seat on actions, 5-per-5s on chat
  (server/host.mjs:44-46).

The residual cheat surface is *information the server legitimately sends*: `legalFor` is computed
per seat and sent with every state (server/host.mjs `pushState`), which is correct, but any future
addition to the per-seat view must pass the same redaction review. The deeper fairness question is
RNG verifiability: today players must trust the host's dice. The standard answer is a commit-reveal
scheme or a public hash chain, but that is overkill for a friends-first game with no stakes; it is
recorded as deferred (G6), not scheduled.

### 1.6 Persistence and recovery

`save()` writes every room to `server/rooms/<code>.json` after each change, atomically
(write-then-rename, server/host.mjs:167-169), with a shape version (`ROOM_SHAPE`, :66) and a 24h TTL
on load (:182-230). On boot, seats are restored held and the game continues when someone rejoins.
This is better than most hobby game servers. Two scale notes: the write is synchronous on the hot
path (G5), and there are no backups of the room directory (section 3).

### 1.7 Observability

The research question was "what do the good ones measure?" Colonist's karma system implies they
track disconnects and AFK events per player; Lichess's lag compensation implies per-player RTT
histograms; matchmaking systems (AWS GameLift's latency-based placement notes,
https://aws.amazon.com/blogs/gametech/fine-tuning-player-latency-with-amazon-gamelift-servers/)
track player latency distributions to place sessions. Distilled to Emberisle's scale, the metrics
that matter are:

- **Time to first move**: welcome sent to first accepted action. The single best "does the game
  feel alive" number.
- **Turn latency**: action received to broadcast sent (server-side), p50/p95. Distinguishes "the
  host is slow" from "my network is slow".
- **Disconnect rate**: drops per table-hour, and **reconnect success rate**: rejoins that land back
  in the same seat versus seats let go.
- **AFK/bot rates**: `turnOut` fires, `takeOver` fires. A rising trend means the timers are wrong
  or the player base is churning.
- **Save duration** and **event-loop lag**: the early warning for G5.
- Gauges: rooms, seated players, watchers, sockets.

Today the host emits unstructured `console.log`/`console.error` lines only. Gap G4.

### 1.8 Protocol design

The websocket-realtime-sync-engine doc's envelope is the shape to converge on: every event carries
a protocol version, an event id, and a sequence/cursor; the client applies only events newer than
its cursor and requests a snapshot on a gap
(https://github.com/rmazrim/opencode-artes/blob/HEAD/skills/websocket-realtime-sync-engine/websocket-realtime-sync-engine.md).
Emberisle's messages are bare `{ type, ... }` with no version and no sequence
(server/host.mjs:94 `send`; welcomes at :624/:650/:663/:1020). For a web client deployed alongside
the host this mostly works, until it does not: a stale tab from before a deploy speaks the old
protocol to a new host. Gap G2.

On diffs versus full state: the game state is small (a few KB of JSON) and changes a few times per
minute. (inferred) Full-state broadcast per change is the right trade for this game; diffs would
save bytes nobody is paying for while adding a whole class of desync bugs. Keep full snapshots;
add sequence numbers so the client can *detect* a missed broadcast (cheap, high value).

Rate limiting is already present and sane (ACT_CAP/ACT_RATE, chat bucket). The uncovered surface is
`hello`/`peek` (lobby enumeration), which is low-risk at ROOM_MAX 64 (G10).

---

## 2. Audit: gap list, ranked by risk

Format follows docs/FRAMEWORK.md: Deliverable / Completion test / Depends on / Source / Files / Size,
plus the failure scenario in concrete terms. Risk ranking weighs likelihood times blast radius for a
friends-first game: corrupting a game in progress outranks theoretical cheating.

### G1. Stale queued intents replay after reconnect with no idempotency or freshness check

- **Files:** src/lib/net/table.ts:190 (`queue.push`), :204-211 (queue replayed on every reconnect);
  server/host.mjs:885 `play()` (no idempotency key, no base-seq check).
- **Failure scenario:** Maya taps "discard 4 timber" as her phone locks. The socket dies before the
  message is flushed, so the client queues the raw intent. The table's bot takes over after 90s,
  discards for her, and play continues. Four minutes later Maya's client rejoins and replays the
  queued discard. If anyone owes a discard in the new game position, the server applies Maya's
  stale card selection to a situation she never saw. If nothing is owed, `play()` refuses
  with "not ready" and she is merely confused. Either way the client acted on a game state that no
  longer exists, and the server cannot tell.
- **Proposed fix:** tag every client intent with `cid` (random id) and `baseSeq` (the `game.seq`
  the intent was built against; the client already receives the game object with each state).
  Server keeps a small ring (e.g. last 32) of applied `cid`s per seat: refuse duplicates, and
  refuse intents whose `baseSeq` is older than the current `game.seq` with a `stale` error that
  triggers a state push. The rejoin path should also drop the queue when the seat's game has
  advanced (belt and suspenders on the client).
- **Completion test:** a `*-prove.mjs` script seats two players, has seat A send `roll` with
  `baseSeq = N`, kills A's socket, advances the game to `N+3` via the bot, rejoins A (queue
  replays the stale roll), and asserts: the server answers `{type:"error"}` containing "stale",
  `game.seq` is unchanged by the replay, and a follow-up intent with `baseSeq = N+3` is accepted.
- **Depends on:** nothing. **Source:** audit of table.ts:204-211 against the Tablecraft
  reject/rollback rules (section 1.1). **Size:** S (wire fields + ring buffer + proof).

### G2. No protocol version in the wire protocol

- **Files:** server/host.mjs:94 `send()`, :624/:650/:663/:1020 `welcome` (no version field);
  src/lib/net/table.ts `hello` (no version field). Grep for "version" across both files returns
  nothing protocol-related.
- **Failure scenario:** the host is redeployed with a new message shape (say `play {card}` gains a
  field) while a player's tab from before the deploy is still open on a held seat. The stale tab
  rejoins, gets a welcome it half-understands, and its intents are refused with "not ready" or
  silently misread. Nobody can tell from the UI that the tab is simply old.
- **Proposed fix:** `proto: 1` in every `hello` and `welcome`. Host refuses `hello` with an
  unknown future proto with an "update your client" error; client shows a refresh banner on a
  `welcome` with a newer proto than it knows. Bump the number on breaking changes only.
- **Completion test:** proof script sends `hello {proto: 999}` and asserts an error naming the
  protocol; sends `hello` without proto and asserts acceptance as proto 0 during the transition
  window.
- **Depends on:** nothing. **Source:** section 1.8 envelope pattern. **Size:** XS.

### G3. Turn timer rearms on every action: no bound on total turn length

- **Files:** server/host.mjs:354-364 `armTurns` (arms TURN_MS when a seat is waited on),
  :387 `turnOut` (bot moves on expiry), and `play()` disarms via `disarmTurn` on every accepted
  action, so each action restarts the 120s window.
- **Failure scenario:** in a 4-player game, a stalling seat makes one trivial action (a trade ask,
  a bank trade it immediately undoes) every 119 seconds. TURN_MS never fires because every action
  rearms it. The other three players wait indefinitely; the bot-takeover path never engages because
  the seat is "active".
- **Proposed fix:** add a cumulative per-turn budget (suggested default: 6x TURN_MS, env knob
  `TURN_TOTAL_MS`). Track `turnStartedAt` per seat alongside `turnDeadline`; when the budget is
  exceeded, `turnOut` fires regardless of recent activity, the bot passes/plays, the seat stays
  human (consistent with #324/#344), and the log says the table moved on. Colonist's per-phase
  totals are the precedent (section 1.2); the cumulative budget is the friends-first equivalent.
- **Completion test:** scripted seat sends a legal no-op-ish action every 10s (well under TURN_MS)
  for longer than the budget; assert the host force-passes at the budget and the log contains the
  moved-on line.
- **Depends on:** nothing. **Source:** Colonist timer blog (per-phase caps) vs audit of armTurns.
  **Size:** S.

### G4. No structured observability: flying blind on the metrics that matter

- **Files:** server/host.mjs scatters `console.log`/`console.error` (e.g. :167-169 save errors,
  :1125 pinger, restore line in `load()`). No counters, no endpoint.
- **Failure scenario:** players report "the game felt laggy tonight". There is no way to
  distinguish host CPU pressure, Cloudflare tunnel latency, or one player's Wi-Fi, and no baseline
  to compare against. AFK/bot-takeover trends, which would signal timer misconfiguration, are
  invisible.
- **Proposed fix:** in-memory counters and a `GET /metrics` JSON endpoint on the host: gauges
  (rooms, seats, watchers, sockets), counters (messages in/out, actions accepted/refused, turnOuts,
  takeOvers, rejoins, letGos), histograms (action-to-broadcast latency, save duration, per-player
  RTT from the ping loop), and event-loop lag. Log one JSON line per significant event
  (action, turnOut, takeOver, rejoin, save failure) so the night supervisor's logs become greppable.
  This is the full section 1.7 list; start with time-to-first-move, turn latency p95, disconnect
  rate, reconnect success rate.
- **Completion test:** proof script plays N scripted actions, then asserts `/metrics` reports the
  action count, p95 action-to-broadcast latency under 250ms on loopback, and that a forced
  disconnect/rejoin increments the reconnect counter.
- **Depends on:** nothing. **Source:** section 1.7. **Size:** S (at the top of the range;
  file as two S issues if one session can't hold it: (a) the `/metrics` endpoint + counters,
  (b) the JSON log lines + proofs).

### G5. Synchronous disk write on every state change

- **Files:** server/host.mjs:151-173 `save()` (writeFileSync + renameSync), called from
  `pushState` on every accepted action, chat message, and bot move.
- **Failure scenario:** at friends scale this is fine and the atomic rename is genuinely good
  crash hygiene. As table count grows, every broadcast pays a synchronous fs write; a slow disk
  (or a burst of bot-vs-bot actions across many rooms) adds latency spikes to the exact path the
  turn-latency metric (G4) would flag.
- **Proposed fix:** coalesce saves per room with a short trailing debounce (e.g. 250ms): mark
  dirty on change, flush once. Keep write-then-rename. Keep a final synchronous flush on
  process exit signals. Measure save duration in /metrics (feeds G4).
- **Completion test:** 50 rapid actions in one room complete; assert disk writes for that room
  number 5 or fewer within any 2s window, the room file parses, and `load()` restores the final
  state exactly.
- **Depends on:** G4 for the duration metric (can ship without it). **Source:** audit of the
  pushState path. **Size:** S.

### G6. RNG fairness is trust-the-host (deferred, not scheduled)

- **Files:** server-side RNG feeding rules.ts; seed deliberately never sent (prior decision).
- **Failure scenario:** in a competitive or stranger setting, a player on a bad dice night has no
  way to verify fairness, and accusations have no resolution path. No exploit is known; this is
  about verifiability, not a live hole.
- **Proposed fix (deferred):** commit-reveal per game (host publishes hash of seed at game start,
  reveals seed at game end; anyone can re-simulate) or a public hash chain over dice outcomes.
  Explicitly not scheduled for friends-first: no stakes, real complexity cost, and the current
  posture (seed never leaves the server, per-seat redaction) is the correct priority order.
- **Completion test:** n/a until scheduled. When built: proof script replays a finished game from
  the revealed seed and asserts identical dice.
- **Depends on:** a ranked/competitive mode existing. **Source:** section 1.5. **Size:** S
  (when scheduled; deferred — see Depends on).

### G7. Client give-up and server hold race at exactly 10 minutes

- **Files:** src/lib/net/table.ts:179-180 (`GIVE_UP_MS = 10 * 60 * 1000`); server/host.mjs:50
  (`HOLD_MS = 10 * 60 * 1000`), :1086 `letGo`.
- **Failure scenario:** a player on a very flaky link backs off for the full 10 minutes while the
  server's hold timer fires at the same 10-minute mark. The seat is let go at the moment the
  player returns; they come back to "Seat is gone." The window is small but it is exactly the
  worst moment to fail.
- **Proposed fix:** make the client's give-up derive from the server: include the hold deadline
  (or hold duration) in `welcome`, and set client give-up to hold plus a margin (e.g. +60s).
  Alternatively shorten the client give-up is wrong direction; the server should always outlast
  the client's patience.
- **Completion test:** with shortened env knobs (proofs already shorten these), rejoin just
  before the hold expiry succeeds, and the server never fires `letGo` while the client's backoff
  is still pending.
- **Depends on:** nothing (G2's versioning would be the natural carrier for the new welcome
  field, but it can ride as an optional field). **Source:** audit of the two 10-minute constants.
  **Size:** XS.

### G8. Spectator path has no rejoin identity (watch item, low risk)

- **Files:** server/host.mjs:655-663 (watch hello; no secret, no seat).
- **Failure scenario:** a spectator on a flaky network reconnects repeatedly; each rejoin is a
  fresh watcher. WATCH_LOG_MS (5s, :41) already rate-limits the log spam, and watchers hold no
  state, so the impact is cosmetic.
- **Proposed fix:** none scheduled. If spectator chat or presence hardens later, give watchers a
  lightweight token like seats have.
- **Completion test:** n/a. **Source:** audit. **Size:** XS if ever scheduled.

### G9. Turn deadlines do not survive a host restart

- **Files:** server/host.mjs:151-173 `save()` (per-seat save keeps only
  `id, name, color, ready, pid, secret`; the comment says it outright: "Sockets, timers and the
  open trade offer stay in memory"), :182-230 `load()` (every seat is rebuilt held; `hold()` at
  :1053 calls `disarmTurn`), :354-364 `armTurns` (re-arms a fresh full TURN_MS on the next
  `pushState`), :1006-1032 `rejoin` (ends in `pushState`).
- **Failure scenario:** the host dies mid-turn (kill -9, OOM, a deploy) while seat A has 20 s
  left of its 120 s window. `night` restarts the host and `load()` restores the room with no
  timer state. When A rejoins, `pushState` → `armTurns` arms a brand-new full 120 s window
  measured from the rejoin moment. Two consequences: (1) an outage *extends* the stall — the
  table can wait nearly two extra minutes for a seat that had 20 s left; (2) if the deadline
  already passed during the outage, the idle seat is silently granted a fresh window instead of
  `turnOut` firing — the AFK policy resets itself. Every client's countdown also jumps, because
  the new `turnDeadline` has no relation to the old one.
- **Proposed fix:** persist the absolute deadline. Add nullable `turnDeadline` (epoch ms) to
  the per-seat save shape and bump ROOM_SHAPE (the README requires it whenever the seat record
  changes shape). Teach `armTurns` to prefer a carried deadline: if it is still in the future,
  arm `setTimeout(turnOut, deadline - now)` and restore `seat.turnDeadline`, clamping tiny
  remainders (under ~5 s) to expired so a timeout does not fire into a player mid-rejoin; if it
  is already past, call `turnOut(room, seat)` instead of arming — the seat stays human and the
  bot makes the one move, exactly the existing #344 policy. When G3's cumulative budget lands,
  its `turnStartedAt` rides the same save/load path.
- **Completion test:** a `*-prove.mjs` script with shortened TURN_MS: seat A becomes waited-on
  (deadline T+6 s), the host is killed at T+2 s and restarted, A rejoins at T+4 s; assert the
  `state`'s `turnDeadline` lands within ~1 s of the original T+6 s rather than a fresh T+10 s.
  Second run: restart after the deadline has passed; assert `turnOut` fires on rejoin (the log
  carries "took too long") instead of a new window being armed.
- **Depends on:** nothing (couples with G3 when scheduled). **Source:** audit of
  `save`/`load`/`armTurns`/`rejoin`. **Size:** S.

### G10. The pre-seat surface: room-slot exhaustion via `hello`, lobby enumeration via `peek`

- **Files:** server/host.mjs:968-977 (pre-seat branch: `hello` with no code → `openTable`),
  :998-1004 `peek()` (answers any 4-char code with full `seatsOf`, including names and avatar
  URLs, :118-128), :603-627 `openTable()`, :37 `ROOM_MAX` 64; server/chat.mjs:19
  `allow(bucket, now, cap = 5, rate = 1)` (pre-seat: 5-burst, 1/sec per socket).
- **Failure scenario:** two parts. (a) Slot exhaustion: each socket's pre-seat bucket allows a
  `hello`-with-no-code about once a second, and each one opens a table that holds a room slot.
  64 sockets — the README documents this itself: "a client that opens 64 sockets (about 13 s at
  the pre-seat rate) can fill the host" — after which every legitimate `hello` gets "The host is
  full." One laptop, one loop, game night over. (b) Enumeration: `peek` exists by design
  (docs/design/color-peek.md, #156) so a joiner can see taken colors, but it returns names too,
  to any socket, no seat required. The code space is 32^4 ≈ 1 M, so systematic harvesting at 1
  peek/sec/socket is impractical — the realistic leak is a code learned from a screenshot or a
  chat log yielding the table's player names without joining. Low-grade privacy, not game
  integrity.
- **Proposed fix:** split the privileges. Table creation gets its own host-wide bucket
  (suggested: burst 8, refill 1 per 30 s — a game night opens a handful of tables; a flood hits
  the creation cap long before ROOM_MAX). Per-socket counting cannot fix this because the attack
  *is* many sockets. For `peek`, keep the behavior #156 needs but redact names (and avatar URLs)
  for unseated sockets: colors, ready flags, and seat count are enough to dim the swatches; names
  appear after joining.
- **Completion test:** proof script with a tightened creation bucket opens tables from 12 rapid
  sockets; assert creations past the burst are refused with "Slow down." (or equivalent),
  ROOM_MAX is never reached, and a later legitimate `hello` still opens a table. Second: `peek`
  on a live lobby code returns colors and counts with no `name` field present.
- **Depends on:** nothing. **Source:** audit of the pre-seat branch; README's documented
  64-socket figure; docs/design/color-peek.md. **Size:** S.

---

## 3. Target architecture: the next six months

### 3.1 What "one cheap box" means

The host is a single Node 22 process on Jarrod's PC (or a $5–10 VPS later), started and
supervised by `npm run night`, fronted by a Cloudflare tunnel for internet play. That shape
stays. Nothing below adds a database, a second service, or a managed dependency: at this scale
every one of those is cost without benefit (inferred from the message rates — a turn-based table
emits a few messages a minute; even 100 tables are idle 99% of the time).

### 3.2 The six-month sketch (in build order)

Concrete, each one leaf-sized:

1. **Wire hardening (G1, G2).** `cid` + `baseSeq` on intents with a per-seat ring of applied
   ids; `proto: 1` on `hello`/`welcome`. The two cheapest insurance policies in the list, and
   they compose with everything after.
2. **Timer correctness (G3, G7, G9).** Cumulative turn budget (`TURN_TOTAL_MS`); the hold
   deadline advertised in `welcome` so the client's give-up always outlasts the server's;
   persisted `turnDeadline` across restarts. After this, no outage or stall can silently extend
   or reset a player's clock.
3. **Observability (G4).** `GET /metrics` JSON (gauges, counters, action-to-broadcast p50/p95,
   save duration, event-loop lag, per-player RTT from the existing ping loop) plus one JSON log
   line per significant event. Without this, every later "the game felt laggy" report is
   undebuggable.
4. **Save hygiene (G5).** Trailing debounce (~250 ms) per room, final synchronous flush on
   SIGTERM/SIGINT, save duration exported to /metrics. Keeps the atomic write-then-rename.
5. **Pre-seat discipline (G10).** Host-wide table-creation bucket; redacted `peek`.
6. **Deploy behavior.** Graceful shutdown in `night`: stop accepting new `hello`s, flush saves,
   then exit (today SIGINT just kills; G5's flush plus a drain flag closes the hole). Keep a
   small ring of room-directory backups (e.g. copy `server/rooms/` to `server/rooms.bak/` on
   boot, rotate 3) — write-then-rename protects against torn writes, not against a bug that
   saves corrupt-but-parseable state.
7. **Env knob documentation.** Every knob (`PORT`, `ROOMS_DIR`, `ROOM_MAX`, `GRACE_MS`,
   `HOLD_MS`, `LOBBY_HOLD_MS`, `TURN_MS`, `TURN_TOTAL_MS`, `ACT_CAP`, `ACT_RATE`,
   `SPECTATOR_MAX`) gets one line in the README's game-night section with its default and what
   breaks if you halve it. (inferred: operators tune what they can see.)

Deferred on purpose: RNG commit-reveal (G6 — no stakes, no strangers), spectator rejoin
identity (G8 — cosmetic), matchmaking/karma (section 1.4 — wrong for friends-first).

### 3.3 What changes at 1,000 concurrent tables

What does *not* change: the protocol (full-state snapshots are still the right trade — a state
is a few KB and changes a few times a minute), the single-writer rules engine, per-seat
redaction, the bot-takeover policy. 1,000 tables is ~4,000 players and on the order of tens of
state broadcasts per second; a single Node event loop is not the bottleneck (inferred from the
message-rate math, not load-tested — G4's metrics are the prerequisite for believing this).

What must change, concretely:

- **File descriptors and memory.** 4,000–12,000 concurrent sockets needs `ulimit -n` raised
  (the default 1024 kills you first) and ~1–2 GB RSS for socket buffers and room state. Ops
  config, not architecture.
- **Saves.** G5's debounce becomes mandatory, not nice-to-have; at this table count consider
  one SQLite file per host instead of 1,000 JSON files (fewer inodes, one fsync per batch).
  Keep the JSON shape — SQLite is a container change, not a format change.
- **Per-IP rate limits.** Behind the Cloudflare tunnel all clients share an egress IP, so
  per-IP limiting is disabled today by necessity. On a VPS with direct connections, add it: the
  pre-seat bucket becomes per-IP, which closes G10's multi-socket hole at the network layer
  instead of the application layer.
- **Horizontal: shard by room code.** Rooms share nothing — no cross-room state exists except
  ROOM_MAX accounting — so scaling out is sharding, not clustering: run N host processes and
  route each WebSocket to a host by `hash(code) mod N` in a thin router (or consistent hashing
  at the tunnel/VPS edge). Secrets, timers, and room files stay per-host; nothing needs a
  shared database. ROOM_MAX becomes per-host and the router enforces the global cap.
- **What still does not appear:** no Redis, no message queue, no separate API tier. If 1,000
  tables ever needs more than sharded single processes, the game has outgrown "friends-first"
  and the architecture gets redesigned then — not now.

### 3.4 The one-line version

Six months: same one-process host, hardened wire (G1/G2), honest timers (G3/G7/G9), metrics
(G4), cheap saves (G5), disciplined pre-seat (G10), graceful restarts. At 1,000 tables: raise
the fd limit, batch the saves, add per-IP limits on a direct VPS, and shard rooms by code
across processes — rooms share nothing, so horizontal scaling is routing, not re-architecture.
