# Design: the pre-setup roll-off for who places first (issue #149)

Source: [docs/research/first-player.md](../research/first-player.md) (#143), README Rule set → Setup and "Do not",
`createGame` in `board.ts`, `setupAdvance` and `rollDie` in `rules.ts`. Rematch (#150) is out of scope: it will seed the
first seat from `winner` and skip this phase.

## Rule

Before anyone places, each seated player rolls one die. The highest roll places first. If two or more tie for the
highest, only they roll again, until one is strictly ahead. Everyone else follows in order of the die on their seat,
highest first; the order they sat down breaks a tie between them. That order is the seat order for setup (then the
reverse) and for every turn after, so the first placer also takes the first production roll.

"The die on their seat" is each player's **latest** roll. A reroll replaces it. The dice on screen are the rule;
there is no hidden history. One consequence, accepted: a seat that loses a reroll can end up below a seat it beat in
the first round.

### Worked example, 3-way tie

Four seats in join order: Ember (p0), Tide (p1), Dune (p2), Pine (p3).

| Round | Who rolls | Dice | Result |
|---|---|---|---|
| 1 | everyone, join order | Ember 5, Tide 5, Dune 5, Pine 2 | top is 5, three leaders → "Ember, Tide, and Dune tie at 5 and roll again." Pine keeps her 2. |
| 2 | Ember, Tide, Dune | Ember 3, Tide 6, Dune 6 | top is 6, two leaders → "Tide and Dune tie at 6 and roll again." Ember keeps her 3. |
| 3 | Tide, Dune | Tide 2, Dune 4 | Dune is strictly ahead. |

Dice on the seats: Ember 3, Tide 2, Dune 4, Pine 2. Dune places first. The rest by die, highest first: Ember (3),
then Tide and Pine tied at 2, so join order: Tide, Pine. Log: "Dune places first, then Ember, Tide, and Pine."
Setup runs Dune, Ember, Tide, Pine, Pine, Tide, Ember, Dune. Dune makes the first production roll.

## Phase, action, and state

- **Phase:** `rollOff`, the first value of `Phase`, before `setupSettle`. `createGame` enters it.
- **Action:** the existing `{ type: "roll" }`. No new action and no new intent: the client sends `roll` as an intent
  and the engine calls `rollDie()` (`crypto.getRandomValues`, rejection-sampled), the same path the production dice
  use. Extra fields on the message are ignored, as today. A client never chooses a face.
- **State:** one new field on `GameState`:

```ts
// Pre-setup roll-off (docs/design/first-player.md): the die on each seat, and who still rolls this round.
rollOff: { rolls: Record<string, number>; pending: string[] } | null;
```

`createGame` sets `rollOff: { rolls: {}, pending: players.map((p) => p.id) }`, `phase: "rollOff"`,
`current: players[0].id` (the first seat in join order rolls first), and the log line
`The isle is dealt. Roll for first place.` Everything else in `createGame` is unchanged.

### Turn-taking during the roll-off

Rolls are taken one at a time, in `pending` order, with `current = pending[0]`. Not simultaneous. Reason: every piece
of plumbing already keys on `current` — `applyAction`'s `mustBeCurrent`, `legalFor`, both `runBots`, the HUD's `mine`,
and every proof's "who acts" helper. A simultaneous roll-off would need a second waiting path like `discard` has, for
no gain at a four-seat table.

### `applyAction`, case `"roll"`

```
if (state.phase === "rollOff") → rollOffRoll(state, me)      // new, below
if (state.phase !== "roll")    → "Cannot roll now."           // unchanged
```

`rollOffRoll(state, me)`:

1. `die = rollDie()`. `rollOff.rolls[me.id] = die`. `pending.shift()` (`me` is `pending[0]`, because `current` is).
   Log `${me.name} rolls a ${die}.` Leave `state.dice` null: that pair is the production roll.
2. If `pending` is not empty: `current = pending[0]`. Done.
3. Otherwise resolve. `top = max(rolls)`. `leaders = state.players.filter((p) => rolls[p.id] === top)` — `players` is
   still join order here, so `leaders` is in join order.
   - **Tie** (`leaders.length > 1`): `delete rolls[id]` for each leader, `pending = leaders`, `current = leaders[0]`,
     log `${names(leaders)} tie at ${top} and roll again.` Stay in `rollOff`. Non-leaders keep their die and never
     roll again.
   - **Won:** `first = leaders[0]`. `rest = players without first, sorted by rolls desc` (`Array.prototype.sort` is
     stable, so join order holds on ties). `state.players = [first, ...rest]`. `current = first.id`,
     `phase = "setupSettle"`, `setupIndex = 0`. Log `${first.name} places first, then ${names(rest)}.`

`names(list)` joins as "A and B" or "A, B, and C". `rollOff` is kept after resolution (`pending: []`, every seat's
final die in `rolls`) so the HUD can keep showing the dice through setup; it is four small ints and never cleared.

The roll-off **never** touches `state.rng` (`nextRand`). `rng` drives steals and is hidden until `over` (#111); a
die derived from it would let anyone who watched the roll-off narrow the stream. `rollDie()` is independent of it.

### Why reorder `players`, not add a turn-order array

`state.players = [first, ...rest]` once, at resolution. Reasons:

- `setupAdvance` (snake by index), `endTurn` (`idx + 1`, `turn += 1` on the last index) and "setup over →
  `current = players[0]`" then need **no change**. A separate `order: string[]` would mean rewriting all three and
  every proof that reads them.
- Nothing after `createGame` indexes `players` by position expecting `p{i}` at `i`. Audit: `host.mjs` maps seats to
  pids once at `startGame`, before any roll, and everything later (`rejoin`, `takeOver`, `gains`, `viewFor`) finds by
  id; `store.ts`, `ai.ts` and `Hud.tsx` find by id (`Hud`'s `players[0]` is only a fallback for `me`). Player ids,
  colors and `hostId` do not move.
- The seat rail renders `state.players` in order, so after the roll-off it shows the turn order for free.
- Proofs that bypass the roll-off by setting `g.phase = "roll"` on a fresh `createGame` still see `players` in join
  order with `current === "p0"`, so they keep working unchanged.

## Host (`server/host.mjs`)

| Place | Change |
|---|---|
| `startGame` | `say(room, "Roll for first place.")` instead of `${players[0].name} places first.` |
| `legalFor` | `if (game.phase === "roll" \|\| game.phase === "rollOff") out.actions.push("roll")`. Nothing else lists in `rollOff`. |
| `play` | Broadcast `rolled {dice, sum, gains}` only when `before.phase === "roll"`. Today it destructures `room.game.dice`, which is null during the roll-off and would throw. The roll-off's lines reach every seat through the existing "new log lines → `say`" loop. |
| `runBots` | Unchanged: it already asks `chooseBotAction` for the bot whose id is `current`. |
| `viewFor` | Unchanged: `rollOff` is public and rides through `...open`; `seed` and `rng` are still stripped. |
| `toAction` | Unchanged: `roll` → `{ type: "roll" }`. |

Persistence and rejoin need no code: `save` writes `room.game` whole, so `rollOff`, `phase` and `current` are on
disk after every push; `load` rebuilds the room and holds every seat; the first `hello {code, secret}` gets a `state`
whose `legal.actions` is `["roll"]` for `current`. A seat that drops mid-roll-off is held like any other
(`hold` checks `room.game && seat.pid`), the bot takes it after the grace and rolls for it, and the player gets the
seat back on return. Leak check: `rollOff.rolls` are the public faces, `pending` is public ids, and `net-prove`'s
per-state `seed`/`rng` assertion now also runs over `rollOff` states.

## Bots (`src/lib/game/ai.ts`)

`if (state.phase === "roll" || state.phase === "rollOff") return { type: "roll" };` — the `current !== pid` guard
above it already keeps a bot from rolling out of turn. Both `runBots` (host and store) then roll for bots with no
other change. The practice human rolls too; the research note's default stands (no "human always first").

## Client

### Store (`src/lib/game/store.ts`)

- `dispatch`: a `roll` in phase `rollOff` has no `dice`, so it skips the `rollLine` banner. Add a helper next to
  `awardLine`: `rollOffLine(before, after)` → when `before?.phase === "rollOff"`, the new log lines joined with
  ` · ` (`"Tide rolls a 6."`, or `"Dune rolls a 4. · Dune places first, then Ember, Tide, and Pine."`), else null.
  `dispatch` shows it when set, before the award check. The `state` handler for online does the same against the
  previous `state`. This is the one line everyone reads on a phone, where the rail is hidden.
- `runBots`: unchanged. Hotseat has no bots; practice bots roll through the existing 700 ms timer in `EmberisleApp`.
- Hotseat: the actor is `state.current`, so the Roll button below belongs to whichever seat is up. No new UI.

### HUD (`src/components/game/Hud.tsx`)

No extra screen. Three touches:

1. **Phase sentence** (`phaseCopy`, every mode, same for everyone like the other phases):
   `rollOff` → `Roll one die for first place. The highest roll places first; a tie rolls again.`
2. **Roll button:** show the existing `Roll` button when `(phase === "roll" || phase === "rollOff") && mine`. Same
   label, same icon.
3. **One die per seat:** in each seat line (the rail and the phone strip, `SeatRail.tsx`), while `phase === "rollOff"`
   (#443 took it off the setup round: once the order is settled the die would sit beside the points as one number),
   a small tile after the name: the seat's die from `rollOff.rolls[p.id]`, or `–` while it has not rolled this round.
   Same look as the production dice tiles, smaller (`size-6 rounded-[8px] bg-fg text-bg tabular-nums`),
   `data-testid="rolloff-die"`. The seat's turn pulse marks `current`.

The production dice row (`state.dice`) stays null through the roll-off, so nothing else moves.

### Copy, in one place

| Where | Text |
|---|---|
| log, `createGame` | `The isle is dealt. Roll for first place.` |
| log, each roll | `Tide rolls a 6.` |
| log, tie | `Ember, Tide, and Dune tie at 5 and roll again.` / `Tide and Dune tie at 6 and roll again.` |
| log, won | `Dune places first, then Ember, Tide, and Pine.` |
| host `say` at start | `Roll for first place.` |
| phase sentence | `Roll one die for first place. The highest roll places first; a tie rolls again.` |
| button | `Roll` |
| empty die tile | `–` |
| build bible §4.1 row | `rollOff` → `Roll for first place.` |

## README paragraph (Implementation edits README; this PR does not)

Insert as the first paragraph under **Rule set → Setup**, before "Seat order, then the reverse.":

> Before anyone places, each player rolls one die. The server rolls. The highest roll places first. If two or more tie
> for the highest, only they roll again, until one is strictly ahead. The others follow in order of their dice,
> highest first, and the order they sat down breaks a tie between them. That is the seat order for setup and for every
> turn after.

The existing "Seat order, then the reverse." sentence stays; it now has a definition. One more line in the messages
table, same section: the `{type:"roll"}` row's meaning becomes `Turn actions. roll is also the roll-off die before
setup.` And one row in `docs/BUILD_BIBLE.md` §4.1 (phase sentences): `rollOff` | "Roll for first place."

## Test plan

Proofs that bypass setup by setting `g.phase` directly are untouched. Every proof that drives a fresh game through
setup needs the roll-off first; most get a three-line branch. Asserted invariant, used wherever a roll-off ends
(`order ok`): `players[0]`'s die is strictly the highest in `rollOff.rolls`; `players.slice(1)` is in descending die
order, with join order (`p0 < p1 < …`) on equal dice; `current === players[0].id`; `phase === "setupSettle"`;
`setupIndex === 0`; `rollOff.pending` is empty and `rolls` has one entry per player.

| Proof | Add or extend | Asserts |
|---|---|---|
| `server/rules-prove.mjs` (npm test) | new "Roll-off" block, plus two README lines | Fresh game: `phase rollOff`, `current p0`, `pending` = every id, `dice null`. `p1` rolling first → "Not your turn."; `setupSettle` before the roll-off → "Not placing outposts."; `{type:"roll", dice:[6]}` ignores the field (faces over 60 rolls are 1–6). Drive rolls to the end → `order ok`. Tie, forced: `rollOff = { rolls: {p0: 6, p1: 6}, pending: ["p2"] }`, `current p2`; after p2 rolls, phase is still `rollOff`, `pending` is the leaders in join order (`p0,p1` or `p0,p1,p2`), their dice are gone from `rolls`, p2's die stays iff not 6, last log line ends `tie at 6 and roll again.`; drive on → `order ok`. 200 full roll-offs from `createGame` (3 and 4 seats) each satisfy `order ok` and never consume `rng` (`rng` equal before and after). README lines: `before setup, each player rolls one die; the highest roll places first; tied players reroll among themselves` (the block above) and the existing `seat order, then the reverse` now compares `order` against `ids.concat(ids.reverse())` where `ids` is `g.players` after the roll-off. |
| `server/prove.mjs` | `fresh()` callers that walk setup roll off first (`rollOff(g)` helper: roll as `current` until `setupSettle`) | The setup-goods and illegal-placement checks pass unchanged after it. |
| `server/bots-prove.mjs` | nothing | 3- and 4-bot games now start in `rollOff`; the existing "reaches `over`" loop proves bots roll off. |
| `server/table-prove.mjs` | roll-off loop before the setup loop | Only the current seat has `legal.actions` `["roll"]`; another seat sending `roll` gets "Not your turn."; no socket receives a `rolled` message during the roll-off (`c.rolls.length === 0` until the first production roll); after it, `order ok` on every socket's view and the `places first, then` line arrived as a `log`. |
| `server/net-prove.mjs` | roll-off loop before the 12-step setup | The existing per-state check still finds no `seed`/`rng` in any `rollOff` state. |
| `server/persist-prove.mjs` | `rollOff` branch in `advance()` (returns false, so it does not count as a production roll); after the first roll-off roll, read `ROOMS/<code>.json` | The file on disk has `game.phase === "rollOff"` and one entry in `game.rollOff.rolls`. The restart later in the proof exercises the same `load` path, which does not branch on phase. |
| `server/rejoin-prove.mjs` | wording only | Ember drops on her roll-off turn (step 1) and rejoins (step 2); after the grace the bot rolls for her (step 5). The `places first` message becomes `rolls first`. |
| `server/harden-prove.mjs` | wording only | The host leaves on its roll; the bot rolls and `current` moves on. Same assertion. |
| `scripts/client-prove.mjs` | `rollOff` branch in the setup loop: dispatch `roll` when `current === localId`, bots roll on the app's timer | After setup, 4 `[data-testid="rolloff-die"]` tiles, none `–`; a banner containing `places first, then` appeared; zero console errors. |
| `scripts/hotseat-prove.mjs` | new case: fresh four-seat hotseat, click the `Roll` button until `setupSettle` | The button rolls for whichever seat is `current` (≤ ~12 clicks), `order ok`, 4 die tiles, zero console errors. |
| `scripts/tabs-prove.mjs` | roll-off loop before the setup steps; add `rollOff` and the `players` id order to `shared` | Each roll is taken by the tab whose `you === current`; `shared` (now including the dice and the order) matches on all three tabs after every roll; no tab shows a `rolls a+b =` banner during the roll-off; `served-prove` inherits it. |
| `scripts/shots.mjs`, `scripts/mobile-shots.mjs` (not in CI) | `rollOff` branch in `playUntil`; mobile-shots dispatches `roll` when it is the human's turn before waiting for `setupSettle` | Still reach their screenshot states. |

## Files to touch

| File | Change |
|---|---|
| `src/lib/game/types.ts` | `"rollOff"` in `Phase`; `rollOff` field on `GameState` |
| `src/lib/game/board.ts` | enter `rollOff`, `rollOff: {rolls: {}, pending}`, log `Roll for first place.` |
| `src/lib/game/rules.ts` | `rollOffRoll` (roll, tie, resolve, reorder `players`), `names()`, the `roll` case branch |
| `src/lib/game/ai.ts` | bots roll in `rollOff` |
| `src/lib/game/store.ts` | `rollOffLine` banner, offline and online |
| `src/components/game/Hud.tsx` | phase sentence, Roll button in `rollOff`, die tile per rail card |
| `server/host.mjs` | `legalFor`, `rolled` only in `roll`, start line |
| `README.md` | the Setup paragraph above; the `roll` row note |
| `docs/BUILD_BIBLE.md` | one `rollOff` row in §4.1 |
| `server/rules-prove.mjs`, `server/prove.mjs`, `server/table-prove.mjs`, `server/net-prove.mjs`, `server/persist-prove.mjs`, `server/rejoin-prove.mjs`, `server/harden-prove.mjs` | per the test plan |
| `scripts/client-prove.mjs`, `scripts/hotseat-prove.mjs`, `scripts/tabs-prove.mjs`, `scripts/shots.mjs`, `scripts/mobile-shots.mjs` | per the test plan |

**Size: S, one PR.** The engine is about sixty lines and the client about thirty; the proof edits are each a short
branch. It cannot be split and stay green: the engine change alone turns every setup-walking proof red, and the proof
changes alone are no-ops. If a session runs out, pause per FRAMEWORK §7 rather than open half of it.

## Not decided here

- Dice animation for the roll-off (the `dice.md` tumble is built for two dice and `rolled`). The tile and the banner
  are enough for game night; a one-die tumble is an IDEAS.md line if anyone wants it.
- A phone seat strip (mobile-hud.md) is not built; when it is, it shows the same tile.

## Implementation issue (draft)

**Title:** Implement the pre-setup roll-off for who places first

```
## Deliverable
The `rollOff` phase from docs/design/first-player.md: `createGame` enters it; `{type:"roll"}` in that phase rolls
one die with `rollDie()` for `current`; the highest unique die places first, tied leaders reroll among themselves,
the rest follow by die then join order, and `players` is reordered once at resolution. Bots and hotseat seats roll
through the existing Roll button and `runBots`. HUD: the phase sentence, the Roll button in `rollOff`, one die tile
per rail card, and the log-line banner. README Rule set → Setup gets the paragraph in the spec, plus the `roll` row
note and the build-bible §4.1 row. Proofs per the spec's test plan.

## Completion test
`npm run typecheck && npm run build && npm test && npm run client-prove && npm run hotseat-prove && npm run tabs-prove && npm run served-prove && npm run chat-prove`
all green from a fresh clone, with the new lines in the output:
- rules-prove: `README before setup, each player rolls one die; ...: ok` and `README seat order, then the reverse: ok`
- table-prove: the roll-off loop line (no `rolled` during it, "Not your turn." for the wrong seat, order ok)
- persist-prove: `<code>.json` on disk mid-roll-off with `phase rollOff`
- client-prove: 4 die tiles and a `places first, then` banner
- hotseat-prove: the Roll button carries four seats through the roll-off
Paste the output in this issue.

## Depends on
#149

## Source
docs/design/first-player.md; docs/research/first-player.md; src/lib/game/rules.ts `rollDie`, `setupAdvance`;
server/host.mjs `legalFor`, `play`, `viewFor`

Size: S
```
