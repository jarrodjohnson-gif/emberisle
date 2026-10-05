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

Keep Jarrod's recorded choice: after **120 seconds without a game action**, show the same countdown to every seat. When it expires, the host bot takes that one move (roll then pass; a required discard is auto-halved). The player resumes control on their next action. This is the soft-timer option: it limits dead air without replacing the player for the rest of the game.

The implementation should define inactivity by game actions, not socket heartbeats; start the countdown from a clear turn/action boundary; broadcast one shared deadline so all seats see the same remaining time; and cancel it as soon as the player acts. The issue's existing decision sets the 120-second duration and takeover behavior.

## What I am not sure about

- Whether a timer should run while the game is waiting on a non-turn choice, such as a trade response, or only during the active player's turn.
- Whether a connected player should see a local warning before the shared 120-second countdown begins. The decision specifies the shared countdown after the inactivity threshold, not an earlier warning.

## Prove output

(research gate — no command)

## Handoff

```
done: compared the no-timeout, hard-timeout, and soft-timer options with CATAN and Colonist; recorded the existing 120-second soft-timer decision
left: implementation and proof are in the child issues planned by #324
broke: nothing
next agent: take the host timer/proof child, then the HUD countdown child
```
