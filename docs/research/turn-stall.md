# Research: a connected player stops taking turns (issue #324)

- step: 1 Research, decision #324
- date: 2026-10-05
- agent: ChatGPT

## What I read

- Jarrod's decision comment on [#324](https://github.com/jarrodjohnson-gif/emberisle/issues/324#issuecomment-5972301226).
- The [CATAN base game rules (2020)](https://www.catan.com/sites/default/files/2021-06/catan_base_rules_2020_200707.pdf), especially the turn sequence on pp. 3–5.
- Colonist's [timer update](https://blog.colonist.io/updated-timers/) and [disconnect / karma FAQ](https://colonist.instantdocsbase.com/doc/karma-penalty-server-update-disconnect).

## What is true

### Options

1. **No automatic timeout.** Keep the turn open until its player acts. This is simple and avoids moving for someone, but one absent connected player can stop the table indefinitely.
2. **Hard timeout.** Pass, disconnect, or replace the player after a deadline. It keeps the game moving, but can skip an action or transfer control abruptly.
3. **Soft timer with one bot action.** Show everyone a countdown after inactivity; if it expires, let the host bot take that turn's move and restore the player's control on their next action. This gives the table a visible warning and bounds the stall while keeping a returning player in the game.

### Other games

- **CATAN:** The base rules describe the turn sequence and trading/building phases, but do not specify a clock for ordinary turns or an automatic bot takeover. This is a tabletop ruleset; how long other players wait is left to the group.
- **Colonist:** Its timer guidance describes timed turns (the 2020 post lists different limits by turn/action type). Its current disconnect FAQ describes disconnect penalties, but does not document a bot taking over a connected player's stalled turn. I could not verify a current official rule for connected-player inactivity from these sources.

## Recommendation

Keep Jarrod's recorded choice. It is already implemented: when the game is waiting for a connected human seat with a legal action, the host starts a **120-second** window by default (`TURN_MS`, configurable by the host). The host sends the shared deadline and server time to seats and watchers; the HUD counts down from that deadline. An accepted action resets the window if the game still waits on that seat. The seat remains human throughout.

When the window expires, the host plays one timeout action through the normal game action path: roll, setup placement, robber move, or discard where applicable. In the main phase it passes without spending anything. If no supported action is available, the host arms another window. A disconnected seat is handled by the separate grace timer, not this turn timer. This bounds a stall while keeping the returning player in the game.

## What I am not sure about

- Whether later playtesting should change the 120-second duration or add a separate warning before the shared countdown. Those would be new product decisions; neither blocks the shipped timer.

## Implementation and proof

- `TURN_MS` and `armTurns` in `server/host.mjs` start and reset the window for connected human seats the game is waiting on. `turnOut` handles timeout actions; `pushState` shares the deadline and server clock with seats and watchers.
- The client stores the host deadline and clock offset in `src/lib/game/store.ts`; `src/components/game/TurnCountdown.tsx` displays the countdown.
- `server/turn-prove.mjs` covers the shared deadline, automatic timeout moves, a timely action resetting the window, discard, and the distinction between a dropped seat's grace period and the turn timer.

## Prove output

(research gate — no command)

## Handoff

```
done: compared the no-timeout, hard-timeout, and soft-timer options with CATAN and Colonist; documented the shipped 120-second host timer and its proof
left: review timer duration and warning behavior only if playtesting raises a new decision
broke: nothing
next agent: no implementation follow-up required for #324
```
