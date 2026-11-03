# Design laws: builder checklist

Paste into the PR body under a heading `Design laws: complies / exceptions`. Mark each line `yes`, `n/a` or `exception: <why, and which owner decision allows it>`. A `no` with no exception is a blocker.

1. **Law 1** The dock's height and the hand row's top y are identical in every turn state I touched, at 390x844 and 844x390 (numbers pasted, not estimated).
2. **Law 2** Every element I added or changed in the dock owns a fixed slot; when absent it is greyed or empty, not collapsed. Fortunes button box: same x, y, width in every state.
3. **Law 3** The island's fit rectangle (`__isle.fit`) and on-screen box did not change across dock states; island share at both phone sizes pasted.
4. **Law 4** All new controls sit inside the safe area (`hud-safe-area-prove` green); spacing uses only 4/8/12/16/24/32/48.
5. **Law 5** Every button a player presses on their turn is in the bottom third on a phone (top edge at or below y 563 portrait / y 260 landscape or the column's lower half).
6. **Law 6** Every new interactive element is at least 44x44 CSS px with 8 px to its neighbours; Trade and End turn are not adjacent.
7. **Law 7** No dock element covers a legal corner or edge during setup at either phone size.
8. **Law 8** Exactly one primary button is visible per screen state (none on another seat's turn).
9. **Law 9** Only the five type sizes; nothing under 12 px; counts `tabular-nums`; one instruction sentence per state; no uppercase-tracked labels.
10. **Law 10** Any new sheet has a visible Close at three viewports, closes on Esc, and never opens over another sheet.
11. **Law 11** No transition or animation on layout properties; nothing over 320 ms except the roll moment, the legal pulse and the wayfarer walk; a tap skips anything longer; intents are not delayed by motion.
12. **Law 12** Gain and loss feedback still plays on another seat's turn and shows sign plus number, not colour alone.
13. **Law 13** `contrast-prove` green including any new chip over the board; a reduced-motion run shows no running loop and loses no information.
14. **Law 14** New strings use the README "Names" vocabulary; no new colour token or surface treatment; button labels are verb plus amount.

**Adding something new** (only if the PR adds an element or feature; otherwise write `n/a`):
- Home: journey and fixed slot or sheet it lives in; no existing slot appeared, disappeared or resized.
- Optional: practice, hosting and joining work without it.
- Space: at most one slot in portrait and in short landscape; island share unchanged.
- Quiet state: what it shows with nothing to say (greyed slot, never a gap).
- Exit: how it closes, and nothing else moved when it did (numbers pasted).
- Proof: name of the proof that checks its slot, targets and contrast, registered in `package.json` and `ci.yml`.
- Mock: link to the owner's approval of a mock shown beside the current screen.

Proof registration: any new or extended proof is in `package.json` and `.github/workflows/ci.yml` (AGENTS.md rule 6).
