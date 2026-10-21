> The current approved direction is [Jelly Ocean](../design/jelly-ocean.md). The earlier Basalt exploration below is retained for reference.

# Emberisle visual audit — Basalt Table

13 October 2026. Baseline commit: `9a27031`; integrated main through `0196789`. Recommendation, three directions, component specifications and build order: [visual-direction.md](../design/visual-direction.md).

## Result

Implemented an opaque graphite HUD, chalk goods, a compact phone header and action tray, readable affordability ticks, bottom trade offers, longer gain/turn stamps, a folded seat picker, clear victory scoring, and low-poly ore workers with loaded wagons. Existing sheep and wayfarer animation remains. The nine-dock fix and new seat colours were incorporated from main. Marks are retained under the brief’s explicit requirement, with legacy-colour support for saved tables. No web fonts or chrome images were added. Reaction fades, dice flights and camera glides also stop immediately when reduced motion is enabled; live information remains visible for the same duration.

## Measured board space

The same 54 corners and 0.7-world-unit dock clearance fit inside the measured HUD hole. Values below compare the fitted projected scale squared against the baseline captures; they are rounded area estimates, not counts of coloured framebuffer pixels.

| Viewport | Main phase | Incoming offer open | Before bottom stack | After bottom stack |
|---|---:|---:|---:|---:|
| 1280×720 | +40% | +19% | 216 px | 156 px; 194 px with offer |
| 390×844 | +7% | +117% | 352 px | 232 px; 334 px with offer |
| 844×390 | +7% | +7% | 320 px-wide column | 260 px-wide column |

Also verified 1920×1080 and 320×568, simulated iPhone safe areas, 200% reflow, rotation, input focus and a simulated 180 px keyboard. Every visible interactive target in the new visual proof is at least 44 px. Essential text remains opaque at zero goods. Ink/surface and resource text pairs meet 4.5:1; focus/control borders use the stronger control-line token. Player marks survive on seats, pieces, trade senders and victory rows.

## Audit findings fixed

- Offers were near the top. They now occupy the bottom stack, keep Yes/No and a visible clock, and resolve to one log line for all receivers. A persistent live region announces the offer/result without moving focus. Simultaneous asker offers and robbery choices stack above chat; a sheet that stays below 128 px for 1 s minimizes while preserving its draft. Transient rotation heights do not close it.
- The portrait header wasted a row. Seats and menu now share a row; online utilities and Watching keep clear of points. Narrow reconnecting seats use tighter internal gaps so the status mark cannot clip the short name. At 320 px, wide short names truncate before reaching the points; full names remain accessible and on tap.
- The landscape hand clipped its fifth good. All five fit, with Trade/End and offers kept reachable when the column scrolls.
- Camera classification missed compact seat rails, narrow centred trays on wide screens, and bottom stacks crossing the viewport midpoint. Those surfaces now reserve real board space. A local No and offer-height changes trigger a refit.
- Chat controls were 20–32 px. Presets, fields, copy/filter controls, emotes and Minimize are 44 px. Phone fields are 16 px and the sheet follows the visual viewport keyboard inset. An offer or robbery choice reserves a strip above chat.
- A resource delta could touch its count during the card lift. Numeric badges occupy a separate corner, including short landscape cards.
- Reduced motion removed animationend, leaving the hand marked as entering. The hand now settles its state explicitly and cancels movement when the preference changes.
- Reaction labels inherited light seat ink on paper. They now use paper ink; phone reactions use a smaller decorative footprint clear of points.
- The resting dice sum was dark on the dark tray. It now uses table ink. A seven uses danger ink.
- The win had a headline without a reason. It now has the total plus actual outpost, stronghold, longest-path, largest-army and hidden-point contributions; full table labels scroll horizontally. Look-around controls respect the safe header.

## Validation

Production build, TypeScript and chunk budgets pass. The production host served a three-player game; three- and four-player browser tables agree on state, dice and trades. The complete server test chain passes, including rules, bot games, resource conservation, persistence, rejoin, protocol, stale actions, trading and wins.

The repository's browser checks were exercised: client, DPR, hotseat, three/four tabs, countdown, trades and practice trades, HUD safe areas, rotation overlays, fortune tray, hand cards/visibility, production serving, failed chunks, restore, night startup, chat/reactions, wayfarer, number tokens, pieces/marks/landing, idle, contrast, keyboard placement, production flashes, reflow, rotation, banner stability, HowTo, title, spectator, design tokens, roll/turn/gain moments, table menu, build readiness, board geometry and installation. Assertions about the old palette, 12/16/24 px corners, top-offer alertdialog and reduced-motion fades were updated to the specified design; functional rules and privacy checks remain.

`npm run visual-direction-prove` adds explicit board-size comparisons, corner/dock clearance, unclipped build prices at 320 px, minimum targets, offer placement/refit, contrast, static reduced cues/workers, and keyboard-safe chat. It runs in CI. `node scripts/design-shots.mjs` recreates the reference frames; `DIRECTION=fieldwork` or `DIRECTION=blue-hour` renders proposal treatments against the same seeded island. Screenshots are [saved alongside the spec](../design/basalt/).

One parallel software-GL run timed out taking a landscape screenshot; that case passed when rerun separately. This environment verifies Chromium rendering and interactions, including emulated touch/safe areas/keyboard. It does not verify physical iPhone/Safari rendering, sustained mobile GPU performance or VoiceOver speech.

The change belongs in a review PR. Per the repository's Builder/Reviewer workflow, the builder does not merge its own change or modify live hosting.

Continuation: `Continue Emberisle: review and merge open PRs, then take the next open issue per docs/FRAMEWORK.md.`
