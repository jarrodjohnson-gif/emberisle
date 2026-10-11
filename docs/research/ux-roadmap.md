# UX Roadmap: 24 ready-to-file issues

- step: 1 Research (synthesis), node: merge Parts A + B + C into a buildable roadmap
- date: 2026-10-05
- branch: `docs/ux-roadmap` - docs only, no code
- sources:
  - `docs/research/mobile-ux-benchmark.md` (Part A: top 25 patterns, first-5-min flow, motion + sound spec)
  - `docs/research/backend-excellence.md` (Part B: risk-ranked server gap list G1-G10 plus the 6-month target architecture)
  - `docs/research/complaints-tabletop.md` and `docs/research/complaints-digital.md` (Part C: 80 complaints mapped to Emberisle)
  - `docs/design/polish.md` (design tokens), `docs/FRAMEWORK.md` (issue format)

## How the order was chosen

The first 5 answer the highest impact-per-effort items: Jarrod's playtest
complaints 1-4 (turn clarity, gain feedback, build affordance, costs card) plus
the backend's #1 risk (stale intent replay, which can corrupt a live game).
Complaint 5 ("sloppy") is not one issue: the benchmark traces it to inconsistent
motion, two-voice copy, and numbers shown small or twice, so it is answered by
the motion discipline across #7, #14, and #15 plus the polish.md token rules.

Claude is building fixes for complaints 1-4 right now. Issues #1-#4 below are
the benchmark's *judgement on those fixes*, not re-files: each names what the
in-flight fix covers and what this issue adds. If Claude's fix already covers
the added part, the issue closes as done.

Every issue follows the `docs/FRAMEWORK.md` body format (Deliverable /
Completion test / Depends on / Source / Files / Size) plus a track mark
(**UX**, **backend**, or **both**) on its own line. Nothing is sized above S.
"Depends on" uses this doc's own issue numbers.

North-star rule, repeated from the brief: if an issue adds UI, it says what the
UI replaces. Phones first (390x844, 844x390), then desktop 1280x720.

## The first 5 to build

## 1. Implement the three-layer turn signal: banner arrival motion plus chime at the turn-change moment

**UX**

## Deliverable
On a turn change to you: (a) the turn banner slides in (translateY 8 px to 0,
opacity 0 to 1, 220 ms `--ease-out`); (b) the primary action (Roll, then End
turn) becomes the single Primary button and breathes with a 1.2 s sine
box-shadow pulse in your seat colour; (c) a dedicated `ui_your_turn` chime
fires exactly once at the turn-change event, mixed 6 dB under piece sounds.
A `yourTurn()` exists today (`src/lib/sound.ts:88`) but it reuses the
`chip_gain` click with a 30 ms buzz — this issue gives the moment its own cue
entry in `server/cue.mjs` and sets the haptic to 15 ms. Banner copy is
verb-first (same rule as the verb-first copy issue below): "Roll the dice" /
"Build, trade, or end your turn". Under reduced motion: no slide, no pulse;
the banner appears instantly with a 2 px `sea-ink` left border; the chime still
plays. This hardens the in-flight banner work (accent tint + tab title +
countdown), which the benchmark judged correct in signals but too quiet in
motion.

## Completion test
Playwright, hotseat: end a turn; within 300 ms assert the turn banner text
matches `/^(Roll|Build)/i`, a transition is running on its transform/opacity
(or it is instant under reduced motion), and the audio stub received
`ui_your_turn` exactly once. Fail if the chime fires more than once per turn
change or the banner takes longer than 400 ms to reach full opacity.

## Depends on
none (hardening follow-up to Claude's in-flight turn-banner work; it can
proceed in parallel against `Hud.tsx`).

## Source
`docs/research/mobile-ux-benchmark.md` section T-1 (Hearthstone's three-layer
signal: splash + glowing commit button + escalating timer). Jarrod complaint 1.

## Files
`src/components/game/Hud.tsx`, `src/lib/sound.ts`, `server/cue.mjs` (map the
new `ui_your_turn` name), styles for the pulse token.

Size: S

## 2. Implement the centre-screen "+2 Timber" gain moment, staged then faded

**UX**

## Deliverable
On a roll's gains, stacked lines appear centre-screen just above the island's
vertical centre: "+2 Timber", "+1 Clay" - `text-title` 20 px / 600, `fg` ink
text on a glass chip (`rounded-chip` 16 px, 12 px x / 8 px y padding), each
line led by a 12 px dot in the resource's fill token with the polish.md 1 px
`black/10` inner ring. (Text is never set in the fill colour: wool `#8fbf5a`
and grain `#e0b13a` are ~2:1 on glass and fail 4.5:1; the dot carries the
colour identity.) Lines stagger 120 ms apart, each rises 24 px and fades over
900 ms (`--duration-moment`), `--ease-out`; the stack is gone by 1.6 s. One
`chip_gain` tick fires per roll at the first line's appearance, not per hex.
The existing hand-card flash stays as the ledger - the moment never replaces
it. Under reduced motion there is no centre moment at all. The stack never
covers the island's middle third.

## Completion test
Playwright: rig a roll paying 2 timber + 1 clay. Assert an element containing
"+2 Timber" appears within 300 ms of the roll, is fully transparent by 1.8 s,
and the hand counts are correct throughout. Under `prefers-reduced-motion`,
assert no centre element ever appears. Fail if the moment's bounding box
covers the island hole's vertical centre third. This is Jarrod's explicit ask,
word for word.

## Depends on
none.

## Source
`docs/research/mobile-ux-benchmark.md` section G-1 (Balatro's staged scoring,
Marvel Snap's centre-screen flips). Jarrod complaint 2.

## Files
`src/components/game/` (new gain-moment element in the HUD layer);
`src/components/game/Hand.tsx` unchanged (ledger flash stays).

Size: S

## 3. Implement cost-on-face build buttons with a missing-good hint on tap

**UX**

## Deliverable
Build buttons read "Path - 1 timber 1 clay", "Outpost - 1 timber 1 clay
1 wool 1 grain", "Stronghold - 3 grain 2 ore", "Fortune - 1 wool 1 grain
1 ore": words in `fg` ink `text-body` 15 px, each amount led by its lucide
icon inside a fill-coloured chip using the resource's `-on` colour (polish.md:
never text in the fill colour - wool and grain fail contrast on glass),
secondary-button treatment at 44 px tall. Affordable builds are full
opacity; unaffordable builds are 50 % opacity AND tapping one shows a 16 px
glass chip above the button for 1.6 s naming the scarcest missing good
("Need 1 clay", or "Need 1 clay, 1 wool" for two). Buttons stay focusable with
`aria-disabled`. If Claude's in-flight affordance fix already prints costs on
the buttons, this issue reduces to the missing-good hint plus the Playwright
test.

## Completion test
Playwright: with 1 timber and 0 clay, assert the Path button's accessible name
contains "1 timber 1 clay"; tap it and assert a chip reading "Need 1 clay"
becomes visible within 300 ms and hides by 2 s; grant 1 clay and assert the
button reaches full opacity with no page reload. Fail if the cost text is
missing from the button face or the missing-good chip never appears.

## Depends on
none (reconcile with the in-flight affordance fix before starting).

## Source
`docs/research/mobile-ux-benchmark.md` section A-1 (Marvel Snap's cost-on-card,
Clash Royale's gray-until-affordable; the TTR "won't let us place them" report
is the failure this prevents). Jarrod complaint 3.

## Files
`src/components/game/Hud.tsx` (build buttons).

Size: S

## 4. Implement a one-tap Costs card in the table menu

**UX**

## Deliverable
The table menu gains a "Costs" row. It opens a `rounded-sheet` 24 card,
`surface` fill, listing the four builds with resource icons inside
fill-coloured chips using each resource's `-on` colour: Path - 1 timber
1 clay; Outpost - 1 timber 1 clay 1 wool 1 grain; Stronghold - 3 grain 2 ore
(on an outpost you own); Fortune - 1 wool 1 grain 1 ore. Plus the rate lines:
"Bank: 4 of one good for 1 of another. Docks: 3:1 any good, or 2:1 in their
good." One primary "Got it" button; Esc and the backdrop close it and return
focus to the menu button. It replaces nothing on screen by default - the menu
already exists.

## Completion test
Playwright: open the table menu, tap Costs; assert the sheet lists all four
builds with the exact costs above (text match), sits fully inside the viewport
at 390x844 and 1280x720, and Esc closes it with focus back on the menu button.
Fail if any cost is wrong or the sheet clips.

## Depends on
none.

## Source
`docs/research/mobile-ux-benchmark.md` section R-1 (Offsuit's hand-rankings
cheat sheet, v2.2.1). Jarrod complaint 4.

## Files
`src/components/game/TableMenu.tsx` (the "Costs" row), new costs sheet
component (e.g. `src/components/game/CostsSheet.tsx`).

Size: XS

## 5. Implement reconnect guards against stale and duplicate intents

**backend**

## Deliverable
Every client intent carries `cid` (a random id) and `baseSeq` (the
`game.seq` the intent was built against). The server keeps a ring of the last
32 applied `cid`s per seat: it refuses duplicate `cid`s, and refuses intents
whose `baseSeq` is older than the current `game.seq` with a `stale` error that
triggers a state push. The client's rejoin path drops its queued intents when
the seat's game has advanced past the queue's `baseSeq`.

## Completion test
New `server/stale-prove.mjs`: seat two players; seat A sends `roll` with
`baseSeq = N`; kill A's socket; advance the game to `N+3` through the bot;
rejoin A so the queue replays the stale roll. Assert the server answers
`{type:"error"}` containing "stale", `game.seq` is unchanged by the replay,
and a follow-up intent with `baseSeq = N+3` is accepted. This is the backend's
highest-risk gap: today a queued discard can apply to a game position the
player never saw.

## Depends on
none.

## Source
`docs/research/backend-excellence.md` section G1 (`src/lib/net/table.ts:190`,
`:204-211`; `server/host.mjs:885` `play()`).

## Files
`src/lib/net/table.ts`, `server/host.mjs`, new `server/stale-prove.mjs`.

Size: S

## The rest, in priority order

## 6. Implement a persistent seat-level current-turn marker

**UX**

## Deliverable
Every seat chip (rail, phone strip, lobby, trade toast, win rows) carries a
current-turn ring: 3 px solid in the seat's colour plus its seat mark, with an
8 px offset glow at 20 % opacity. On the phone strip the acting seat's card
also rises 2 px (translateY -2 px, 150 ms `--ease-out`). The marker is always
visible, even when the banner is dismissed or the chat dock is open. Under
reduced motion the ring appears with no rise.

## Completion test
Playwright: in a 3-seat game, after each pass, assert exactly one
`[data-current-turn="true"]` element exists, its seat id equals
`state.current`, and it has a non-zero box at 390x844 and 1280x720. Fail on
zero or two markers.

## Depends on
none.

## Source
`docs/research/mobile-ux-benchmark.md` section T-2 (BGA's highlighted player
panel, Colonist.io's "what can I do right now" reframe). Jarrod complaint 1.

## Files
Seat rail/strip components, trade toast, win rows.

Size: S

## 7. Implement verb-first copy in the turn banner

**UX**

## Deliverable
The banner always leads with the verb: "Roll the dice", "Place an outpost -
tap a glowing corner", "Build, trade, or end your turn", "Move the wayfarer",
"Discard 3 goods". `text-body` 15 px, sentence case, no period. At 360x640 it
may run to two lines, never more. This replaces the current longer
instruction strings; How to play keeps the full rules. Directly attacks the
"sloppy" complaint: one voice, one place.

## Completion test
Playwright: walk setup, roll, main phase, and a wayfarer move in hotseat;
assert the banner text matches `/^(Roll|Place|Build|Move|Discard)/i` at each
phase and contains no uppercase-tracked label. Fail on any phase showing the
old two-sentence copy.

## Depends on
none.

## Source
`docs/research/mobile-ux-benchmark.md` section T-3 (Colonist.io Rush, BGA
per-state prompts). Jarrod complaint 5 ("sloppy").

## Files
`src/components/game/Hud.tsx` (`turnText` and phase strings).

Size: XS

## 8. Implement sequenced pulses on paying pieces, and only the payers

**UX**

## Deliverable
Extends the existing paying-hex glow: each paying outpost/stronghold scales
1.0 to 1.12 to 1.0 over 280 ms (`--ease-snap`), staggered 90 ms per piece in
seat order, with a soft `gain_tick` sound and a guarded 8 ms
`navigator.vibrate` pulse per piece (capped at 8 ticks per roll). Only pieces
that actually gained goods pulse - never the hex alone, never non-paying
neighbours. Bank-short resources stay dark (already covered by
`flash-prove`). Under reduced motion there is no scale pulse; pieces get a
steady 1.2 s highlight hold instead, and the ticks still play.

## Completion test
Extend `flash-prove` (or a new Playwright proof stepping the renderer's
virtual clock): rig a roll where two outposts pay and one adjacent outpost
does not. Assert the two payers' scale peaks above 1.05, the non-payer never
exceeds 1.0, and the audio stub got one tick per payer. Fail on any pulse on a
non-paying piece - a mis-highlight destroys trust (Offsuit's wrong-glow bug).

## Depends on
none.

## Source
`docs/research/mobile-ux-benchmark.md` section G-2 (Balatro's per-card haptic
kicks; Offsuit's wrong-highlight negative proof).

## Files
`src/lib/scene/isle-renderer.ts` (piece pulse), `server/cue.mjs` (map
`gain_tick`), sound wiring.

Size: S

## 9. Implement one-voice narration of every goods delta in the persistent log

**UX**

## Deliverable
Every goods delta (roll gains, builds spent, steals, discards, trades,
fortune plays) appends exactly one line to the dock log in one voice: "Tide
gains 2 timber, 1 clay", "Ember spends 1 timber 1 clay - path". `text-caption`
12 px, muted, newest at bottom, 200 lines kept. The HUD's single visible line
always shows the latest line. No event is ever shown twice (not in banner +
log + toast). Longest-path and largest-army changes get a banner announcement
plus the log line, never a silent flip.

## Completion test
Playwright: script roll-with-gains, then a path build, then a trade. Assert
the dock log contains one line per event in order, each matching
`/^[A-Z][a-z]+ (gains|spends|steals|discards|trades|plays)/`, and no event
produced zero or two lines. Fail on duplicates or missing lines.

## Depends on
none.

## Source
`docs/research/mobile-ux-benchmark.md` section G-3 (BGA's persistent game
log); `docs/research/complaints-tabletop.md` #13 (award flips must never be
silent).

## Files
Chat dock log component, log-line builders in the store/host log path.

Size: XS

## 10. Implement tri-state build readiness icons (green now, amber one-trade-away, red no)

**UX**

## Deliverable
Each build button carries a 16 px leading icon: green check (affordable now),
amber "⇄N" (affordable if you trade at your best available rate - bank 4:1,
dock 3:1 or 2:1 - where N is the goods you would give), red cross (not
affordable even with one trade). Tapping the amber state opens the trade panel
pre-filled with the cheapest route. Each state has a screen-reader label
("Path, affordable" / "Path, one trade away" / "Path, can't afford"). This is
the BGA 7 Wonders cost language (red cross / amber check-with-price / green
check), the clearest build-readiness signal in the benchmark.

## Completion test
Playwright: script three hands (path-affordable / one-bank-trade-away /
impossible). Assert the three icon states appear on the Path button
respectively, and tapping the amber state opens the trade panel with give/take
pre-filled to the cheapest route. Fail if the amber state ever suggests a
trade the bank cannot pay.

## Depends on
none.

## Source
`docs/research/mobile-ux-benchmark.md` section A-2 (BGA 7 Wonders, live wiki).

## Files
`src/components/game/Hud.tsx` (build buttons), `src/components/game/TradePanel.tsx`
(prefill path).

Size: S

## 11. Implement the first-game inline coach (three steps, never a modal)

**UX**

## Deliverable
On a player's first-ever game (localStorage flag), a 3-step inline coach
appears in the banner slot: (1) setup - "Tap a glowing corner, then Place";
(2) first roll - "You gain goods when your numbers roll"; (3) first main phase
- "Build when a button lights up - costs are in the menu". Each step shows
once, advances when the player takes the action, and a quiet "Skip tips"
dismisses it forever. The coach also covers the first 7 ("Move the wayfarer
to a new hex, then pick a victim") - the strategically crucial rule the
benchmark warns tutorials skip (Carcassonne never taught farmers). Never a
modal, never blocks input.

## Completion test
Playwright: fresh profile (cleared storage) in practice mode. Assert step 1
text is visible at setup, step 2 after the first placement, step 3 on the
first main phase. Finish a game and start another: assert no coach text
appears. While any step is shown, assert the board canvas still receives
pointer events. Fail if any step blocks a legal tap.

## Depends on
none.

## Source
`docs/research/mobile-ux-benchmark.md` section R-2 (CATAN Classic's bite-size
lessons done as a continuous flow; Carcassonne's missing-farmers warning);
`docs/research/complaints-tabletop.md` #17 and `complaints-digital.md` #20
(tutorials that don't teach).

## Files
Banner/HUD slot, new coach component, localStorage flag.

Size: S

## 12. Implement per-seat trade offer filtering with instant dismiss on full decline

**both**

## Deliverable
The host already knows every hand, so it filters at render time: a seat that
cannot possibly accept an offer (lacks the asked goods and no bank/dock route
closes the gap) never gets the toast; instead the log records one muted line
("Tide asked 1 timber for 1 clay (you couldn't take it)"). When every human
seat has declined, the toast dismisses with a 150 ms fade - it never waits out
the 20 s. Under reduced motion the dismiss is instant, no fade.

## Completion test
Extend the trade proof to 3 tabs: seat A asks for 2 ore; seat B (holding 0
ore, no route) asserts no toast appears within 2 s but the muted log line
does; seats B and C decline and the toast on A dismisses within 500 ms. Fail
if B ever sees the toast or dismissal takes longer than 1 s.

## Depends on
none.

## Source
`docs/research/mobile-ux-benchmark.md` section TR-2 (Colonist.io, June 2026:
"rejected offers disappear immediately", "offers you can't afford are never
shown" - driven by mobile, where offer spam was "particularly annoying").

## Files
`server/host.mjs` (tradeOffer fan-out), `src/components/game/TradeToast.tsx`.

Size: S

## 13. Implement spatial trade-panel mapping with live per-player response icons

**UX**

## Deliverable
The trade panel's two halves map vertically: the "You give" row sits above
and chosen goods animate upward-and-away (translateY -12 px, fade, 220 ms
`--ease-out`); the "You want" row sits below and chosen goods animate
down-and-toward (+12 px). The open offer toast shows each other seat's live
response icon (check / cross / hourglass) in their seat colour plus seat mark.
A counter-offer re-alerts the original proposer with the `ui_your_turn` chime
- the notification problem even BGA leaves unsolved. Under reduced motion
there is no directional animation; response icons still update live.

## Completion test
Playwright: open the trade panel, add 1 timber to give; assert the chip's
bounding box moves -12 px (±4) under motion-safe settings and appears
instantly under reduced motion; have a bot decline and assert the toast shows
its cross icon within 1 s. Fail if give/receive rows are side-by-side or a
response icon is missing.

## Depends on
none.

## Source
`docs/research/mobile-ux-benchmark.md` section TR-1 (Colonist.io trade blog:
"upward and downward directions offer a more direct mental mapping of giving
and receiving"; per-player response status icons).

## Files
`src/components/game/TradePanel.tsx`, `src/components/game/TradeToast.tsx`.

Size: S

## 14. Implement skippable long animations and a Calm/Brisk toggle

**UX**

## Deliverable
Two rules. (1) Any animation longer than 320 ms (the roll moment, the
wayfarer walk, win beats) is skippable by tapping anywhere: the tap jumps it
to its end state instantly. (2) A "Calm / Brisk" toggle in the table menu:
Brisk multiplies all `--duration-*` tokens by 0.6 and skips the roll moment's
hold (dice settle straight into the HUD). The toggle works mid-game and
persists in localStorage. Under reduced motion the toggle is hidden (the
existing 1 ms collapse already covers it). Directly answers "sloppy": nothing
the player can't hurry.

## Completion test
Playwright: start the roll moment, tap mid-hold; assert the dice reach the
settled HUD state within 100 ms of the tap. Enable Brisk; assert a piece
landing completes within 200 ms (0.6 x 320). Fail if any animation ignores the
tap or Brisk has no measurable effect.

## Depends on
none.

## Source
`docs/research/mobile-ux-benchmark.md` section J-1 (the negative consensus:
TTR "no option to speed them up", Carcassonne "no way to change game speed
once the game has begun", Wingspan and Offsuit AI pacing complaints).

## Files
Table menu, renderer/HUD animation handling, CSS token overrides.

Size: S

## 15. Implement celebration-proof intent dispatch that never blocks the turn clock

**both**

## Deliverable
A standing rule, made structural: the client dispatches intents on pointerup
even mid-animation (the celebration queue never gates input), and the
server's turn timer is computed from intent receipt, never from animation
completion. Document it in one line in the README's turn-timer paragraph so
the next builder inherits the rule.

## Completion test
Playwright: rig the 900 ms roll moment; tap End turn 200 ms into it. Assert
the `pass` intent reaches the host within 150 ms of the tap - not after the
moment ends. Fail if any animation delays any intent.

## Depends on
none.

## Source
`docs/research/mobile-ux-benchmark.md` section J-4 (Hearthstone's documented
wart: animations eating into the 75 s server timer "can skip the opponent's
whole turn" - a polish bug that became a griefing vector).

## Files
Client intent dispatch path, `server/host.mjs` turn timer, `README.md`
(one line).

Size: S

## 16. Implement a protocol version in the wire protocol

**backend**

## Deliverable
`proto: 1` in every `hello` and `welcome`. The host refuses a `hello` carrying
an unknown future proto with an "update your client" error; the client shows
a refresh banner on a `welcome` with a newer proto than it knows. The number
bumps on breaking changes only. A stale tab from before a deploy then reads as
"old client", never as mysterious "not ready" refusals.

## Completion test
Proof script: send `hello {proto: 999}` and assert an error naming the
protocol; send `hello` with no proto and assert acceptance as proto 0 during
the transition window.

## Depends on
none.

## Source
`docs/research/backend-excellence.md` section G2 (`server/host.mjs:94`
`send()`; welcomes at `:624/:650/:663/:1020` carry no version today).

## Files
`server/host.mjs`, `src/lib/net/table.ts`.

Size: XS

## 17. Implement a cumulative budget bounding total turn length

**backend**

## Deliverable
New env knob `TURN_TOTAL_MS`, default 6x `TURN_MS`. The host tracks
`turnStartedAt` per waited-on seat alongside `turnDeadline`; when the budget is
exceeded, `turnOut` fires regardless of recent activity, the bot passes or
plays, the seat stays human (consistent with the existing #324/#344 call),
and the log says the table moved on. This closes the stall vector the
per-action timer leaves open: one trivial action every 119 s can no longer
hold the table hostage forever. Colonist.io's per-phase totals are the
precedent; the cumulative budget is the friends-first equivalent.

## Completion test
Proof script: a scripted seat sends a legal low-impact action every 10 s
(well under `TURN_MS`) for longer than the budget. Assert the host
force-passes at the budget and the log contains the moved-on line.

## Depends on
none.

## Source
`docs/research/backend-excellence.md` section G3 (`server/host.mjs:354-364`
`armTurns`, `:387` `turnOut`).

## Files
`server/host.mjs`.

Size: S

## 18. Implement GET /metrics with gauges, counters, and latency histograms

**backend**

## Deliverable
A `GET /metrics` JSON endpoint on the host: gauges (rooms, seated players,
watchers, sockets), counters (messages in/out, actions accepted/refused,
turnOuts, takeOvers, rejoins, letGos), histograms (action-to-broadcast
latency, per-player RTT from the ping loop, save duration, event-loop lag).
This is the instrumentation that lets anyone tell "the host is slow" apart
from "my network is slow" - the question the backend research found every
good multiplayer team answers first.

## Completion test
Proof script plays N scripted actions, then asserts `/metrics` reports the
action count, p95 action-to-broadcast latency under 250 ms on loopback, and
that a forced disconnect/rejoin increments the reconnect counter.

## Depends on
none.

## Source
`docs/research/backend-excellence.md` sections G4 and 1.7 (the metrics that
matter: time-to-first-move, turn latency p50/p95, disconnect rate, reconnect
success rate, AFK/bot rates).

## Files
`server/host.mjs`.

Size: S

## 19. Implement one-JSON-line-per-event host logging

**backend**

## Deliverable
The host emits one JSON log line per significant event - action accepted or
refused, turnOut, takeOver, rejoin, letGo, save failure - with monotonic
timestamps, so the night supervisor's logs become greppable. Includes
time-to-first-move (welcome sent to first accepted action), the single best
"does the game feel alive" number.

## Completion test
Proof script runs a scripted session (actions, a forced turnOut, a
disconnect/rejoin), then asserts the log contains one JSON line per event and
that grepping for `turnOut` finds it. Fail on unstructured lines for these
events.

## Depends on
none.

## Source
`docs/research/backend-excellence.md` sections G4 and 1.7.

## Files
`server/host.mjs`.

Size: S

## 20. Implement debounced room saves keeping write-then-rename

**backend**

## Deliverable
Replace the synchronous write on every state change with a per-room dirty
flag and a 250 ms trailing flush. Keep write-then-rename (the crash hygiene
is genuinely good) and add a final synchronous flush on process exit signals.
At friends scale today's behavior is fine; this removes the latency spikes a
slow disk would otherwise add to the broadcast path as table count grows.

## Completion test
Proof script: 50 rapid actions in one room complete; assert disk writes for
that room number 5 or fewer within any 2 s window, the room file parses, and
`load()` restores the final state exactly.

## Depends on
none (the save-duration metric from issue 18 is nice-to-have, not
required).

## Source
`docs/research/backend-excellence.md` section G5 (`server/host.mjs:151-173`
`save()`, called from `pushState`).

## Files
`server/host.mjs`.

Size: S

## 21. Implement an official gentle-wayfarer table toggle

**both**

## Deliverable
A pre-game table option (default: standard wayfarer). Gentle mode: the
wayfarer blocks the hex but never steals. Practice tables default to gentle
until the human's first win, teaching the piece's blocking role before its
teeth. UI copy is depersonalized everywhere ("the wayfarer takes a card" -
the piece acts, not the player). Every wayfarer move and steal is logged
verbosely so the hit never feels arbitrary. This is selling point #8 from the
complaints synthesis: no competitor ships the genre's most divisive mechanic
as a first-class table option; house rules are the current state of the art.

## Completion test
Proof plus Playwright: in a gentle game, roll a 7 - assert the wayfarer moves
to a new hex, the hex is blocked, and no steal is offered; the log shows the
move. In a standard game the 7 flow is unchanged. Fail if gentle mode ever
steals or standard mode ever skips the steal.

## Depends on
none.

## Source
`docs/research/complaints-tabletop.md` #4 (wayfarer feels personal) and #18
(groups bench the piece for beginners).

## Files
`src/lib/game/rules.ts` (table option), `server/host.mjs` (lobby option,
7 flow), lobby UI, wayfarer UI copy.

Size: S

## 22. Implement a per-table roll-history tally and a win-screen fairness summary

**UX**

## Deliverable
A roll-history tally (counts per sum, 2-12) lives in the log panel, and the
win screen shows an expected-vs-actual distribution summary. The dice stay
server-rolled with the rejection-sampled CSPRNG and are never touched by
difficulty - that invariant stays in the prove suite, and practice
difficulties are named by behavior, never by luck. Suspicion thrives in a
black box; this makes fairness auditable in-client. This answers the #1
complaint on both complaints lists ("the dice are rigged" spans 2017-2026
across every digital Catan product).

## Completion test
Playwright plus proof: script 20 rolls, assert the tally counts match the
rolls exactly; reach a win and assert the win screen shows the distribution
summary; assert the bot difficulty setting changes no RNG code path (prove
greps the invariant or the suite covers it).

## Depends on
none.

## Source
`docs/research/complaints-tabletop.md` #1 and `docs/research/complaints-digital.md`
#1 and #25 (the luck-trust overlap O1; "never let difficulty touch the RNG").

## Files
Log panel, `src/components/game/WinScreen.tsx`, prove suite (RNG invariant).

Size: S

## 23. Implement a pre-roll warning at 8 or more goods

**UX**

## Deliverable
When a seat holds 8+ goods, the hand shows a quiet chip at the roll decision
point: "A 7 costs you half". It appears only pre-roll and disappears after
the roll. Cheap, one-voice, and it fixes the surprise rather than the rule -
the rule itself stays exactly as designed.

## Completion test
Playwright: give a seat 8 goods; assert the chip is visible before the roll
and gone after it. With 7 goods, assert it never appears.

## Depends on
none.

## Source
`docs/research/complaints-tabletop.md` #11 (7-clusters; the self-rolled-7
variant is the sharpest "feels bad" in the corpus).

## Files
`src/components/game/Hand.tsx` or the HUD hand layer.

Size: XS

## 24. Implement legible dock rates on the coast and on the goods

**UX**

## Deliverable
Each dock on the coast shows its type and rate unambiguously: tapping a dock
shows icon plus rate ("2:1 timber") with 44 px targets. Long-pressing (or
right-clicking) a goods card in the hand shows a 16 px glass chip with only
the rates the player actually holds: "Bank 4:1 - Dock 3:1 - Timber dock 2:1".
The common bank trade stays one tap at the printed rate - the escape hatch
never feels hidden. This keeps the hand clean (north star) while answering
"what's my rate" at the point of decision, and it gives a starved player a
visible plan (a 2:1 dock route) instead of a wait.

## Completion test
Playwright: tap a dock, assert the rate label appears within 300 ms;
long-press the timber card while holding the timber dock, assert the chip
shows "Timber dock 2:1"; with no dock, assert "Bank 4:1 - Dock 3:1". Fail if
the chip shows a rate the player doesn't hold.

## Depends on
none.

## Source
`docs/research/complaints-tabletop.md` #2, #3, #28 (drought agency is docks;
dock layout must never contradict the rules);
`docs/research/complaints-digital.md` #16 (Colonist's four verbatim trade
complaints); `docs/research/mobile-ux-benchmark.md` section TR-3.

## Files
`src/lib/scene/isle-renderer.ts` (dock tap targets/labels),
`src/components/game/Hand.tsx` (long-press chip).

Size: S

## Deliberately deferred (not dropped)

These came out of the research with real merit but lost on impact-per-effort
against the 25 above, or need a prior issue first. They are the natural next
slice.

- **Staged win celebration** (benchmark J-2: tally, reveals, banner - never one
  modal). After the win screen exists in its current form; file when the
  celebration queue from #14 exists.
- **Haptics on contact moments** (benchmark J-3: 10 ms on piece landing, 8 ms
  per paying piece, 15 ms on your-turn). After #1 and #8.
- **Per-opponent reaction mute in two taps** (benchmark S-1, Marvel Snap
  pattern). Small; file when reactions get their next pass.
- **Invite stays two taps, forever** (benchmark S-2). A standing rule with a
  lobby-proof assertion; file alongside the next lobby work.
- **Dynamic text size, three steps** (benchmark AX-1). The unmet Wingspan need;
  file when the HUD layout settles after #1-#4.
- **Chrome budget as a number** (benchmark B-1: island keeps >= 62 % of the
  viewport). Fold into the prove suite when the HUD is rebuilt.
- **Piece-finder pulse** (benchmark B-2, Carcassonne's Meeple Finder). File
  when late-game boards get their readability pass.
- **Reload restores the table in under 2 s** (benchmark P-1). A headline
  guarantee with a 4G-throttled proof; file with the next reconnect work.
- **Payout iconography audit** (benchmark R-3). A one-time audit note; cheap,
  file anytime.
- **"Soon" outline for one-trade-away builds** (benchmark A-3). The
  zero-interaction version of #10's amber state; file after #10 lands.
- **Bot wayfarer targeting made VP-driven and logged** (complaints D3/D26).
  The bots already can't see hands; this makes the targeting rule explicit
  and visible ("bot moves the wayfarer toward the leader"). File with the
  next bot work.
- **Client give-up derived from the server's hold deadline** (backend G7).
  Real but narrow race at exactly 10 minutes; cheapest as a ride-along on the
  protocol-version work (#16).
- **Persisted turn deadlines across host restarts** (backend G9). Real
  correctness gap (an outage silently extends or resets the turn clock), but
  narrow blast radius at friends scale; file with the next timer work after
  #17 (cumulative budget) lands, since G3's `turnStartedAt` rides the same
  save/load path.
- **Pre-seat discipline: host-wide table-creation bucket and redacted peek**
  (backend G10). Real abuse vector (64 sockets fill ROOM_MAX), but requires a
  deliberate attacker on a friends-first host; file before any public listing
  of the host address.
- **RNG commit-reveal** (backend G6). Explicitly deferred by the research:
  overkill for friends-first, no stakes.
- **Spectator rejoin token** (backend G8). Watch item only; schedule if
  spectator presence hardens.

## Notes for the builders

- **Names.** Every proposal above uses Emberisle's words: outpost, stronghold,
  path, fortune, wayfarer; timber, clay, wool, grain, ore. Never the
  board-game trademark's terms in UI copy.
- **Reduced motion is a first-class variant**, not a fallback: CSS durations
  collapse to 1 ms and three.js loops hold steady (per `docs/design/polish.md`);
  sounds and haptics still fire.
- **The motion + sound spec sheet** (`docs/research/mobile-ux-benchmark.md`
  section D) is the timing authority for every issue above: durations,
  easings, sounds, haptics, and overlap priorities. If an issue's numbers and
  the spec sheet disagree, the spec sheet wins and the issue gets amended.
- **What "done" looks like** follows `docs/FRAMEWORK.md`: one session, one PR,
  one proof, never merge your own PR.
