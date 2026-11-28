# Online bot event feed: envelope, rejoin baseline and de-duplication

- Spec for [#1922](https://github.com/jarrodjohnson-gif/emberisle/issues/1922). It unblocks the build of [#725](https://github.com/jarrodjohnson-gif/emberisle/issues/725).
- Builds on [the feed research](../research/bot-event-feed.md) and [the rat robbery design](rat-robbery.md), "Online prerequisite and coalescing".
- Builder: claude-opus-a, Claude Opus 5.5, 2026-11-28.
- Source: main `b0bf081b68d6ff1faf5f03f2a52933c7bbb448a6`. Every `file:line` below is on that commit.
- Status: proposal. No `src/` or `server/` change ships with this document.

## Result

- The host keeps one bounded list of public events per game, in memory only.
- Each `state` message to a client that asks for it carries one envelope: the events since that socket's last `state`.
- Robbery records ride in the same envelope, as the robbery design asks.
- A socket's first `state` of a game is a silent baseline. So are a reconnect, a host restart, a rematch and a watcher join.
- The client admits an envelope only when it continues the last one exactly. Otherwise it falls back to today's #608 summary.
- Admitted bot events go to the #721 queue in host order, once each. The feed decides no cap and no interruption rule.
- An event carries only what the public log already shows.

## Source facts

| Source on `b0bf081b` | Fact this spec relies on |
| --- | --- |
| [rules.ts:559](../../src/lib/game/rules.ts#L559) | Every successful `applyAction` raises `seq` by exactly 1. |
| [host.mjs:930-965](../../server/host.mjs#L930) | `runBots` applies bot moves in one synchronous loop of up to 500 steps. |
| [host.mjs:945-948](../../server/host.mjs#L945) | A bot's table ask opens with `openOffer` and returns from `runBots`. The ask is the last thing in its slice. |
| [host.mjs:952-960](../../server/host.mjs#L952) | The bot commit sites: one action, or an `endTurn` pass. |
| [host.mjs:1987-1999](../../server/host.mjs#L1987), [2057-2064](../../server/host.mjs#L2057) | An accepted trade or counter applies two actions, so `seq` rises by 2. |
| [host.mjs:2132-2140](../../server/host.mjs#L2132) | `play` commits a person's action. `automated` is true only for a timed-out move. |
| [host.mjs:1045-1054](../../server/host.mjs#L1045) | `turnOut` plays one bot move for a person who ran out of time. |
| [host.mjs:1621](../../server/host.mjs#L1621) | `durableStart` puts every new game in place, first deal and rematch alike. |
| [host.mjs:1079-1126](../../server/host.mjs#L1079) | `pushState` builds one `state` per seat, and one shared string for all watchers (line 1120). |
| [host.mjs:1099-1102](../../server/host.mjs#L1099) | The terminal gate withholds the final state until the result is durable. |
| [host.mjs:1248-1255](../../server/host.mjs#L1248) | A stale intent resends `state` to that one socket. |
| [host.mjs:1589](../../server/host.mjs#L1589) | A watcher's first `state` comes from `watch`. |
| [host.mjs:1654-1656](../../server/host.mjs#L1654), [1797-1800](../../server/host.mjs#L1797), [1859-1865](../../server/host.mjs#L1859), [2165-2172](../../server/host.mjs#L2165), [2392-2394](../../server/host.mjs#L2392), [2477-2479](../../server/host.mjs#L2477) | Every `runBots` call is followed by `pushState` in the same synchronous handler. |
| [host.mjs:1873](../../server/host.mjs#L1873), [1888](../../server/host.mjs#L1888) | A trade id is `t<seq>-<n>`. `tradeOffer` is broadcast at once, before the slice's `pushState`. |
| [host.mjs:2379-2396](../../server/host.mjs#L2379) | A rejoin sends `welcome`, runs bots, pushes state, then resends an open offer. |
| [host.mjs:2475](../../server/host.mjs#L2475) | With nobody connected, bots wait. A rejoin runs them. |
| [host.mjs:396-426](../../server/host.mjs#L396) | The room snapshot is an explicit field list. Nothing outside it reaches disk. |
| [host.mjs:276](../../server/host.mjs#L276), [outcome-playback.mjs:12](../../server/outcome-playback.mjs#L12) | `roster.gameId` is a saved UUID. It reaches clients today only on the final frame's `outcome`. |
| [host.mjs:903-923](../../server/host.mjs#L903) | `closedView` strips seed, rng, opponents' hands and fortune identities. |
| [table.ts:451-456](../../src/lib/net/table.ts#L451) | The client passes the whole `state` message to the store. |
| [table.ts:482-483](../../src/lib/net/table.ts#L482), [proto.ts:15-16](../../src/lib/net/proto.ts#L15) | Other message types need an allowlist entry. Hello capabilities live in `TABLE_CAPS`. |
| [host.mjs:2373](../../server/host.mjs#L2373), [1525](../../server/host.mjs#L1525), [1559](../../server/host.mjs#L1559) | The host stores a seat's `caps`. `watch` (line 1574) stores none. |
| [store.ts:1330-1337](../../src/lib/game/store.ts#L1330) | `applyState` reads named fields only, then sends a state note to the bot moment feed. |
| [store.ts:1383](../../src/lib/game/store.ts#L1383), [1477-1484](../../src/lib/game/store.ts#L1477) | A welcome marks the next state `first`. A `tradeOffer` sends an offer note with `automated: null`. |
| [bot-moments.ts:198-275](../../src/lib/game/bot-moments.ts#L198) | `createBotMomentFeed` already keeps epochs, a seen-key set of 64 and a sequence watermark. |
| [bot-moments.ts:141-183](../../src/lib/game/bot-moments.ts#L141) | `observeSnapshot` is today's online fallback: one line, or one unordered summary, per bot seat. |
| [bot-moments.ts:68-136](../../src/lib/game/bot-moments.ts#L68) | `projectAction` holds the practice words for each bot line. |

## 1. The delivery envelope

### Shape

```ts
type FeedEnvelope = {
  gameId: string;          // opaque; new for every game and every host process
  fromSeq: number | null;  // this socket's previous state seq; null on its first state of this game
  toSeq: number;           // equals the attached state's game.seq
  complete: boolean;       // true when every committed seq in (fromSeq, toSeq] is accounted for
  events: FeedEvent[];     // host order; empty when complete is false or fromSeq is null
};
type FeedEvent = BotEvent | PublicRobbery;  // BotEvent: section 4; PublicRobbery: rat-robbery.md
```

### Host rules

1. Keep `room.feed = { gameId, n, floor, events }` in memory. Never add it to the snapshot ([host.mjs:396](../../server/host.mjs#L396)).
2. Create it fresh wherever `room.game` gets a new game ([host.mjs:1621](../../server/host.mjs#L1621)) and for every room `load()` restores.
3. Set `gameId` to 16 random bytes in hex. Set `n` and `floor` to 0.
4. Record events at the commit sites in the source table, through one helper. Do not infer them later from states.
5. Give each recorded event the next number `++n`. The number stays on the host. It never goes on the wire.
6. Hold at most 64 events. On overflow, drop the oldest and set `floor` to its number.
7. Each socket keeps three values: `feedGame`, `feedSeq` and `feedN`. A new socket has none.
8. For every `state` to a socket with the `feed` capability, build its envelope:
   - `feedGame` differs from `room.feed.gameId`, or is unset: send `fromSeq: null`, `complete: false`, no events.
   - `feedN` is below `floor`: send `fromSeq: feedSeq`, `complete: false`, no events.
   - Otherwise send `fromSeq: feedSeq`, `complete: true`, and every event numbered above `feedN`.
   - After sending, set `feedGame`, `feedSeq` to `toSeq`, and `feedN` to `n`. A withheld state ([host.mjs:1099](../../server/host.mjs#L1099)) moves nothing.
9. Use the same builder in `pushState`, in the stale-intent resend ([host.mjs:1248](../../server/host.mjs#L1248)) and in `watch` ([host.mjs:1589](../../server/host.mjs#L1589)).
10. Watchers: group them by `feedGame`, `feedSeq` and `feedN`. Serialize the state once per group, not once per watcher.
11. Store `caps` for watchers in `watch`, the way seats store them.
12. Send no `feed` field to a socket without the `feed` capability. Its messages stay byte-identical to today's.

A trade's two applied actions make no event. Rule 8 still works: `complete` counts recorded events, not seq values.
The running number also sends an ask exactly once, even when its seq equals `fromSeq`.

### Test cases (host)

- One bot slice with three commits: every seat and every watcher gets the same three events, in commit order.
- Two pushes in a row: the second envelope's `fromSeq` equals the first one's `toSeq`.
- A push with no commits (the extension microtask, [host.mjs:1064](../../server/host.mjs#L1064)): `fromSeq === toSeq`, no events.
- A forced 65-event gap: `complete: false`, no events. The next push is complete again.
- A client without the capability: the `state` bytes equal today's for the same fixture.
- A stale intent between two bot slices: the resend carries the missing events, and the next push does not repeat them.
- Two watchers at the same watermark: one serialization. A watcher who joined late gets its own baseline.

### Options

**Where the envelope rides.**

| Option | For | Against |
| --- | --- | --- |
| **A (recommended): a `feed` field on `state`** | Atomic with the board it describes. No allowlist change ([table.ts:451](../../src/lib/net/table.ts#L451)). Old clients ignore it ([store.ts:1330](../../src/lib/game/store.ts#L1330)). | Watcher states need one string per watermark group. |
| B: a separate `feed` message before each `state` | Watchers keep one shared state string. | A new allowlist entry. The client must pair two messages and handle a split. |
| C: broadcast each event at commit, like `tradeOffer` | Lowest latency. | Events arrive before the state that shows them. A rejoin cannot tell old events from new. |

**Who gets it.**

- **A (recommended): only sockets whose hello lists `feed` in `TABLE_CAPS`.** This matches the `counter` capability ([proto.ts:14-15](../../src/lib/net/proto.ts#L14)).
- B: every socket. It is simpler, but sends bytes old clients drop. `PROTO` stays 1 either way: the change only adds fields.

**What `gameId` is.**

- **A (recommended): random per game, per host process.** A host restart then yields a new id, so a baseline is certain.
- B: `roster.gameId` ([host.mjs:276](../../server/host.mjs#L276)). It survives a restart and is a profile-record key. It would reach every push, not only the final one.

**The bound.**

- **A (recommended): one list of 64 events per room.** Every recipient sees the same public events, so per-recipient lists add nothing.
- B: eight robbery records per recipient, as rat-robbery.md says. It cannot hold one bot turn.
- C: no bound within a turn. `runBots` allows 500 steps ([host.mjs:931](../../server/host.mjs#L931)), so this is not bounded.

Measured on `b0bf081b` with production rules: commits between two host state pushes, one person among bots.
Bot asks were left out. An ask ends a slice early, so this overcounts.

| Table | Games | Pushes | Mean | p99 | p99.9 | Max |
| --- | --- | --- | --- | --- | --- | --- |
| 1 person, 3 bots, classic | 500 | 46,811 | 3.93 | 15 | 17 | 20 |
| 1 person, 5 bots, expanded | 200 | 18,164 | 5.88 | 21 | 24 | 27 |

Counts vary slightly between runs. An earlier run of the same script gave a maximum of 28 for the expanded table.
64 is more than twice the largest slice seen. The script is in the appendix. Leaf 1 turns it into a proof assertion.

### What changes in rat-robbery.md's envelope

| rat-robbery.md, "Online prerequisite and coalescing" | This spec | Why |
| --- | --- | --- |
| A `robberies` list | One `events` list. A robbery entry is the `PublicRobbery` record unchanged. | One transport for both. |
| Eight pending robbery records per recipient | 64 events per room, and three values per socket | Bot turns need more room. Recipients share one list. |
| `fromSeq` is the recipient's previous state seq | The same, and `null` on a socket's first state of a game | The client can see a baseline without guessing. |
| Overflow: `complete: false`, empty list | The same | - |
| Initial, resumed, restarted and rematch states are silent | The same, plus a watcher join and a client reset | Section 2. |
| Reject the whole envelope on duplicates, disorder, wrong game or interval mismatch | The same. Bot moments then fall back to the #608 summary. The rat still runs nowhere. | #725 asks for that fallback. |
| Absent envelope: a silent baseline | Absent envelope: today's behaviour | An old host keeps the #608 summaries. |
| Route rules: one robbery, `seq === toSeq`, anchors match | Unchanged | - |

The robbery record's own `gameId` must equal the envelope's. Leaf 3 updates rat-robbery.md to point here.

## 2. Rejoin baseline

**Rule.** The first `state` a client applies after any of these is a baseline. A baseline sets the watermark and plays no cue.

| Boundary | How the client knows | Host source |
| --- | --- | --- |
| First load or join | `first` after `welcome` ([store.ts:1383](../../src/lib/game/store.ts#L1383)); `fromSeq: null` | New socket |
| Reconnect or page reload | The same | `rejoin` ([host.mjs:2361](../../server/host.mjs#L2361)) |
| Host restart | The same, and a new `gameId` | Restored room, new sockets |
| Rematch or new deal | A new `gameId`; `fromSeq: null` | `durableStart` ([host.mjs:1621](../../server/host.mjs#L1621)) |
| Watcher join | `first`; `fromSeq: null` | `watch` ([host.mjs:1589](../../server/host.mjs#L1589)) |
| Client reset (hidden page, leave, test) | The feed has no `gameId` | `reset()` ([bot-moments.ts:223](../../src/lib/game/bot-moments.ts#L223)) |

The client treats a state as a baseline when either side says so. It never needs both.

**Moves made before the baseline stay silent.** That covers:

- bot moves made while the person was away;
- bot moves in the rejoin's own slice ([host.mjs:2392](../../server/host.mjs#L2392)). Other seats still get them;
- setup and roll-off moves bots made before the first push of a game ([host.mjs:1654](../../server/host.mjs#L1654), [1797](../../server/host.mjs#L1797));
- an open bot ask resent after a rejoin ([host.mjs:2396](../../server/host.mjs#L2396)). Its offer card still shows. Its line does not.

The last item fixes today's code. Today a resent `tradeOffer` sends a fresh offer note into a new epoch ([store.ts:1484](../../src/lib/game/store.ts#L1484)). That would announce an old ask.

### Test cases (baseline)

- Reconnect after a bot played three moves: no line, no cue. The next bot move makes one line.
- Reconnect during a slice that runs bots: the rejoiner gets nothing; a second seat gets every event.
- Host restart mid-turn, then rejoin: new `gameId`, no line.
- Rematch on an identical island: new `gameId`, no line for the bots' setup.
- Watcher joins mid-turn: no line. A later bot move makes one.
- Rejoin while a bot's ask is open: the offer card shows; no ask line. After the offer closes, the bot's next move makes one line.
- Hide the page, bots play, show it: no catch-up lines.

## 3. Client queue and de-duplication

### Admission

The state note gains `feed`, taken from the `state` message in `applyState` ([store.ts:1330](../../src/lib/game/store.ts#L1330)).
`createBotMomentFeed` ([bot-moments.ts:198](../../src/lib/game/bot-moments.ts#L198)) checks it in this order:

1. **Baseline.** `first`, no `gameId` yet, a new `gameId`, or `fromSeq === null`: start a new epoch. Set `gameId`, the watermark to `toSeq`, and `base` to the state. Emit nothing.
2. **No envelope.** An old host or a client without the capability: keep today's `observeSnapshot` path.
3. **Stale.** `toSeq` below the watermark: ignore the state's events. This matches today's `after.seq <= lastSeq` check ([bot-moments.ts:267](../../src/lib/game/bot-moments.ts#L267)).
4. **Repeat.** `fromSeq` and `toSeq` both equal the watermark: nothing new. Emit nothing.
5. **Gap or mismatch.** `fromSeq` differs from the watermark, or `toSeq` differs from `game.seq`: reject the whole envelope.
6. **Incomplete.** `complete: false`: reject the whole envelope.
7. **Malformed.** Reject the whole envelope when any event:
   - has an unknown `kind` or a key outside section 4's list;
   - names a player, edge, vertex or hex absent from the state;
   - is a commit event with `seq` outside `(fromSeq, toSeq]`, or an ask with `seq` outside `[fromSeq, toSeq]`;
   - is out of order: `seq` must never fall;
   - repeats a key, or the envelope has more than 64 events.
8. **Admit.** Walk the events in order:
   - a commit event emits one moment, keyed `a<seq>` in the existing seen set ([bot-moments.ts:212](../../src/lib/game/bot-moments.ts#L212));
   - an ask emits one moment, keyed `t<tradeId>`, the key today's offer path uses ([bot-moments.ts:245](../../src/lib/game/bot-moments.ts#L245));
   - a robbery record goes to the robbery consumer, never to #721.

   Then set the watermark to `toSeq` and `base` to the state.

On a reject (steps 5 to 7), run today's `observeSnapshot(base, state)` once. Then set the watermark and `base` as in step 8.
That is #725's fallback: an unordered summary for moves the feed could not vouch for.

Once an epoch has seen any envelope, an offer note with `automated: null` makes no moment. The envelope's ask owns that line.

**Bounds.** The client keeps one `gameId`, one watermark, one base state and the existing seen set of 64 keys. It keeps no event list.

### Words and source

- A host-event moment gets `source: "host-event"`, `ordered: true`, and targets from the event's ids.
- Build its text from the same words `projectAction` uses ([bot-moments.ts:83-131](../../src/lib/game/bot-moments.ts#L83)). Practice and online then read the same.
- Names and the wayfarer's number come from the attached state, as `hexPlace` does ([bot-moments.ts:58](../../src/lib/game/bot-moments.ts#L58)).

### Hand-off to #721

- The feed calls `emit` once per admitted event, synchronously, in host order. It never drops, merges or delays one.
- `reset()` and each new epoch are the only signals the feed sends #721.
- The cap and overflow line are #721's call, under its open question 1 (A, B or C). The feed's output is the same under each.
- What interrupts a line is #721's call, under its open question 2 (A, B or C). The feed's output is the same under each.
- One spot depends on #721: whether a new epoch clears its waiting lines. #721's completion test already lists baseline resets.

### Test cases (client)

- Envelope with path A then path B: two moments, A first. The reverse envelope: B first.
- The same envelope twice: the second adds nothing.
- An envelope whose `fromSeq` skips one push: no host-event moment; one `observeSnapshot` result instead.
- `complete: false`: the same fallback.
- An event naming a missing edge, a repeated key, or an unknown field: the whole envelope falls back.
- A bot ask in the envelope after two earlier bot moves: the ask line comes third. The earlier `tradeOffer` makes no line.
- A state with no `feed` from an old host: today's behaviour, unchanged.
- 1,000 pushes: the seen set never passes 64 keys.

## 4. What an event may carry

Every bot event has `kind`, `seq` and `actorId`. Nothing else is allowed beyond the fields below.

The host emits a bot event only for a commit made in `runBots` ([host.mjs:952-960](../../server/host.mjs#L952)), and for a bot's ask.
That matches today's rule: only `kind: "bot"` seats get lines online ([bot-moments.ts:140](../../src/lib/game/bot-moments.ts#L140)).
A taken-over seat is `kind: "bot"` ([host.mjs:2466](../../server/host.mjs#L2466)), so it counts. A timed-out person's one move does not (question 1).

| `kind` | From action | Extra fields | Already public in | Never carried |
| --- | --- | --- | --- | --- |
| `path` | `setupRoad`, `buildPath` | `edgeId` | the board edge | cost paid |
| `outpost` | `setupSettle`, `buildOutpost` | `vertexId` | the board vertex | cost paid |
| `stronghold` | `buildStronghold` | `vertexId` | the board vertex | cost paid |
| `fortune` | `buyCard` | none | log line ([rules.ts:514](../../src/lib/game/rules.ts#L514)) | which fortune, deck order |
| `pathFortune` | `playRoad` | `edgeIds` (1 or 2, from the board change) | log line ([rules.ts:525](../../src/lib/game/rules.ts#L525)) | unplayed fortunes |
| `wayfarer` | `moveRobber` | `hexId`, `victimId` or null | log line ([rules.ts:516-523](../../src/lib/game/rules.ts#L516)) | which good was taken |
| `wayfarerFortune` | `playKnight` | `hexId` or null (wayfarer off), `victimId` or null | the same log line | which good was taken |
| `plenty` | `playPlenty` | `gains` (resource counts) | log line ([rules.ts:526](../../src/lib/game/rules.ts#L526)) | the rest of the hand |
| `monopoly` | `playMonopoly` | `resource`, `count` | log line ([rules.ts:527](../../src/lib/game/rules.ts#L527)) | the rest of the hand |
| `discard` | `discard` | `count` | log line ([rules.ts:515](../../src/lib/game/rules.ts#L515)) | which goods |
| `bankTrade` | `bankTrade` | `give`, `want`, `rate` | log line ([rules.ts:528-531](../../src/lib/game/rules.ts#L528)) | the rest of the hand |
| `ask` | `openOffer` by a bot | `tradeId`, `give`, `want` | `tradeOffer` ([host.mjs:1888](../../server/host.mjs#L1888)) | answers not yet given |
| `robbery` | any actor's theft | the `PublicRobbery` fields | rat-robbery.md, "Committed capture contract" | the stolen good |

- A roll, an end of turn, a roll-off die and an accepted trade make no event. Their own messages and moments stay.
- The host derives every field from the committed result, never from the request. `victimId` is whoever lost a good, as `projectAction` does ([bot-moments.ts:105](../../src/lib/game/bot-moments.ts#L105)).
- No event carries a seed, rng, hand, deck, fortune identity, stolen good, log text or name.

### Test cases (privacy)

- Check every serialized event against the exact key list per `kind`, recursively.
- Steal each of the five goods in turn: the events differ only in ids and `seq`.
- Buy each fortune type in turn: the `fortune` events are identical apart from `seq`.
- A watcher's events equal every seat's events for the same push.

## 5. The two-path-order case

[bot-action-order-prove](../../scripts/bot-action-order-prove.mjs) commits two paths, A then B, and B then A, from seq 12.
On `b0bf081b` it passes. Both histories end at seq 14 with byte-identical state and log.

Expected result online with the feed:

| History | Envelope events | Lines the client emits, in order |
| --- | --- | --- |
| A then B | `{kind:"path", seq:13, edgeId:A}`, `{kind:"path", seq:14, edgeId:B}` | A's line, then B's line |
| B then A | `{kind:"path", seq:13, edgeId:B}`, `{kind:"path", seq:14, edgeId:A}` | B's line, then A's line |

- The two final states stay identical. Only the envelopes differ.
- Without an envelope, both histories give the same one summary, "Tide makes 2 changes", as today.
- Leaf 1 adds this case to the host proof. Leaf 2 adds it to the client proof.

## 6. Build leaves

Each leaf is one PR with fresh claims. Register every new proof in `package.json` and `.github/workflows/ci.yml`.

| Leaf | Files | Depends on | Completion test |
| --- | --- | --- | --- |
| 1. Host feed | `src/lib/game/feed.ts` (new: types, projection, list, envelope builder), `server/host.mjs`, `server/feed-prove.mjs` (new) | This spec | The host test cases in sections 1 and 2, the privacy cases, both two-path histories, and the bound check over seeded games. `npm test` passes. |
| 2. Client consumer | `src/lib/net/proto.ts` (`feed` capability), `src/lib/game/store.ts` (pass `feed` on the state note), `src/lib/game/bot-moments.ts`, `scripts/bot-feed-client-prove.mjs` (new) | Leaf 1 | The client test cases in sections 2 and 3, against leaf 1's real host. `bot-moments-event-prove` passes unchanged. Size budgets hold. |
| 3. Robbery records | `src/lib/game/feed.ts`, `server/host.mjs` (every commit site), `server/robbery-prove.mjs` (new), `docs/design/rat-robbery.md` | Leaf 1, #1924 | rat-robbery.md's online rows, through this envelope. |
| 4. Online proof for #725 | A browser proof with a room, one bot seat and a watcher | Leaves 1 and 2, #721, #723 | #725's completion test: true order on screen, watchers equal, no hidden information. |

`table.ts` needs a type change only, so its 2,300 B ceiling ([size-prove.mjs:36](../../scripts/size-prove.mjs#L36)) is not at risk.

## Open questions for Jarrod

1. **A timed-out person's automatic move.** When time runs out, the host makes one move for them ([host.mjs:1052-1053](../../server/host.mjs#L1052)).
   - **A (recommended): no bot line.** The table already says "took too long". Today's online code shows no line for a person's seat.
   - B: a bot line, like any bot move.
2. **Sound for exact online bot moves.** Today each state's own sounds play when it arrives. Practice moves a matching cue to the line's start (#723).
   - **A (recommended): online keeps today's sounds.** No sound waits for a line, so sound never lags the board.
   - B: online moves the cue to the line's start, as practice does. A long queue then delays sounds by seconds.

Not asked here: #721's two open questions, on the cap of six and on what interrupts a line. Section 3 works under any answer.

## Checks run for this document

- `npm run bot-action-order-prove` on `b0bf081b`: all checks passed, final seq 14.
- The measurement script below, with the totals in section 1.
- Line references read on `b0bf081b`. No runtime test covers this proposal.

## Appendix: the slice measurement

Run from the repo root: `node --import ./server/register.mjs slice-count.mjs 500`.
For the expanded table, import `createExpandedGame` from `expanded.ts` and use `bots: 5`.

```js
import { createGame } from "./src/lib/game/board.ts";
import { chooseBotAction } from "./src/lib/game/ai.ts";
import { applyAction } from "./src/lib/game/rules.ts";
const GAMES = Number(process.argv[2] ?? 200);
let over = 0, max = 0, slices = 0, sum = 0;
const hist = new Map();
for (let s = 1; s <= GAMES; s++) {
  let g = createGame({ humans: [{ name: "H" }], bots: 3, seed: s });
  const human = g.players.find((p) => p.kind === "human").id;
  // One step as the host's runBots takes it: the bot's move, or a pass when that fails.
  const step = (pid) => {
    const a = chooseBotAction(g, pid);
    const r = a && applyAction(g, pid, a);
    if (!r || r.error) { const p = applyAction(g, pid, { type: "endTurn" }); if (p.error) return false; g = p.state; return true; }
    g = r.state; return true;
  };
  const runBots = () => {
    let n = 0;
    for (let i = 0; i < 500 && g.phase !== "over"; i++) {
      const w = g.phase === "discard"
        ? g.players.find((p) => p.kind === "bot" && (g.discardNeeded[p.id] ?? 0) > 0)
        : g.players.find((p) => p.kind === "bot" && p.id === g.current);
      if (!w || !step(w.id)) break;
      n++;
    }
    return n;
  };
  let pending = runBots();
  for (let guard = 0; g.phase !== "over" && guard < 5000; guard++) {
    slices++; sum += pending; max = Math.max(max, pending);
    hist.set(pending, (hist.get(pending) ?? 0) + 1);
    const mine = g.phase === "discard" ? (g.discardNeeded[human] ?? 0) > 0 : g.current === human;
    if (!mine || !step(human)) break;
    pending = 1 + runBots();
  }
  if (g.phase === "over") over++;
}
const sorted = [...hist.entries()].sort((a, b) => a[0] - b[0]);
const q = (f) => { let c = 0; for (const [k, v] of sorted) if ((c += v) >= f * slices) return k; };
console.log(JSON.stringify({ games: GAMES, over, pushes: slices, mean: +(sum / slices).toFixed(2), p99: q(0.99), p999: q(0.999), max }));
```
