# HUD pass v2 — two proposals for review

These are unapproved design directions for #903. They replace the rejected cream HUD exploration, with no runtime changes. The shared board source is the current `51cbe38` build; each frame embeds the full real board screenshot at native size and places transparent HTML above it. No camera, island scale, map fit, terrain, tokens, docks, or legal markers are retouched.

## What is being compared

**A — Open rim.** Separate information by placement and space. Public points are the large, light numbers in an unboxed left rail on desktop and a single flat mist header on phones. The bottom of the screen has the fixed hand, two quiet choices, and one filled End turn action. Build opens one sheet containing choices, exact costs, and availability. This direction removes persistent build costs and individual build tiles.

**B — Sea shelf.** Keep useful decisions together on one continuous cool sea-slate surface. On desktop the score table and direct build choices share the reserved right rail; on portrait the compact 2×2 score table and direct choices share the bottom shelf; on landscape everything sits in the existing left column. There is no surrounding outer card with smaller cards inside it. End turn remains the only filled action. Each build choice leads to the same cost/availability sheet before arming a piece.

The alternatives differ in information hierarchy and disclosure, not just colour. A gives more visual rest and a simpler turn; B makes availability visible without opening a sheet and keeps players close to the decisions. B is intentionally denser. Neither borrows a poker arrangement or a black theme.

| Decision | A — Open rim | B — Sea shelf |
|---|---|---|
| Build access | One Build launcher, then a complete list | Named choices with availability, then details |
| Availability cost | One extra tap to learn affordability | Visible Ready/Need summaries; exact shortage is one tap away |
| Player presentation | Large public points with open spacing | Compact public score table integrated into the shelf |
| Desktop | Left public-score rail + bottom actions | Reserved right score/action rail + bottom hand/actions |
| Portrait | Scores above the island, actions below | Scores and actions together below the island |
| Primary risk | Experienced players may want direct build access | More information to scan; portrait owned-fortune access uses a compact icon/count in the action row |

## Scope boundaries

- The current approved V1 hand is a **pixel-identical screenshot crop**, shared by both directions. No card face, font, symbol, count, spacing, motion, or responsive footprint is redesigned here. This deliberately preserves the existing cream faces and portrait 10px labels as a dependency exception to the proposed HUD's no-cream and ≥12px rules. A later explicit hand task must reconcile that exception; #903 must not silently change it.
- Chat C is fixed. The mock shows one Chat entry point; it does not invent a replacement chat panel, filters, or message previews. The existing two tabs and six emoji stay. Copy log appears in Table. No chat-opening reflow is allowed to refit the island.
- Trade retains the already chosen Table/Bank tabs. These mocks use Build as their action overlay; they do not propose a trade redesign.
- These static frames demonstrate composition and hierarchy. They are not functioning game UI, game-rule tests, or an implementation approval.

## Geometry contract

The current renderer's `playHole()` is exposed by `__isle.insets()` and declares these fixed reserved regions. `liveInsets()` is a separate measurement of phase-dependent DOM chrome; it differs (the captured desktop reported bottom312/right12) and must not be mistaken for the camera's declared playing hole. Persistent new HUD stays outside the open rectangle; temporary sheets may cover it without moving the camera.

| Viewport | Insets top / right / bottom / left | Open board rectangle |
|---|---|---|
| 390×844, coarse portrait | 68 / 12 / 326 / 12 | x12…378, y68…518 |
| 844×390, coarse landscape | 68 / 12 / 12 / 284 | x284…832, y68…378 |
| 1280×720, fine desktop | 68 / 312 / 220 / 216 | x216…968, y68…500 |

The desktop right region was already reserved by the current renderer. B's right shelf begins at x968; it does not add an inset. When Chat C opens in this region, its existing panel takes visual precedence and the B score/build shelf is temporarily hidden beneath it. Closing Chat restores the shelf. The board remains exactly where it was. This is a visibility/layering dependency to prove during implementation, not permission to redesign Chat C.

Hand crops, in source pixels: portrait x20 y578 width349.98 height62; landscape x16 y138 width252.02 height44; desktop x412 y536 width456 height80. The crop is displayed unscaled. Its surrounding blank tray padding is not a card and is not copied into the new HUD. Gain/loss effects remain the existing implementation's responsibility; the artifact shows the settled hand only.

## Points, names, awards, and selection

Every persistent seat number is **public points**, including the viewer's. The full detail sheet names the player and explains the equation. Jarrod's own detail shows public4 + private2 = total6, and explicitly says only the viewer sees those hidden points. Opponent details never reveal hidden points or a private total.

Names are actual display names when space permits. Tight headers use recognizable first names (Lucke), not three-letter codes. Alexandria and Joshspicy2 remain readable at 12px; a full name is always in the opened player sheet. No clipping or abbreviation may hide which player is selected.

Route shows actual longest contiguous path length. Swords shows wayfarers played, not fortune cards held. A heavier icon and +2 in wide rails identifies an earned award; compact rails retain the heavier icon, with the exact award and contribution in player detail. A future implementation must expose full accessible labels (for example, “Path length 5, Longest path award, two public points”). Colour alone is not enough to communicate an award.

The turn owner is indicated by the outlined seat dot plus the visible Your turn label. Inspecting another player underlines that player's name; it does not transfer the turn ring. The Lucke detail frame explicitly says “Viewing Lucke · Jarrod is still on turn.” Do not reuse the active-turn fill or ring for selection.

## Fixture fidelity

The current evidence agent supplied a coherent state, replacing the old impossible Route1/award fixture. Ordered seats: Jarrod (blue) path5/army1/public4/hidden2; Lucke Diggler (purple) path1/army3/public4; Alexandria (red) path1/army0/public2; Joshspicy2 (pale) path2/army0/public2. Jarrod owns Longest path; Lucke owns Largest army. Goods: wood3, brick2, sheep4, wheat1, stone2. Jarrod has four fortunes, including two hidden points. Seventeen fortunes remain in the deck. Last roll is six.

Path, Outpost, and Fortune are affordable in this fixture. Stronghold costs two wheat and three stone, so this hand is short one wheat and one stone. A's Build sheet says the precise shortage. The Upgrade control is named consistently at every viewport; its detail identifies the resulting stronghold. B's small “Need 2” summary means two missing goods in total, never two wheat; the accessible label and opened details spell this out. If this shorthand tests ambiguously, replace it with “Not ready” and retain the precise detail rather than shrinking type.

The Roll frames are static compositions proposing a pre-roll hierarchy over the unchanged main-phase board screenshot; they are not captures of an actual roll state. They remove build/trade/end controls and the settled hand from visual priority, leaving one Roll dice action. This is a phase hierarchy proposal; it is not a claim that the captured source was taken before the roll.

## Type and controls

New HUD text uses the system sans family. Public scores use a light 28–40px numeral; supporting text is 12–14px. Owned cards use the landed “My fortunes” wording; the portrait B compact icon/count exposes that same accessible label. A has no redundant Costs shortcut because Build already opens the cost list. Every proposed interactive target has a minimum 44px width and height, including close, Chat, Table, seat rows, and secondary actions. The fixed hand is excluded from new-style checks because it is the unchanged reference image.

New chrome uses cool mist `#e9f1f1`, sea slate `#d5e4e7`, deep teal ink `#153e44`, and one teal action fill. It has no gradients, glows, or shadows. The existing board and fixed hand may contain those original effects. Borders are limited to separators, the quiet Build launcher, and selection/focus states. Contrast and full viewport fit must be verified in the rendered artifacts before review.

Keyboard implementation must retain focus return after sheets, Escape to close, a trapped focus region for modal dialogs, and the actual disabled-action explanation. Static pictures do not prove any of these behaviours. Existing chat keyboard geometry and the unchanged board fit remain prerequisites.

## Deliverables and validation

The generator emits sixteen frames: each direction has main at all three viewports, plus portrait opponent detail, own detail, Table, Build, and Roll. Shared `directions.css`, `manifest.json`, and the generator are included. Each HTML embeds the source board and current hand pixels, so it does not depend on the old cream drafts or on linked image assets. Lucide icons are rendered through the repository's `lucide-react` and React static renderer; no emoji substitute for UI icons.

`node --check build-directions.mjs` passed. The generator executed successfully with the current evidence and measured hand crops. It refuses to overwrite existing output files. Browser rendering, actual contrast sampling, target bounds, and persistent-HUD overlap checks are assigned to the root renderer and must be reported separately; generation alone is not visual sign-off.

After owner selection, implementation should be a separate approved step: map the chosen hierarchy onto existing components, preserve the hand and Chat C, prove each viewport's board hole unchanged, test pointer/keyboard entry and exit, test each actual phase, and compare those captures to the chosen proposal. Do not imply either direction is approved because a mock rendered successfully.

## Architecture for the later build

This is a component responsibility map, not a request to implement it now. Keep game rules, purchases, turn progression, and board rendering in their current owners. The selected visual direction should be a layout/presentation change over existing state and handlers.

| Current component | Proposed responsibility |
|---|---|
| `Hud.tsx` | Compose the chosen persistent layout inside the existing reserved regions. Derive one phase-specific next action; orchestrate temporary overlays without changing `playHole()`. |
| `SeatRail.tsx` / `SeatDot.tsx` | Display public points and raw Route/Swords tallies; retain a distinct on-turn marker. A separately stored inspected player id controls selection styling. Never infer turn owner from selection. |
| `PlayerMenu.tsx` | Explain full name, public contributions, awards, held-card counts, and viewer-only hidden points. Consume existing score calculations; no duplicate scoring logic. |
| `BuildCost.tsx` | Reuse canonical cost values and shortage calculations for the Build sheet and B availability summaries. Keep “unaffordable” separate from “no legal location.” |
| `TableMenu.tsx` | Contain rules, building costs, Copy log, sound, music, water, view, and leave access. Maintain existing actions and settings state. |
| `Hand.tsx` / `hand-motion.css` | Fixed dependency. Preserve current pixels, dimensions, cue timing, privacy, and accessible resource names. No restyling in this pass. |
| `FortuneTray.tsx` | Existing owned-fortune destination. Keep the “owned fortunes” entry distinct from the build choice that buys a new Fortune. |
| `Chat.tsx` | Fixed Chat C destination and keyboard behaviour. B's desktop shelf temporarily yields the already reserved right rail; opening Chat must not recompute camera fit. |
| `TradeButton.tsx` / `TradePanel.tsx` / `TradeToast.tsx` | Existing Table/Bank choice, offers, replies, and countdowns. Their behaviour is preserved; phase priority may temporarily replace the normal action row. |

Persistent state needed for presentation is limited to inspected player, open overlay, and existing armed action. A new cosmetic “selected” flag must not be persisted as game state. Overlay state should be mutually exclusive where panels compete for the same region; the existing chat rules and trade-priority rules take precedence. Opening or closing an overlay never changes map insets.

## Acceptance checks for the later build

1. At each of the three target viewports, compare `__isle.insets()`, camera state, and board source geometry before/after opening and closing every overlay. All remain unchanged. Persistent control rectangles do not enter the declared board hole.
2. Measure every proposed control's hit rectangle (at least 44×44) and visible text (at least 12px). Exempt only the explicitly unchanged hand; do not use that exemption for new labels.
3. In the shared fixture, show public points 4/4/2/2, Path5 award for Jarrod, Army3 award for Lucke, Jarrod private2 only in his own detail, and four owned versus seventeen purchasable fortunes. Select Lucke and confirm Jarrod remains on turn.
4. Before roll, show Roll dice as the sole filled primary. After roll, restore Build/Trade and End turn. While armed, show the specific placement instruction and cancellation. During discard/robber/victim/incoming-offer phases, the required response takes priority and the ordinary action row does not compete.
5. From either direction and every size, reach costs/availability, owned fortunes, Trade, player detail, Table, and Chat in the documented number of taps. “Buy Fortune” and “Play owned fortune” must be separately reachable and unambiguously named.
6. Check ready, insufficient-goods, and no-legal-location states against actual engine legality. An unavailable choice explains why and never dispatches a build. Stronghold shortage in the shared fixture is exactly one wheat and one stone.
7. Verify focus entry, Escape/close, focus return, keyboard operation, screen-reader names, reduced motion, and chat keyboard-safe positioning using the real components. Static screenshots are insufficient evidence for interaction or accessibility behaviour.
8. Compare settled/gain/loss hand pixels and existing Chat C screenshots before and after. Re-run the repository's existing relevant proofs and retain their unmodified pass criteria. Record actual outputs and any skipped check.
