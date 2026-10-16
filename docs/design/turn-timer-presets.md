# Lobby turn-timer presets

Design for [#548](https://github.com/jarrodjohnson-gif/emberisle/issues/548).
**Owner decision, 2026-10-16:** Jarrod chose "Keep 120 seconds for both 3 and
4 players; offer 60/120/180." This note records that decision and specifies
the proposed implementation for review. It does not change the game or
authorize implementation.

**Review status:** only the selectable durations and seat-count defaults are
owner-approved. The five behavior/UI choices below are proposals awaiting
answers on #548; do not treat them as accepted decisions.

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
tables at 120 seconds. Jarrod resolved the three-seat question by keeping
the same 120-second default.

## Presets and defaults — owner decision

| Choice | Inactivity window |
| --- | --- |
| 1 minute | 60 seconds |
| 2 minutes | 120 seconds |
| 3 minutes | 180 seconds |

Default: **2 minutes for both three and four seats**, including tables
with practice bots. A shorter option is explicit opt-in. Adding/removing a
seat or transferring host never silently changes the chosen value. There is
no unlimited option or custom duration in this proposal (control choice
pending below). Practice and hotseat
remain outside this online-lobby issue.

Jarrod approved these presets and defaults in the onboarding conversation on
2026-10-16. The current 120-second runtime behavior remains in force until a
separate implementation is reviewed and accepted.

## Remaining decisions — answer on #548

| Topic | Recommendation, not approval | Alternative |
| --- | --- | --- |
| Rematch editing | Allow host changes after a game, before rematch, like the points target | Lock the value for the table lifetime |
| Readiness | Preserve ready flags, like the points target | Clear human guests' readiness on change |
| Total budget | Retain the existing 6× window relationship: 6/12/18 minutes | Choose another cap |
| Operator overrides | Display actual effective timing and disable selection on overridden deployments | Allow selections alongside overrides |
| Control | Labelled native select beside points target, with only the three approved durations | Choose another control or location |

Jarrod decides changes to how a turn feels; the orchestrator can decide minor
UI/protocol details. Record the answers as issue comments, then reconcile
the sections below before accepting the design. No answer is inferred from
the earlier approval of preset durations and defaults.

## Proposed lobby control

Place a labelled **Turn timer** control beside the existing points target,
inside the existing lobby card; no new screen. Use a native select with
visible duration labels, keyboard operation and a label association. The
host can choose before the first game and after a game before rematch
(pending the rematch decision), never during a live game. Guests see
the server-confirmed value as text. Watchers cannot change it. When the host
leaves, the new host inherits the table's choice.

Explain beneath the control: "Time to make your next move. Making a move
resets the timer, up to 12 minutes." Substitute 6 or 18 for the selected
option. Preserve the existing timeout explanation and countdown behavior.
Do not call this a whole-turn limit or suggest that trading/chat freezes it.

Send a selection immediately. Show the confirmed server value; a pending
selection must not let Start race ahead of its acknowledgement. The
recommendation is to preserve ready flags, matching points-target changes;
this awaits the readiness decision. Re-selecting the same value does nothing.

Rematches inherit the selection unless the host changes it after the game
(pending the rematch decision). The in-game table menu may display the value
read-only; it does not add a live timer control.

## Proposed host and client contract

Separate `turnPresetMs`, the selectable preset, from the resolved timing:

- `turnPresetMs` is an integer in `{60000, 120000, 180000}` (default 120000).
  This allowlist applies only to public preset selection, never to effective
  operator timing.
- `turnWindowMs` and `turnTotalMs` are resolved effective milliseconds,
  positive finite numbers that may be outside the preset allowlist (for
  example, a 1200 ms test window). Persist and restore these values directly.
- `turnOperatorControlled` records whether an operator override was used
  when the room's effective timing was resolved.

Keep this metadata outside the pure rules state: it governs host scheduling.
Clients request `{ type: "setTurnTimer", value: 60000 }`. Only the current
host before a game or after `phase === "over"` can change it (rematch choice
pending). Validate the exact numeric
allowlist; reject strings, fractions, null, negatives and arbitrary values.
Refusals leave the setting, ready flags and any deadlines unchanged.

After the existing watcher guard and action rate limit, validate in order:
host authority ("Only the host can choose the turn timer."), live-game state
("The turn timer is fixed for this game."), operator lock if approved
("Timer set by the host server."), then preset value
("Choose a 1, 2 or 3 minute timer."). Apply the existing action rate limit and
watcher write guard. Publish and save accepted changes together.

Include all four fields in `welcome`, `seats` (including peek), and
`state` for seats and watchers. Late joins, rejoin and host migration read
that authoritative value. Preserve `turnDeadline`, `turnPlayer` and
`serverNow` for countdowns; clients must not calculate a new deadline from
`turnWindowMs`. Continue displaying the earliest armed deadline when several seats
owe discards. Preserve the last-30-seconds countdown, 10-second urgent state,
clock-skew correction and single polite announcement per window. An old
client ignoring an additive field still follows the host's
deadline. If the implementation requires stricter protocol versioning,
follow the existing protocol compatibility policy rather than silently
changing what old clients do.

## Persistence, restart and operator overrides

Save all four fields as room metadata alongside the existing per-seat
`turnDeadline` and `turnStartedAt`. Validate the preset against its allowlist,
but validate effective window/total values only as positive finite numbers.
Thus an operator-controlled room with `turnWindowMs: 1200` restores normally.
An explicit invalid value is a diagnosed restore failure, not a request for
an unlimited timer; never apply the preset allowlist to effective timing.
Do not drop existing rooms merely to add an optional metadata field.

Subject to the total-budget decision, resolve a new room in this order:
`turnWindowMs = TURN_MS override ?? turnPresetMs`, then
`turnTotalMs = TURN_TOTAL_MS override ?? 6 * turnWindowMs`. An explicit total
override wins even when it is not six times the window. Derive the resume
threshold from the resolved window. An override means an explicitly set,
valid positive finite value, never a truthiness check. Derive the resume
threshold as `min(5000, turnWindowMs / 10)`. Thread these room-local values
through scheduling, timeout, restore and rematch. Changing one lobby must
not affect another room. Keep grace, hold, ping, trade-offer and bot-answer
durations independent of the selected preset.

Keep `TURN_MS` and `TURN_TOTAL_MS` as explicit operator/test overrides. When
present, they take precedence in the new-room resolution above;
compute the effective values once for a new room and persist them. Display
the actual effective timing, not a misleading preset label, and disable
host selection on an overridden deployment with "Timer set by the host
server." This control policy is pending approval. Normal deployments with
neither override use the proposed presets.
Existing proofs depend on subsecond/short operator durations; the network
allowlist must not constrain these trusted server overrides.

Restoring an active room uses its persisted effective timing even if the
process defaults changed. Preserve the exact saved deadline and original
budget start. Spend an expired or too-near deadline using the existing
deferred timeout path; reconnecting or restarting never refreshes it.
Legacy rooms missing effective metadata migrate once: retain any valid
persisted window/total independently, fill a missing window from `TURN_MS`
or 120000, and fill a missing total from `TURN_TOTAL_MS` or six times that
effective window. A valid saved total wins over the 6× relationship and
current process overrides. Persist the resolved values without rewriting
saved per-seat deadlines or budget starts. For fully old saves no window or
total was recorded, so only the current operator defaults can fill those
missing values; do not claim to reconstruct an unknown old configuration.

## Completion checks for a later implementation

This issue's deliverable is the accepted design, not a new timer feature.
Check that the note has one exact preset list and
explicit defaults for both three and four seats, with 120 seconds still the
four-seat default. Resolve the five outstanding issue questions before
calling this design accepted. Review it against current host behavior;
run `git diff --check` and verify that only this note changed.

A later implementation needs these functional checks:

- Three and four seats default as accepted; host selection round-trips to
  every client, and a seat count change does not overwrite an explicit choice.
- Guests, watchers and live games cannot change timing. Invalid messages
  are refused with no mutation. Test rematch editing and readiness against
  the accepted choices; selecting the same value is a no-op.
- With no overrides, create concurrent rooms selecting 60000 and 180000;
  after start, each `turnDeadline - serverNow` is near its own effective
  window, within a documented runner tolerance. Operator overrides
  retain the short durations used by existing tests and are labelled honestly.
- Lobby save/restart, join, rejoin, host migration and rematch preserve the
  setting. Mid-game restart restores the existing deadline and budget;
  legacy saves migrate without resetting deadlines or dropping rooms. Restore
  a room with a 1200 ms window and 3600 ms total, then with changed process
  defaults: saved effective values still win. Also cover a non-6× saved cap
  and legacy fields missing independently.
- Every existing waited-on phase still times out. Accepted moves reset only
  the inactivity window; repeated actions cannot outrun the total budget.
  Dropped seats remain governed by the existing grace/recovery rules.
- At 390×844 and 1280×720, host/guest controls fit and remain keyboard
  accessible. The countdown continues to use server time and names the seat
  the table is waiting for.

Extend the existing `turn-prove`, `cap-prove`, `restart-prove` and
`countdown-prove` coverage for these cases; keep their assertions intact.
Those future checks are a test plan, not claims of a completed implementation.
