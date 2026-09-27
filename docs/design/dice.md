# Dice tumble that lands on server faces (issue #49)

Source: build bible 6, 7, and 8.

## Rule

The server rolls with `crypto` (see `rollDie` in `rules.ts`) and sends `rolled { dice: [a, b], sum, gains[] }`. The client never sends numbers and never uses its own RNG for a result. The number on the die is the rule. The animation only decorates it.

## Timeline

| t (ms) | What happens |
|---|---|
| 0 | Press Roll. Send `{ "type": "roll" }` and play `ui_click`. The button hides, so there are no double sends. |
| on `rolled` | Play `dice_shake` (~700 ms). Spawn two dice above the table edge with a random impulse and spin. |
| 0–700 | Physics tumble. |
| 700 | Freeze. For each die, if the face pointing up is not the server value, lerp its rotation to the server face over 80 ms. Play `dice_land`. |
| 780 | Hexes whose token equals `sum` flash once (unless the wayfarer is on them). |
| 780–1180 | Chips fly from those hexes to player circles for each entry in `gains` (bible 8). Play `chip_gain` once, not once per hex. |
| 1180 | Log line from the server (for example "8 · Ember +1 grain · Tide +1 timber"). Add it to the last-8 list with both faces. |

If `rolled` arrives while a previous tumble is still playing, finish that one instantly and start the new one.

## Faces

Each die mesh has a lookup table of the local up vector for faces 1 through 6. Snapping rotates the die so the chosen face's normal points up, keeping the current yaw. With no mesh (#48 fallback), show two stone tiles with the numbers and the same timing.

## Sum 7

There are no chips. After the land, the phase sentence changes ("Someone has too many cards…" or "Move the wayfarer.") from the following `state`.

## Test (#51)

Twenty rolls: the dice shown must equal `rolled.dice` and the server log. `server/table-prove.mjs` already checks the server side (every socket's `rolled` equals `state.game.dice`).
