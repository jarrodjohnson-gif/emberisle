# Skip and Brisk motion boundaries

#1063 audits main `15794ce8cf409de69be85bc97d5199daab717cd7` for #539. **Roll and turn moments already skip on input. A Calm/Brisk preference and general scene skip are absent.** Changing CSS duration tokens alone cannot implement the accepted requirements: most relevant producers use JavaScript constants, native timestamps or the renderer clock.

This is a source inventory, not a new interface, pacing decision or visual design. It does not release Grok's #539 reservation. No runtime or browser proof was changed or run for this document.

## Accepted text and current source

The [roadmap's J-1](ux-roadmap.md#14-implement-skippable-long-animations-and-a-calmbrisk-toggle) and #539 ask for input to finish animations longer than 320ms, Brisk at 0.6× duration tokens, no roll hold in Brisk, a persistent mid-game Table-menu toggle and a hidden toggle under reduced motion. #541 separately owns the future staged win sequence.

Current [TableMenu.tsx](../../src/components/game/TableMenu.tsx) has no such preference or control. Searching `src` for Brisk, gameSpeed, motionSpeed and skipMotion finds no implementation. The renderer's existing `calm()` and [calmMotion()](../../src/lib/scene/landing.ts) mean the OS reduced-motion preference; they are not the requested Calm setting.

The eight duration tokens in [styles.css:147–152,189–190](../../src/styles.css#L147) are press 80ms, quick 150ms, base 220ms, settle 280ms, pulse 1.2s, moment 900ms, gain 2200ms and turn 1800ms. Only three source sites actually consume these tokens:

| Consumer | Actual token |
| --- | --- |
| [button.tsx:43](../../src/components/ui/button.tsx#L43), press transition | `--duration-press` |
| [styles.css:85](../../src/styles.css#L85), `.hand-in` | `--duration-base` |
| [hand-motion.css:90](../../src/components/game/hand-motion.css#L90), offer-card slot transition | `--duration-base` |

Comments in Dice, TurnMoment and the renderer mention tokens, but their schedules below use literals. Reduced motion currently disables CSS animation/transition through [styles.css:266–268](../../src/styles.css#L266); it does not rewrite every token to 1ms. Imperative owners separately implement their reduced-motion behavior.

## DOM and sound owners

| Producer | Current timing, completion and input ownership | Existing proof boundary |
| --- | --- | --- |
| [RollMoment in Dice.tsx:62–64,96–139](../../src/components/game/Dice.tsx#L62) | 900ms hold, then 220ms WAAPI flight to the resting dice row. Timers own removal even if animation fails. Window capture listeners for pointerdown/keydown already end the moment; cleanup clears both timers, cancels flight and clears `useMomentUp`. Reduced motion retains the 900ms readable number, then removes it without flight. | [roll-moment-prove.mjs:341–375](../../scripts/roll-moment-prove.mjs#L341) already requires skip<100ms, zero flight and the input reaching the page exactly once. It also retains normal 900ms/220ms timing, no replay on load/reconnect/jumps, failed-animation fallback and static reduced motion. These Calm assertions must remain intact. |
| [TurnMoment.tsx:14,50–65,91](../../src/components/game/TurnMoment.tsx#L14) | 1800ms JS lifetime and a separate literal 1800ms CSS animation. Waits for the roll moment to free the centre. Pointerdown/keydown already ends it. Rejoin establishes a silent baseline; stale turns clear pending/up state. | [turn-gain-prove.mjs](../../scripts/turn-gain-prove.mjs) covers turn ownership, geometry, non-blocking input, reconnect and reduced-motion static cues. |
| [Hand.tsx:23–25,60–83,140–165](../../src/components/game/Hand.tsx#L23) and [hand-motion.css:60–68](../../src/components/game/hand-motion.css#L60) | Hold 2200ms plus fade 300ms; JS cleanup, WAAPI lift offsets and literal 2500ms CSS cues agree. Reduced motion cancels physical movement while preserving the informative cue. Long-press 500ms in the same component is input recognition, not a cue duration. | [turn-gain-prove.mjs:55–56,636–656](../../scripts/turn-gain-prove.mjs#L55) retains the 2500ms cue and static reduced-motion behavior. [hand-offer-prove.mjs:59–60](../../scripts/hand-offer-prove.mjs#L59) checks settled offer-slot lift. #825 separately tracks gain readability; no new hold is chosen here. |
| [Landing knocks in store.ts:113–133](../../src/lib/game/store.ts#L113) | Sound timers use shared `LAND_MS`, matching scene landing. Reduced motion schedules no fall delay. Navigation/new game clears pending knocks. Visual speed or skip completion must be reconciled with this separate owner rather than leaving a late or duplicate knock. | [pieces-land-prove.mjs](../../scripts/pieces-land-prove.mjs) checks visual rest and delayed/reduced-motion knocks together. |
| [WinScreen.tsx:11–14,190–200](../../src/components/game/WinScreen.tsx#L11) | A winner immediately renders the current panel. No three-beat celebration producer exists here or in the scene modules. The 3000ms React-button timer is a soundboard cooldown, not a win beat. | [win-action-prove.mjs](../../scripts/win-action-prove.mjs) preserves actual winning actions, private pre-win projections, saved/restarted games and resulting screens. #541 owns new win choreography after #539. |

The existing skip listeners do not consume input. The roll proof explicitly checks input delivery; TurnMoment's handler has the same non-consuming source behavior. Neither establishes that a second canvas listener can safely be added without accounting for legal actions.

## Scene owners

| Producer | Current source and end state | Existing proof boundary |
| --- | --- | --- |
| Wayfarer travel | [isle-renderer.ts:708–722,1318–1328](../../src/lib/scene/isle-renderer.ts#L708): 300ms per hop, capped at 900ms. Uses THREE elapsed time plus native time since the previous frame. Completion snaps to destination; a changed target starts another walk. Fresh-board placement is immediate. | [wayfarer-prove.mjs:126–127](../../scripts/wayfarer-prove.mjs#L126): rises and final target. [idle-prove.mjs:144–145,182–214](../../scripts/idle-prove.mjs#L144): timely first progress, live reduced-motion change finishes current movement and future moves stand immediately. |
| Piece landing | [landing.ts:4](../../src/lib/scene/landing.ts#L4): path 220ms, outpost 280ms, stronghold 320ms. [isle-renderer.ts:1719–1739,2245–2254](../../src/lib/scene/isle-renderer.ts#L1719) preserves original native start times across mesh rebuilds and exact final rest. Reduced motion finishes immediately. These durations are not CSS token consumers, including the 320ms landing named in #539's Brisk completion test. | [pieces-land-prove.mjs:112–141,156–223,250–252](../../scripts/pieces-land-prove.mjs#L112): drop/overshoot/rest, path growth, rebuild carry-over, stronghold final transform and immediate reduced-motion knock. |
| Paying pieces | [isle-renderer.ts:610–650](../../src/lib/scene/isle-renderer.ts#L610): 90ms stagger, normal 280ms pulse, reduced-motion 1.2s static highlight. At most eight sound/haptic onsets. `clearPayers()` restores rest and suppresses pending sounds; new island/disposal clears pending work. | [flash-prove.mjs:226–250,329–338](../../scripts/flash-prove.mjs#L226): actual payers, bank-short/partial grants, exactly eight 90ms onsets, static 1.2s hold, navigation cleanup. Per-pulse duration and total staggered event lifetime are different quantities. |
| Paying hexes and Jelly response | [isle-renderer.ts:596–605](../../src/lib/scene/isle-renderer.ts#L596): 220ms ramp, 600ms glow life, reduced motion steps intensity. [jelly-board.ts:23–24,766–771,816–830](../../src/lib/scene/jelly-board.ts#L23): separate 2.4s roll squash/ripple and 900ms tap response, explicit rest rewrite; robber dulling has its own interpolation. | [flash-prove.mjs:356–463](../../scripts/flash-prove.mjs#L356): correct paying hexes, reduced motion, blocked/bank-short/coalesced rolls and no replay. |
| Tap wobble | [wobble.ts:5–37](../../src/lib/scene/wobble.ts#L5): 220ms, peak+3%, repeated input restarts from current pose, completion restores scale/height. Renderer suppresses it during landing/reduced motion. | [splash-prove.mjs:347](../../scripts/splash-prove.mjs#L347): no reduced-motion tap wobble. |
| Decorative animal flee | [ocean-life.ts:19,48–65,230–266](../../src/lib/scene/ocean-life.ts#L19): 250ms dart, hold through 1.5s, return by 4s; separate visitor lifetimes 18/27/30s and disable cancellation. This is ocean life, not the wayfarer. | [splash-prove.mjs:234,255,334–348](../../scripts/splash-prove.mjs#L234): flee progress/completion and reduced-motion splash/wobble. No separate ocean-life proof exists. Whether this belongs to the requested foreground control remains an owner question. |

## Clocks and interactions outside a blanket multiplier

Canvas release currently handles drag/pinch suppression, dock selection, double-tap Home, terrain sounds and legal picks ([isle-renderer.ts:1122–1171](../../src/lib/scene/isle-renderer.ts#L1122)). A new skip listener intersects that ownership. Double-tap 350ms is an input-recognition threshold. Camera Home/refit glide is native-clock 280ms, with reduced-motion immediate completion; drag/pan can take its glide ownership ([929–955](../../src/lib/scene/isle-renderer.ts#L929)). Neither is automatically a game-animation hold.

The renderer frame loop separately owns capped frame delta, native landing/glide timestamps and uncapped scene elapsed time ([1252–1333](../../src/lib/scene/isle-renderer.ts#L1252)). The same scene clock also drives sea/shader phases, idle motion, board-age climber stories, visitors and splash evolution. Scaling it globally would affect all of those consumers. Existing [idle-prove](../../scripts/idle-prove.mjs) and [climber-prove](../../scripts/climber-prove.mjs) contracts are independent of a foreground duration preference.

Canonical game clocks remain separate: practice bot scheduling is 700ms in [EmberisleApp.tsx:59](../../src/components/game/EmberisleApp.tsx#L59); human-first trade admission is 8000ms and offer lifetime 20000ms in [store.ts:238–241](../../src/lib/game/store.ts#L238); the host owns human turn deadlines and matching trade admission ([host.mjs:102–108,542–569,1144–1149](../../server/host.mjs#L102)). #539 does not authorize changing rules, accepted actions or network deadlines. TableMenu's 5000ms Leave cancellation and WinScreen's 3000ms soundboard cooldown are not animation producers.

## Proof scope and unlisted design gaps

The direct existing proof consumers are `roll-moment-prove`, `turn-gain-prove`, `pieces-land-prove`, `wayfarer-prove` and `flash-prove`. CSS offer-slot changes also need `hand-offer-prove`; Table-menu integration needs existing menu/client focus checks. Renderer/input changes need `idle-prove`, `pan-prove` and `board-touch-prove`. `splash-prove` and `climber-prove` are neighbors when the eventual scope touches decorative clocks. These names are all registered in [package.json](../../package.json) and [CI](../../.github/workflows/ci.yml). They describe dependencies, not a replacement claim or authorization to edit them.

Current proofs already verify normal pacing, roll-moment skip, reduced motion, sound timing and scene rest. Turn-moment input skip exists in source, but turn-gain-prove checks expiry rather than explicit pointer/key skip completion. None establishes the unimplemented Brisk preference, scene-wide skip, active speed changes or skip-versus-legal-pick/audio ownership. Preserve existing baseline assertions and add evidence for accepted new behavior; changing their old timing bounds would conceal the gap.

Two next-layer design leaves are recorded:

- **#1064:** nonvisual presentation completion/input/audio contract, Opus, after this research and the owner's scope answer. It resolves foreground versus ambient coverage, static readability holds and native clock ownership before code. It does not choose a new appearance.
- **#1065:** Astra three-viewport Table-menu mock/spec after #1064. #539 has prose for a toggle, but no accepted 390×844/844×390/1280×720 mock. Preserve the existing menu's focus, sound, Leave and watcher behavior. New runtime APIs and pacing are not selected here.

[Scope Question on #539](https://github.com/jarrodjohnson-gif/emberisle/issues/539#issuecomment-6373446743) asks which foreground/decorative effects and readability holds the feature includes. The recommendation keeps canonical, network and input clocks independent; it is not an owner decision. Parent #539 remains the claimed implementation. #541, #825 and the existing media children retain their separate scopes. No speculative implementation children are filed before the missing design contracts exist.

## Repeat the source audit

From a clean checkout of the audited revision:

```sh
git rev-parse HEAD
rg -n -- '--duration-' src
rg -n 'MOMENT_MS|SETTLE_MS|pointerdown|keydown|setTimeout|duration:' src/components/game/Dice.tsx src/components/game/TurnMoment.tsx
rg -n 'FLASH_MS|FADE_MS|CUE_MS|LAND_MS|calmMotion' src/components/game/Hand.tsx src/lib/scene/landing.ts src/lib/game/store.ts
rg -n 'ROLL_S|TAP_S' src/lib/scene/jelly-board.ts
rg -n 'startWalk|stepPayers|clearPayers|turnDeadline|PEOPLE_FIRST_MS' src/lib/scene/isle-renderer.ts server/host.mjs
```

Validation for this document checks cited paths/line bounds, the exact duration declarations and token consumers, timer/skip source anchors, registered proof names, child links, one-file scope and whitespace from a fresh clone. It makes no new frame-time, browser, sound-listening or device claim.
