# Lobby turn-timer presets

Design for [#548](https://github.com/jarrodjohnson-gif/emberisle/issues/548).
**Proposal awaiting Jarrod's choice of presets and the three-seat default.**
This note does not change the game or authorize implementation.

## Current behavior and reason for the option

The host uses a 120-second inactivity window and a total waited-on budget of
six windows, unless the operator overrides `TURN_MS` or `TURN_TOTAL_MS`
(`server/host.mjs:99`). An accepted game action renews the inactivity window,
but cannot extend the total budget. This is not a fixed 120-second whole turn.
The same mechanism covers roll-off, opening placement, rolling, discarding,
moving the wayfarer and the main phase (`server/host.mjs:480`).

On timeout the host makes one required move, or passes in the main phase. The
seat remains human (`server/host.mjs:530`). Disconnection uses the separate
grace/rejoin rules. A restart restores the saved deadline and budget start;
it does not grant a fresh turn (`server/host.mjs:224`, `server/host.mjs:335`).

The pacing research asks for official table options, but its shorter
three-player default is explicitly an inference, not an owner decision
([complaints #6 and #40](../research/complaints-tabletop.md)). There is no
measurement showing that fewer seats need less thinking time. Keep four-seat
tables at 120 seconds; ask Jarrod before changing the three-seat default.

## Proposed choices — owner decision pending

| Choice | Inactivity window | Total waited-on budget |
| --- | --- | --- |
| 1 minute | 60 seconds | 6 minutes |
| 2 minutes | 120 seconds | 12 minutes |
| 3 minutes | 180 seconds | 18 minutes |

Recommendation: **2 minutes for both three and four seats**, including tables
with practice bots. A shorter option is explicit opt-in. Adding/removing a
seat or transferring host never silently changes the chosen value. There is
no unlimited option or custom duration in this proposal. Practice and hotseat
remain outside this online-lobby issue.

Before acceptance, record Jarrod's answer here: approve these choices and the
same default for both seat counts, choose a separate three-seat default, or
defer presets. Until then, the current 120-second behavior remains in force.

## Proposed lobby control

Place a labelled **Turn timer** control beside the existing points target,
inside the existing lobby card; no new screen. Use a native select with
visible duration labels, keyboard operation and a label association. The
host can choose before the first game, never during a live game. Guests see
the server-confirmed value as text. Watchers cannot change it. When the host
leaves, the new host inherits the table's choice.

Explain beneath the control: "Time to make your next move. Making a move
resets the timer, up to 12 minutes." Substitute 6 or 18 for the selected
option. Preserve the existing timeout explanation and countdown behavior.
Do not call this a whole-turn limit or suggest that trading/chat freezes it.

Send a selection immediately. Show the confirmed server value; a pending
selection must not let Start race ahead of its acknowledgement. A changed
selection clears human guests' ready flags so they acknowledge the new
pace. Bot seats remain ready. Re-selecting the same value does nothing.

The selected value stays fixed through rematches. Changing it after a game
requires a new table. The in-game table menu may display the chosen value
read-only; it does not add a live timer control.

## Proposed host and client contract

Use a room setting `turnMs`, an integer in `{60000, 120000, 180000}`. Keep it
outside the pure rules state: it governs host scheduling, not legal moves.
Clients request `{ type: "setTurnTimer", value: 60000 }`. Only the current
host in a never-started lobby can change it. Validate the exact numeric
allowlist; reject strings, fractions, null, negatives and arbitrary values.
Refusals leave the setting, ready flags and any deadlines unchanged.

Return specific errors: "Only the host can choose the turn timer.",
"The turn timer is fixed for this table." and
"Choose a 1, 2 or 3 minute timer." Apply the existing action rate limit and
watcher write guard. Publish and save accepted changes together.

Include the effective `turnMs` in `welcome`, `seats` (including peek), and
`state` for seats and watchers. Late joins, rejoin and host migration read
that authoritative value. Preserve `turnDeadline`, `turnPlayer` and
`serverNow` for countdowns; clients must not calculate a new deadline from
`turnMs`. Continue displaying the earliest armed deadline when several seats
owe discards. Preserve the last-30-seconds countdown, 10-second urgent state,
clock-skew correction and single polite announcement per window. An old
client ignoring an additive field still follows the host's
deadline. If the implementation requires stricter protocol versioning,
follow the existing protocol compatibility policy rather than silently
changing what old clients do.

## Persistence, restart and operator overrides

Save `turnMs` and the effective total budget as room metadata alongside the
existing per-seat `turnDeadline` and `turnStartedAt`. A legacy save with no
preset uses the current operator timing defaults; an explicit invalid saved
value is a diagnosed restore failure, not a request for an unlimited timer.
Do not drop existing rooms merely to add an optional metadata field.

For selected public presets derive the total budget as `6 * turnMs` and the
resume threshold as `min(5000, turnMs / 10)`. Thread these room-local values
through scheduling, timeout, restore and rematch. Changing one lobby must
not affect another room. Keep grace, hold, ping, trade-offer and bot-answer
durations independent of the selected preset.

Keep `TURN_MS` and `TURN_TOTAL_MS` as explicit operator/test overrides. When
present, they take precedence over the corresponding preset-derived value;
compute the effective values once for a new room and persist them. Display
the actual effective timing, not a misleading preset label, and disable
host selection on an overridden deployment with "Timer set by the host
server." Normal deployments with neither override use the proposed presets.
Existing proofs depend on subsecond/short operator durations; the network
allowlist must not constrain these trusted server overrides.

Restoring an active room uses its persisted effective timing even if the
process defaults changed. Preserve the exact saved deadline and original
budget start. Spend an expired or too-near deadline using the existing
deferred timeout path; reconnecting or restarting never refreshes it.
Legacy rooms migrate once using the current operator defaults and then
persist their effective timing. Do not rewrite a running room's deadlines
as part of migration.

## Completion checks for a later implementation

This issue's deliverable is the accepted design, not a new timer feature.
After Jarrod's decision, check that the note has one exact preset list and
explicit defaults for both three and four seats, with 120 seconds still the
four-seat default. Review the document against the current host behavior;
run `git diff --check` and verify that only this note changed.

A later implementation needs these functional checks:

- Three and four seats default as accepted; host selection round-trips to
  every client, and a seat count change does not overwrite an explicit choice.
- Guests, watchers, live games and rematches cannot change timing. Invalid
  messages are refused with no mutation. Changing a lobby value clears human
  guests' readiness; selecting the same value does not.
- Two concurrent rooms use distinct effective timers. Operator overrides
  retain the short durations used by existing tests and are labelled honestly.
- Lobby save/restart, join, rejoin, host migration and rematch preserve the
  setting. Mid-game restart restores the existing deadline and budget;
  legacy saves migrate without resetting deadlines or dropping rooms.
- Every existing waited-on phase still times out. Accepted moves reset only
  the inactivity window; repeated actions cannot outrun the total budget.
  Dropped seats remain governed by the existing grace/recovery rules.
- At phone and desktop sizes, host/guest controls fit and remain keyboard
  accessible. The countdown continues to use server time and names the seat
  the table is waiting for.

Extend the existing `turn-prove`, `cap-prove`, `restart-prove` and
`countdown-prove` coverage for these cases; keep their assertions intact.
Those future checks are a test plan, not claims of a completed implementation.
