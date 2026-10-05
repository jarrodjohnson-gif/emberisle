# Research: the next UX/UI improvements

- Step: Research; recommendations for Jarrod's review, not scheduled work.
- Date: 2026-10-05
- Agent: ChatGPT
- Direction: Offsuit's restraint around a readable, tactile Catan-style island, using Emberisle's names.

## Evidence and limits

Read [the October UX review](../design/ux-review-2026-10.md), [the polish system](../design/polish.md),
[the earlier visual research](visual-polish.md), and the current title, lobby, chat, help, seat rail,
trade and win components at `8c09099` on the #477 branch. Public GitHub PR state was read on
2026-10-05. This is a source and existing-evidence review; no new playtest, screenshots or device
measurements were performed. Earlier screenshot measurements describe their recorded commits, not
the present UI. SwiftShader timings in the September research do not establish phone performance.

Much of the earlier review has already shipped: the title has one primary Play action (#453), the
lobby explains readiness (#432/#448), builds have an instruction and text chips use stronger glass
(#455), chat uses polish tokens (#471), and the hand, dice, menu and seat rail have been simplified
(#473/#476/#479/#480/#482). Camera fitting and the landscape column landed in #469/#490; seat names
and notch handling landed in #486/#484. Those old findings should not become new implementation work.

The current proposals below account for active work:

| Area | Existing work to evaluate first |
|---|---|
| Landscape actions | [PR #493](https://github.com/jarrodjohnson-gif/emberisle/pull/493) pins Roll / End turn. |
| Recovery from a failed download | [PR #494](https://github.com/jarrodjohnson-gif/emberisle/pull/494) handles lazy chunk retries; game-over recovery remains a stated gap. |
| Fortune names and explanations | [PR #495](https://github.com/jarrodjohnson-gif/emberisle/pull/495) supplies one tray, one-line effects, blocked-state reasons and shared names. |
| Seats distinguishable without colour | [PR #496](https://github.com/jarrodjohnson-gif/emberisle/pull/496) proposes redundant geometric marks. |
| Social controls | [PR #477](https://github.com/jarrodjohnson-gif/emberisle/pull/477) owns quick reactions; #500/#501 cover local mute and chat history after rejoining. |

## Prioritized recommendations

### 1. Make the remaining small phone controls easy to hit

**Evidence:** the October review measured 32 px title swatches and lobby Copy controls, 22 px chat
presets and a 32 px emote button. Current `EmberisleApp.tsx` still uses `size-8` swatches; `Chat.tsx`
uses small preset chips and `size-8` / `h-8` input controls. These are source observations; actual
hit regions need measurement. The main seat triggers are already 44 px.

**Recommendation:** research a 44 px touch target for these secondary controls, keeping their visible
marks quiet. Spacing and invisible padding can preserve the restrained look where they do not overlap
neighbours. If presets need another row, compare putting them behind one existing chat control rather
than making the dock taller. Evaluate chat after #477 and #500 land, so the study covers the final
controls instead of designing them twice.

**Evidence that would settle it:** a player can choose a colour, copy an invite and send a preset with
one thumb at 390×844 and 844×390; target rectangles are at least 44 px, distinct and unobscured. Record
keyboard focus and board space as well as visual size.

### 2. Explain the next action with the controls already on screen

**Evidence:** `HowTo.tsx` ends with “Drag to orbit the isle. Tap glowing corners and paths to build.”
The current phone flow selects a target before confirming it with Place or a second tap; the camera
also has a fitted overhead mode and optional free view. The roll-off phase still uses a two-sentence
rule explanation. The existing polish direction calls for one short instruction in one place.

**Recommendation:** observe a first-time player's first placement and first turn, then align help
copy with the current input method. Prefer a brief instruction in the existing phase or help slot,
with rule detail inside How to play. Evaluate fortune comprehension after #495, which already owns
names and effects. Preserve the direct Play entry and avoid an extra onboarding screen or persistent
tutorial panel.

**Evidence that would settle it:** without coaching, a new phone player understands when a placement
is only selected, how to commit or cancel it, why a matching roll pays goods, and where to find an
explanation. Record hesitation and mis-taps; existing automated proofs cannot establish comprehension.

### 3. Let phone players read why the winner won

**Evidence:** `WinScreen.tsx` still switches to “Out”, “Str” and “Hid” below `sm`, with meanings in
`title` attributes that a phone cannot reliably reveal. The October review raised this finding but
held it for rematch work; rematch has since landed in #405. The score table already scrolls and the
winner, total and Play again behavior exist.

**Recommendation:** compare full sentence-case labels in the existing scrolling table with a simple
per-player score breakdown opened on demand. Keep winner and total as the immediate information;
make the explanation readable without permanently adding more rows or decoration. Account for #494's
separate game-over download-recovery gap when evaluating access to the score screen.

**Evidence that would settle it:** on a phone, a first-time player can explain the point sources and
identify who can start another game. Include long names, 200% text zoom and keyboard access in the
comparison; short abbreviations alone should not carry meaning.

### 4. Finish the existing surface system at sheet boundaries

**Evidence:** the polish spec defines 24 px sheet corners and sentence-case labels. Current How to
play, Trade and Win use hard-coded 28 px corners; Trade still capitalizes and tracks “I give” / “I
want”, and Win uses uppercase headers. The table and chat have already adopted the newer tokens.

**Recommendation:** assess the help, trade, fortune and score sheets together after #495. Use the
existing surface, radius, type and motion tokens where they improve consistency, and remove residual
decoration when each sheet is next touched. This is a consistency recommendation for existing nodes,
not a new theme or a request to restyle every component at once.

**Evidence that would settle it:** a side-by-side capture shows one family of sheets, a clear heading
and close control, readable secondary text and one obvious next action. Their opening and dismissal
behavior should also feel consistent with keyboard and reduced motion.

## Open questions

- Do first-time phone players understand Emberisle's building and fortune names from existing help,
  or would one compact visual example inside How to play improve recognition?
- Would players prefer full score-table headings with horizontal scrolling or a readable breakdown
  opened from a player's total? The present evidence does not choose between them.
- Which real iPhone and Android devices establish the minimum usable table size and frame time?
  #197 covers interruptions and #310/#464 cover performance; a source review cannot answer either.
- After the active UI PRs land, does the table still meet the polish rule of one instruction and one
  clear next action in portrait, landscape and a short desktop window? Fresh captures should answer
  this before revisiting the old HUD-coverage numbers.

The GitHub tracker remains the task list under [FRAMEWORK.md](../FRAMEWORK.md). This report creates no
issues or implementation commitments; Jarrod can use the findings to select the next research or
design node after the active work is reviewed.
