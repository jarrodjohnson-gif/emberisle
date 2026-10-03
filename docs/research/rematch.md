# Research: a rematch that keeps the table and gives the winner first seat (issue #150)

- step: 1 Research, node #150, parent #143
- date: 2026-10-02
- agent: Claude (Sonnet)

## What I read

`src/lib/game/store.ts` (`startAi`, `startHotseat`, `loadState`, `goTitle`, `connect`);
`src/components/game/EmberisleApp.tsx`; `src/components/game/Hud.tsx`; `src/components/game/WinScreen.tsx`;
`server/host.mjs` (`startGame`, `handle`, `leave`, `hold`, `takeOver`, `letGo`, `pushState`, `viewFor`);
`src/lib/game/rules.ts` (`checkWin`, `setupAdvance`, `applyAction`); `src/lib/game/board.ts` (`createGame`);
README Rule set → Setup; `docs/research/first-player.md` and `docs/design/first-player.md` (#143, #149); issue #87.

Source: Jarrod, 2026-09-27: "winner gets to go next first if the game continues."

## What is true

### 1. There is no play-again path today

| Where | What it does after the game ends |
|---|---|
| `rules.ts:236-237` | `checkWin` sets `phase = "over"` and `winner`. |
| `rules.ts:367` | Every action after that returns "The game is over." |
| `Hud.tsx:55-56`, `206` | Phase sentence is "The isle has a ruler." The turn banner is hidden. |
| `Hud.tsx:228-231` | One line: "<name> wins with N points." |
| `WinScreen.tsx:112-118` | Two buttons: "Look around" and "Back to menu". |
| `WinScreen.tsx:48-50`, `Hud.tsx:132` | The same exit appears on the chip and in the header: `goTitle`. |
| `store.ts:251-265` | `goTitle` forgets the saved seat, closes the socket, sets `state: null`, `code: ""`, `seats: []`. |
| `EmberisleApp.tsx:23-46` | No win or rematch UI. The only screens are title, lobby, and play (the HUD). |
| `server/host.mjs:626` | `start` is refused once `room.game` exists: "Game already started." |
| `server/host.mjs:397` | Joining is refused the same way. |

Two things I found that the issue did not say:

- **The host never clears `room.game`.** After `over` the room sits in the old finished game until every seat is
  gone or the 24 h save expires (`host.mjs:40`). The table is not dead, but nothing can restart it.
- **"Back to menu" does not free the seat.** The socket closes, and `leave` (`host.mjs:713-717`) holds any seat that
  has a `pid`. The bot takes it after the grace (`host.mjs:678`, 90 s) and the seat is let go after the hold
  (`host.mjs:679`, 10 min). So a player who leaves at the win screen is "away" for a rematch, not gone.

### 2. What "the game continues" means for a friends table

| Keep | New |
|---|---|
| Table code (`room.code`) | Island: `createGame` takes a fresh random seed (`board.ts:71`), so a new hex deal, tokens, and fortune deck |
| Seats: `s0..s3`, secrets, names, colors, pictures (`host.mjs:98-109`) | Game state: a new `createGame`, so bank, deck, hands, and pieces all reset |
| Chat history (`room.chat`) | Who sits first: the winner of the last game |
| The host (`room.host`) | `pid` per seat (`s.pid = players[i].id`, `host.mjs:426-429`) |

**Winner first.** `setupAdvance` (`rules.ts:242-257`) walks `players` by index, then back. When setup ends it sets
`current = players[0]` (`rules.ts:253`). So `players[0]` places first, places last in the reverse pass, and
rolls first. Putting the last winner at `players[0]` gives all three. No new rule code in `rules.ts`.

**No roll-off.** The winner is already known, so a rematch skips the roll-off from #149. Jarrod can ask for one
later. The other seats keep their old order, with the winner moved to the front.

**Seed.** `viewFor` hands out the whole game at `over`, including `seed` and `rng` (`host.mjs:209-210`, #111). The
rematch must take a new seed. `createGame` already does. A rematch must never reuse the old state.

**`hostId`.** `GameState.hostId` defaults to `players[0].id` (`board.ts:210`) but nothing reads it
(grep over `src` and `server`). The rematch can ignore it. `room.host` is the real host.

### 3. The host message

Suggested: `{ type: "again" }`, host only. The host calls it from the win screen. The server then:

1. Refuses unless the sender is `room.host` ("Only the host can start." — the existing line, `host.mjs:422`).
2. Refuses unless `room.game.phase === "over"`. A double click gets "Game is not over." The first one wins the race.
3. Counts seats with an open socket. Fewer than 3 → "Need 3 or 4 at the table." (`host.mjs:423` wording). Nothing changes.
4. Lets go of the seats with no open socket (the ones that clicked Back to menu, or dropped), the same way `letGo`
   does (`host.mjs:699-705`). They have no way to play, and the grace timer will not fire again for them.
5. Builds the new game with the last winner first. Maps `seat.pid` and `color` as `startGame` does.
6. Says the line (`<name> won last time and places first.`), then `pushState`.

It has to be added to `handle` **before** the `if (!room.game)` / `play` fall-through (`host.mjs:626-631`), or
`toAction` turns it into "not ready".

**Everyone ready again?** I recommend no. At the win screen everybody is looking at the same screen, with the code
and chat open. "Back to menu" is the opt-out, and it is already one tap. A second ready round would reuse `ready`
and `start`, but `ready` is never reset after the game starts (`host.mjs:420-434`), so it would need a reset too.
If Jarrod wants consent, say so and Design adds it. This is a small choice, not a blocker.

**Why not send everyone back to the lobby?** It would reuse `start`, but the client has no server-driven way back to the
lobby (`store.ts:453-457` goes lobby to play on a push, never the other way), and a seat with no socket would
need extra handling anyway. A direct restart is smaller.

**Client side.**

- `table.ts:278-279`: add `again: () => send({ type: "again" })` next to `ready` and `start`.
- `store.ts`: a `playAgain` action that calls `net?.again()`.
- `WinScreen.tsx`: the host gets a "Play again" button beside "Look around" and "Back to menu". Everyone else sees one
  line: "Waiting for <host> to start another."
- No other client change. The new `state` push goes through `loadState` (`store.ts:240-249`), the winner is `null`,
  and `WinScreen` (`WinScreen.tsx:9-10`) draws nothing. The phase is `setupSettle`, so the HUD is already right.
  `buildMode` is not reset by `loadState`; Design should check it.

**Persistence and rejoin** need no code. `save` writes the whole `room.game` after every push, and a rejoin gets the
current `state` (`host.mjs:635-661`).

**Practice and hotseat.** `startAi` (`store.ts:205`) and `startHotseat` (`store.ts:222`) always seat the human or
Seat 1 first. A local rematch can call `createGame` and then move the winner to `players[0]`. This is optional and
smaller than the online path. Design should say yes or no. Practice has no "table", so I lean toward hotseat only.

### 4. Does it wait on #87 or the game-night path?

No. `again` is the same host code whatever URL the players use. #87 (`npm run night`) is only the usual way a table
will meet, and a rematch only matters once a table plays more than one game. So the value arrives with a game night,
but the work does not wait for it.

It does touch #149. If the roll-off is built first, `createGame` will enter `rollOff` (`docs/design/first-player.md`,
"Phase, action, and state"). Then the rematch needs a way to start in `setupSettle` with a chosen first seat. If the
rematch is built first, nothing is needed. Whichever lands second takes that join. #149 is design only today. Nothing
named `rollOff` exists in `src` or `server`.

### 5. README: this needs Jarrod

README Rule set → Setup (line 49-51) says "Seat order, then the reverse." It does not say how seat order is chosen.
A rematch adds a rule that changes how the game is played: **the last winner places first and rolls first.** That is a
README rule change, and the README rules are Jarrod's. I did not edit it.

**Needs Jarrod:** approve (or change) one sentence for Setup, for example:

> In a rematch at the same table, the winner of the last game places first. There is no roll-off.

He should also know it favors the winner twice. First place picks the first outpost and the first production roll.
It is his rule from 2026-09-27, so I am not arguing against it. But it is a snowball, and he may want it for the
second game only, or only if the winner did not win by a large margin. That is his call.

If #149's README paragraph ("Before anyone places, each player rolls one die.") lands first, this sentence must be an
exception to it.

## What I am not sure about

- Consent: host-only `again` (my pick) or everyone taps ready again. See section 3.
- Whether a rematch with fewer than 3 present should kick people back to the lobby so a friend can join. My pick: no,
  show the error; the host starts a new table. A lobby path is a bigger change.
- Local rematch for practice and hotseat. See section 3.
- Whether the winner-first rule should repeat for a third game. Jarrod's quote says "if the game continues". I read it
  as every rematch, the winner of the last game.

## Scope decision

In scope for the next layer. Jarrod asked for it in words, it is one host message, one button, and one
`createGame` option, and it does not wait on #87. I filed two children in Backlog (#265 and #266). The Implementation child is
marked `needs: jarrod` because of the README line.

| Child | What | Size |
|---|---|---|
| #265 Design a rematch that keeps the table and gives the winner first seat | `docs/design/rematch.md`: message, host steps, win-screen copy, `createGame` option, proof plan | S |
| #266 Implement a rematch that keeps the table and gives the winner first seat | `again` on the host, the button, the proof, the README sentence once Jarrod approves it | S |

## Prove output

(research gate — no command)

## Handoff

```
done: confirmed no play-again path (store, HUD, win screen, host); answered all four questions; filed Design and Implementation children
left: Design child first. Jarrod to approve the README Setup sentence before Implementation merges.
broke: nothing
next agent: the Design child
```
