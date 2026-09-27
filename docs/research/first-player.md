# Research: who places first, and what "the game continues" means (issue #143)

- step: 1 Research
- date: 2026-09-27
- agent: Grok

## What I read

README Rule set → Setup; README Do not ("Do not let a client decide the dice");
`src/lib/game/board.ts` (`createGame`); `src/lib/game/rules.ts` (`setupAdvance`, `rollDie`);
`src/lib/game/types.ts` (`Phase`, `Action`, `GameState.current` / `setupIndex` / `winner`);
`src/lib/game/store.ts` (`startAi`, `startHotseat`, `goTitle`, `hostTable` / `startTable`);
`src/components/game/EmberisleApp.tsx` (no win / rematch UI); issue #143 body.

## What is true

### There is no roll-off today

`createGame` builds `players` in join / argument order (`humans` first, then bots) and sets:

- `current = players[0].id`
- `phase = "setupSettle"`
- `setupIndex = 0`
- log: `The isle is dealt. ${players[0].name} places first.`

`setupAdvance` then walks seat order, then the reverse:

- `n = players.length`, `totalSteps = n * 2`
- while `setupIndex < n`, `current = players[setupIndex]`
- after that, `current = players[totalSteps - 1 - setupIndex]` (the reverse pass)
- when setup ends, `phase = "roll"` and `current = players[0]` again — the same seat that placed first also takes the first production roll.

Seat order is whatever `createGame` was given. Online, that is host-then-join order from `server/host.mjs`. Practice vs the isle always makes the human `p0`. Hotseat always makes the named player `p0`. Nothing rolls to decide this.

`Phase` has no pre-setup value. `Action` has `{ type: "roll" }` only for the production roll (`phase === "roll"`). `rollDie()` already uses `crypto.getRandomValues` and rejection sampling. That is the only legal dice source.

### What a first-game roll-off needs

It sits **before** `setupSettle`, after the lobby `start` has called `createGame`.

Suggested shape (Design #149 locks the names):

1. New phase, e.g. `rollOff`. `createGame` enters it instead of `setupSettle`.
2. Each seated player, in current seat order, sends `{ type: "roll" }` as an intent. The **host** (or `applyAction` on the host process) calls `rollDie()`. A client that arrives with a chosen face is rejected — same rule as the turn dice.
3. Record one die per player. Highest unique result becomes `players[0]` after a single reorder (or an index `first` that `setupAdvance` already almost is). Everyone else keeps descending-roll order so the reverse setup pass still has a fair snake.
4. Ties: reroll **only the tied seats**, same host dice, until one seat is strictly ahead. Do not reroll people already unique.
5. Then `phase = "setupSettle"`, `setupIndex = 0`, `current = players[0]`, and the existing snake runs unchanged.

Bots and hotseat must take the same path. The local store already calls `applyAction` itself; it should call `rollDie()` there too, never `Math.random` for this.

README Rule set → Setup needs one new paragraph, because "Seat order, then the reverse" is no longer how the first seat is chosen. Suggested fact for Design to edit, not a to-do in this file: *Before setup, each player rolls. Highest unique roll places first; tied players reroll only among themselves. Setup then runs that order, then the reverse.*

### "If the game continues" is a different node

`store.ts` has no rematch. `phase === "over"` sets `winner` and stops. `goTitle` closes the socket and drops `state`. `EmberisleApp.tsx` has no Play again control. A table that deals a second island, keeps the four-character code, and gives `winner` the first seat is new scope: new host message, new lobby-or-win button, a second `createGame` with a chosen first seat.

That is #150, not part of the roll-off leaf. The roll-off does not need a rematch field. Rematch, when built, can skip a second roll-off and seed `players[0]` from the previous `winner`.

## What I am not sure about

- One die vs two. Physical table tradition is one die each. Two dice would reuse the existing pair animation but makes ties rarer and the UI heavier. Design should pick one die unless Jarrod says otherwise.
- Whether practice-vs-bots should skip the roll-off and keep the human first. The rule set does not say that. Default: same roll-off, bots included.
- Whether the reorder mutates `players[]` or only `current` / a `firstIndex`. Mutating `players[]` is the smallest change to `setupAdvance`.

## Prove output

(research gate — no command)

## Handoff

```
done: confirmed no roll-off in board.ts / rules.ts; split rematch out; filed Design #149 and Research #150
left: #149 Design the pre-setup roll-off; #150 stays Backlog until a game night wants a second island
broke: nothing
next agent: #149 (S, Backlog → Todo). Do not implement rematch in the same PR.
```
