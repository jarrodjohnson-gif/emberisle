# #1101 assertion replacement evidence

Snapshot: current working tree compared with `origin/main` (`b90290ab`), 2026-10-25. Base line numbers below refer to main, not shifted working-tree lines. This is a source audit; it does not assert test success.

Justification keys:
- **Dock**: owner-approved stationary phone dock, #1101 and DECISIONS 2026-10-22/2026-10-24; every phone slot remains present and stationary, empty hand shows zeros, disabled controls explain unavailability, Menu moves into dock.
- **Replacement**: desk Option A on #1101 and AGENTS rule 13: replace superseded assertions at equal or greater strength, preserve desktop behavior, separate proof commit and old/new table.
- **Handoff**: desk release 2026-10-25 explicitly permits main reversion or documented justification for safe-area188–189; all other changed supporting lines are enumerated below.
- **Size**: owner-approved one-PR growth exception, narrowed by desk approval to +480 B beyond normal400 B against b90290ab for measured build-stamp variation; retain lazy TradeSlot and existing ceilings.

## Replaced assertions and behavioral waits

| Main file:line | Old assertion / wait | Current replacement | Justification / preserved coverage |
|---|---|---|---|
| `scripts/build-ready-prove.mjs:272` | Roll phase requires no `build-path` element | Touch: Path exists with `data-build-state=idle` and `aria-disabled=true`; desktop still absent; phase still Roll | Dock, Replacement: build row always occupies its slot. Later ready-pulse checks remain. |
| `scripts/first-game-coach-prove.mjs:161` | One Shift+Tab from Menu to Skip | Eleven Shift+Tab presses exactly yield ten `dock` entries then `Skip`; existing final Skip-focus assertion retained | Dock, Replacement: fixed goods/build/Fortunes controls intervene. |
| `scripts/first-game-coach-prove.mjs:163` | One Tab from Skip to Menu | Eleven Tab presses exactly yield ten `dock` entries then `Menu`; existing final Menu-focus assertion retained | Dock, Replacement: verify reverse route and reject outside focus. |
| `scripts/fortune-count-prove.mjs:60` | Button count equals `held>0 ? 1 : 0` | Desktop predicate retained; phone exactly one opener, disabled iff held=0, exact x/y/w/h unchanged across snapshots | Dock, Replacement: persistent Fortunes slot and no movement through purchases/restart. |
| `scripts/fortune-count-prove.mjs:61` | For initially empty seats and watcher, opener count0 | Phone count1 and disabled=true; desktop count0; added watcher text/name exactly `Fortunes` and no digits in text/name/description | Dock, Replacement: keep a disabled phone slot without leaking held counts; watcher behavior expansion explicitly disclosed. |
| `scripts/fortune-count-prove.mjs:62–63` | Purchase/restart snapshots only call heldMatchesOpener | Each snapshot still calls it, plus watcherPrivate checks | Preserve privacy on every purchase and restart; host private-card assertions unchanged. |
| `scripts/fortune-cue-prove.mjs:129` | Empty-hand opener detaches | Touch: glow detaches, opener disabled=true, label `Fortunes · 0`, exact box equals pre-empty box; desktop detachment unchanged | Dock, Replacement: no cue and disabled stationary opener replace disappearance. |
| `scripts/fortune-tray-prove.mjs:329` | Empty hand: opener count0 | Touch `{n:1, off:"true", inSlot:true}` using exact opener/slot rectangle equality; desktop0 | Dock, Replacement: fixed disabled opener fills the slot. |
| `scripts/fortune-tray-prove.mjs:330` | Focus falls to Trade | Touch focus stays on `Fortunes · 0`; desktop still Trade | Dock, Replacement: persistent opener is restored focus target. |
| `scripts/hand-hidden-prove.mjs:125` | Roll-off resource tile count0 | Touch5; desktop0; added phoneHand verifies actual-seat counts and exact fixed boxes | Dock, Replacement: five zero cards are present from first roll. |
| `scripts/hand-hidden-prove.mjs:126` | Roll-off hand-dock count0 | Touch1; desktop0 | Dock, Replacement: hand mounted from outset. |
| `scripts/hand-hidden-prove.mjs:130` | First setup tile count0 | Touch5; desktop0; phoneHand verifies seat counts and box stability | Dock, Replacement: setup does not remove slot. |
| `scripts/hand-hidden-prove.mjs:149` | Before each setup outpost, tile count0 | Touch5; desktop0; phoneHand on every checked setup step | Dock, Replacement: retains real rules-driven setup sequence and actual resource comparison. |
| `scripts/hand-hidden-prove.mjs:161` | Banner position changes by 0.8×hand height through hand height+10px | Touch exact `full===bare` plus exact hand/dock/status boxes; desktop original range retained | Dock, Replacement: payment changes values without shifting dock. |
| `scripts/hand-hidden-prove.mjs:169–177` | Reduced motion null/≤1ms; normal hand-in220ms, exact easing, opacity/transform-only, midpoint opacity, final-height footprint | Touch probe must return null; opacity exactly1, zero hand-* animations, exact final height; desktop retains every original animation assertion | Dock, Replacement: already-mounted phone hand must not run mount animation; no desktop animation coverage lost. |
| `scripts/hand-hidden-prove.mjs:202` | Never-funded seat: wait for hand-dock absent | Touch phoneHand wait verifies actual current-seat counts, one hand and exact boxes; desktop absence wait retained | Dock, Replacement: current-seat data refreshes within fixed slot. |
| `scripts/hand-hidden-prove.mjs:203` | Never-funded seat tile count0 | Touch5; desktop0 | Dock, Replacement: phone zeros remain, desktop hides hand. |
| `scripts/hand-hidden-prove.mjs:229` | Fresh setup after prior funded game: wait for hand-dock absent | Touch phoneHand wait plus exact box/count assertion; desktop absence wait retained | Dock, Replacement: retains state-reset scenario without sticky earlier values. |
| `scripts/hand-hidden-prove.mjs:230` | Fresh setup tile count0 | Touch5; desktop0 | Dock, Replacement: empty fresh setup retains five zero cards. |
| `scripts/hud-safe-area-prove.mjs:202` | With full hand/every fortune, `m.scrolls` | `!m.scrolls` | Dock, Replacement: fixed dock must never scroll. |
| `scripts/hud-safe-area-prove.mjs:203` | Control inside safe area,44px tall, uncovered, inside scroller | Identical predicate against fixed dock; message updated | Dock, Replacement: preserve safe bounds, size and hit-testing. |
| `scripts/hud-safe-area-prove.mjs:226` | Cue absent OR End absent OR cue bottom≈End-parent top within1px | Cue absent AND End exists AND End parent is exact `[data-slot="turn"]` | Dock, Replacement: no overflow cue and mandatory turn-slot ownership. |
| `scripts/hud-safe-area-prove.mjs:234` | >3 keyboard controls, none covered by pinned row | Same >3 count and zero covered controls, described as dock controls | Replacement: predicate retained. |
| `scripts/hud-safe-area-prove.mjs:235` | Every focus: cue above pinned row | Every focus: no cue, End exists in exact turn slot | Dock, Replacement: uses strengthened cueClear predicate. |
| `scripts/reflow-prove.mjs:219` | height≤568 stack overflows | height≤568 no overflow AND no cue | Dock, Replacement: short-phone dock must fit; remaining target reachability/board checks retained. |
| `scripts/table-menu-prove.mjs:68` | Exactly one button in top64px | Touch0; desktop1 | Dock, Replacement: Menu moves to bottom dock. |
| `scripts/table-menu-prove.mjs:72` | Menu right<32 and top<32 | Touch exact Menu-slot box, bottom<48, portrait right<32 / landscape left<32; desktop original | Dock, Replacement: relocated Menu retains name and≥44px checks. |
| `scripts/visual-direction-prove.mjs:63` | End horizontal box fits `.end-footer`; two dice, exact sum8, dice row in viewport | End full horizontal/vertical box fits turn slot; same two dice/sum8; row in viewport AND status slot | Dock, Replacement: dice and turn control now occupy separate fixed slots; no original count/sum/viewport check removed. |
| `scripts/visual-direction-prove.mjs:109` | Offer nonmodal, inside visible bottom stack | Original assertions retained; phone adds exact status-slot x/y/w/h within0.5px | Dock, Replacement: compact offer fills fixed status slot. |

## Supporting selectors, helpers and measurements

| Main file:line | Old | Current replacement | Reason / scope |
|---|---|---|---|
| `scripts/build-ready-prove.mjs:230` | Build Path nearest `.overflow-y-auto` scrollHeight | Nearest dock scrollHeight, fallback to old scroller | Measure new phone container while keeping desktop measurement and existing height/board-hole bounds. |
| `scripts/first-game-coach-prove.mjs:143` | `header [aria-label="Table menu"]` | `[data-slot="menu"] [aria-label="Table menu"]` | Locate moved Menu; seat and Skip selectors/count remain. |
| `scripts/first-game-coach-prove.mjs:161` | No traversal helper | walk(key) records11 consecutive focus destinations | Supports two new exact keyboard-route assertions. |
| `scripts/fortune-count-prove.mjs:58` | Comment: My fortunes never shown to watcher | Comment: fixed phone slot disabled when empty, watcher has no held count | Explicitly document phone watcher presentation change. |
| `scripts/fortune-count-prove.mjs:61` | No watcherPrivate helper | Checks watcher text/name exactlyFortunes, no numeric count in text/name/description | Added private-data boundary check accompanying persistent slot. |
| `scripts/fortune-cue-prove.mjs:128` | Craft empty hidden hand | Capture opener boundingBox, then same craft | Baseline for stationary-box comparison. |
| `scripts/hand-hidden-prove.mjs:121` | No fixed phone snapshot | phoneBoxes records hand-dock/dock/turn-banner exact x/y/w/h; fixed initial snapshot | Supports stronger stationary geometry checks. |
| `scripts/hand-hidden-prove.mjs:121` | No phoneHand helper | Wait counts equal current actor's resources in fixed resource order; assert one hand and exact boxes | Retains actual state identity and strengthens geometry. |
| `scripts/hand-hidden-prove.mjs:191` | Five zero counts only | Same assertion plus phoneHand | Adds geometry/state equality after spend-to-zero. |
| `scripts/hand-hidden-prove.mjs:269` | Console describes220ms rise on all normal-motion views | Phone console describes fixed boxes/counts/no mount animation | Reporting only; no checks removed. Leading older console sentence remains stale (audit below). |
| `scripts/hud-safe-area-prove.mjs:188–189` | Walk to ancestor overflowY=auto | Closest dock; throw if absent | **Explicit Handoff extra lines:** positive dock ownership required instead of nonexistent scroller. |
| `scripts/hud-safe-area-prove.mjs:208` | turn-banner.parentElement | dock selector | Start keyboard traversal at correct fixed container. |
| `scripts/hud-safe-area-prove.mjs:216` | turn-banner.parentElement | dock selector | Focus-containment boundary for every Tab. |
| `scripts/hud-safe-area-prove.mjs:220` | Cue rectangle | Cue element | Absence now checked; geometry no longer appropriate. |
| `scripts/hud-safe-area-prove.mjs:221` | End-parent rectangle | End button element | Enables exact parent===turn-slot assertion, not just existence. |
| `scripts/hud-safe-area-prove.mjs:246` | turn-banner.parentElement | dock selector | **Additional supporting selector:** fortune-tray coverage/hit-test still inspects same End-turn slot; existing tray bounds/assertions retained. |
| `scripts/reflow-prove.mjs:161` | column iff stack width<half viewport | When dock exists, column iff width>height; otherwise old predicate | **Additional supporting measurement:** fixed320px column can exceed half a narrow landscape viewport; use actual dock orientation. Board-clearance thresholds/hit tests unchanged. |
| `scripts/table-menu-prove.mjs:69` | First top-row button | Touch trigger measured relative to exact Menu slot, screen edges and orientation; desktop original | Supplies new placement predicate without changing menu behavior checks. |
| `scripts/visual-direction-prove.mjs:62` | `.end-footer` rectangle and last button | exact turn-slot rectangle and button; status-slot rectangle | Containers moved by approved layout. |
| `scripts/visual-direction-prove.mjs:94` | Offer bounds, insideStack, modal | Same fields plus status-slot rectangle equality within0.5px | Additional exact slot evidence. |

## Size exception and additional proof

| Main file:line | Old | New | Owner justification |
|---|---|---|---|
| `scripts/size-prove.mjs:56` | No TradeSlot chunk ceiling | TradeSlot1000B ceiling, measured comment0.80kB | Handoff requires keeping lazyTradeSlot; only new chunk ceiling added. |
| `scripts/size-prove.mjs:59` | index growth400B |400+480B | Desk approval on2026-10-25: extra480B for stamped-build variation, total880B; capped by owner900B decision. Desk removes after merge. Existing index/chunk ceilings unchanged in current diff. |
| `scripts/stationary-dock-prove.mjs` (new) | No stationary-six-state proof | Two phone viewports × six states; exact dock/slot positions≤0.5px,44px targets,8px separation, portrait bottom-third and≥60% board-height, landscape board-height, no intrusion, zero console errors | New registered proof implements#1101 completion test. Original builder recorded105 failures on main; current actual run evidence belongs in PR. |


## Chat geometry replacements

| Base file:line | Old assertion / supporting geometry | New assertion / supporting geometry | Why |
|---|---|---|---|
| scripts/chat-prove.mjs:1249 | Emoji row below the closed Open-chat button, within safe bounds | Portrait retains below-opener rule; landscape requires row contained in chat sheet, clear of dock Menu and seat strip; all safe bounds retained | Landscape opener moves into bottom dock row, #1101. |
| scripts/chat-prove.mjs:1444 | Read sheet top and strip bottom only | Read full sheet/strip rectangles; test full56px bubble-band nonoverlap, full viewport containment and four visible uncovered seat totals | Equivalent landscape geometry for a sheet beside or below fixed column. |
| scripts/chat-prove.mjs:1445 | Sheet top at least strip bottom+56 | Portrait retains exact predicate; landscape requires nonoverlap, viewport containment, exactly4 uncovered seat totals | Keep bubble band and seat visibility with the approved dock. All log/newest/font/map-hole and failure assertions remain. |

The trade-map and rotate-overlays proofs remain byte-for-byte unchanged. Their full-card receipts, scrolling, safe areas,44px targets,8px separation, Escape behavior, seat visibility and zero-error checks pass.
