# Emberisle #903 — HUD audit and two directions

Design and architecture specification only. No runtime implementation.

Review `index.html` for the visual gallery. Open `comparison-board.png` for a single comparison board.

## Baseline and scope

Current renderer: `51cbe384b24f5ba45c91b630ec45f6a05c162a43`, captured October 20, 2026.

Goods V1 (#773 / #909) and fortune controls (#776) landed after the checkpoint. Their fixes are reflected here.

Phase 1 covers seats, build actions, instructions, menus, and non-chat overlays. Chat C #899 remains open.

The new directions add no cream surfaces. The current approved hand remains a fixed screenshot crop.
Its paper faces and portrait 10 px labels are documented exceptions. This pass does not silently redesign them.

## Owner choice

- **A — Open rim:** open score typography and one Build launcher. Costs and availability open in a sheet.
- **B — Sea shelf:** one continuous cool shelf with visible build choices and availability.

Recommend A for the closest fit to Offsuit’s restraint. Building takes an extra tap.
B favours direct access and presents more information at rest. Both remain unapproved.

Both use the exact same island pixels. The reserved board rectangle stays fixed.

## Ranked audit

### 1. Sameness — High

Seats, instructions, actions, event lines and overlays repeat filled rounded surfaces at similar weight. The build tiles sit inside another filled container. Fortune cards add another layer inside their sheet.

**Offsuit principle, applied here:** Use one flat surface and let the game content carry the colour. Remove containers before adding styling.

**Defined change:** A removes individual seat cards and replaces the build cluster with one launcher. B uses one continuous cool shelf with direct actions. Both use flat sheets and no cream in proposed chrome.

**Scope:** #903. The approved goods hand and pending chat C remain fixed dependencies.

**Evidence:** [390x844-main.png](evidence/current/390x844-main.png), [844x390-main.png](evidence/current/844x390-main.png), [1280x720-main.png](evidence/current/1280x720-main.png), [390x844-fortunes.png](evidence/current/390x844-fortunes.png)

**Source:** `src/styles.css:25–40,160–170,193–221; src/components/game/FortuneTray.tsx:129.`

### 2. Scale — High

Build shortfall counts are 9 px; the deck label and readiness glyph are 10 px; landscape build names are 10.5 px. Trade uses 10–11 px labels and results headings use 11 px. Main controls meet 44 px at all three sizes. Five desktop discard inputs measure 48 × 36 px. The bank/dock action in your landscape player menu shrinks to 270 × 20 px.

**Offsuit principle, applied here:** Show fewer, more readable quantities and large plain actions. A readable control footprint must include its label, not just a large hit area.

**Defined change:** Use a 12 px floor for all new text, 14–16 px action names, and 44 × 44 px minimum targets. Show shortfalls in a legible line. Keep approved hand labels as a flagged phase-boundary exception.

**Scope:** Core #903. Route trade to #831, compact results to #748, and the fixed landscape hand to #774. #909's loss-tab fix is already landed.

**Evidence:** [390x844-disabled-build.png](evidence/current/390x844-disabled-build.png), [844x390-disabled-build.png](evidence/current/844x390-disabled-build.png), [1280x720-discard.png](evidence/current/1280x720-discard.png), [844x390-trade.png](evidence/current/844x390-trade.png), [390x844-results.png](evidence/current/390x844-results.png), [supplement/844x390-own-player-menu.png](evidence/current-supplement/844x390-own-player-menu.png)

**Source:** `BuildCost.tsx:60; Hud.tsx:119,452; styles.css:277–278; DiscardBar.tsx:44; trade-panel.css:12,69–74; WinScreen.tsx:112.`

### 3. Weak hierarchy — High

Phone names become Jar / Luc / Ale / J2. Even Jarrod truncates on desktop because score and counts share its first line. The latest-event area shrinks to 67.78 px in portrait and 27.5 px in landscape. Portrait results initially hide the Total column; horizontal scrolling is required. The existing turn cue is present but small.

**Offsuit principle, applied here:** Give the current player and primary number clear priority. Let a deliberate detail view carry secondary information.

**Defined change:** Give names their own line and public scores a stable column. Distinguish the active seat with a static marker and a text cue. Keep a readable latest event and put history/My numbers behind disclosure. Preserve compact result summaries under #748.

**Scope:** #903 seats and event hierarchy. Result totals are already tracked by #748; #878's short headings landed but do not solve this long-name fixture. Turn/gain behaviour remains #531/#827.

**Evidence:** [390x844-main.png](evidence/current/390x844-main.png), [844x390-main.png](evidence/current/844x390-main.png), [1280x720-main.png](evidence/current/1280x720-main.png), [390x844-results.png](evidence/current/390x844-results.png), [844x390-fortunes.png](evidence/current/844x390-fortunes.png)

**Source:** `SeatRail.tsx:72,82,105–122,150,170; styles.css:195,200; Hud.tsx:498–512; MyNumbers.tsx:53; WinScreen.tsx:112.`

### 4. Clutter — Medium

The persistent hidden-points warning and Build/trade/end instruction restate available knowledge. The deck count appears on the Fortune tile and again in the event row. Player detail repeats points in facts and the score ledger. In hotseat trade, a helper describes player trading while only Bank is offered.

**Offsuit principle, applied here:** Hide evergreen explanation until requested. One visible location per piece of information; one clear next action.

**Defined change:** Move hidden-score explanation to player detail. Use one public deck count, available off turn and with no fortunes held. Keep disabled reasons and prices deliberately accessible. Show trade copy only for the current route.

**Scope:** #903 chrome. Preserve the landed #776 My fortunes behaviour. Trade flow stays with #831; help is #749.

**Evidence:** [390x844-main.png](evidence/current/390x844-main.png), [844x390-main.png](evidence/current/844x390-main.png), [1280x720-main.png](evidence/current/1280x720-main.png), [1280x720-player-menu.png](evidence/current/1280x720-player-menu.png), [390x844-trade.png](evidence/current/390x844-trade.png)

**Source:** `SeatRail.tsx:21–23,177; Hud.tsx:65,310,452,512; PlayerMenu.tsx:86–90,135–144; TradePanel.tsx:141,161.`

### 5. Inconsistency — Medium

Stronghold becomes Upgrade on phones, Build a stronghold when armed, and Raise a stronghold in the keyboard list. Sheet titles and corner radii vary. Player detail uses a blurred surface while help and costs use opaque sheets.

**Offsuit principle, applied here:** One vocabulary and one deliberate surface system. Make the action sound like the result it produces.

**Defined change:** Use Upgrade consistently for the short action, with stronghold named in its detail and armed instruction. Share title, sheet, spacing and control tokens across approved builders. Keep Route/Swords and resource symbols unchanged.

**Scope:** #903 specification. Existing fortunes, help, trade and results implementation issues retain their approved flows.

**Evidence:** [390x844-main.png](evidence/current/390x844-main.png), [844x390-main.png](evidence/current/844x390-main.png), [1280x720-main.png](evidence/current/1280x720-main.png), [1280x720-player-menu.png](evidence/current/1280x720-player-menu.png), [390x844-help.png](evidence/current/390x844-help.png)

**Source:** `Hud.tsx:100–101,447; PlaceList.tsx:92; HowTo.tsx:55; CostCard.tsx:55; PlayerMenu.tsx:101.`

### 6. Misalignment — Medium

Landscape reserves a large filled area below the build controls while dice and End turn sit at opposite ends of a footer. This is a composition problem, not a claim that current controls overlap. The landed portrait utility alignment fix is retained.

**Offsuit principle, applied here:** Use clear row roles and shared baselines. Empty space can stay empty without a panel around it.

**Defined change:** A leaves unused action space open. B groups direct builds and secondary actions on an intentional shelf grid. Preserve the exact playing hole through setup, roll, main, robber and discard; no phase-by-phase refit.

**Scope:** #903 layout. Do not move the goods hand or adopt #774's unmerged right-rail plan.

**Evidence:** [390x844-main.png](evidence/current/390x844-main.png), [844x390-main.png](evidence/current/844x390-main.png), [1280x720-main.png](evidence/current/1280x720-main.png)

**Source:** `Hud.tsx:263–284,375–379,514; styles.css:254,273–278; src/lib/scene/mobile-fit.ts:84–100.`

### 7. Generic decoration — Low–medium

Player detail blurs the terrain and nests a rounded score card. Shadow treatments vary among menus and sheets. Functional overflow fades, readiness cues and roll feedback do communicate state. Seat tallies already use lucide Route/Swords; there is no visible tally-emoji defect.

**Offsuit principle, applied here:** One flat overlay with depth only where it explains the layer. Personality comes from the island and players.

**Defined change:** Remove nested score cards, decorative blur and gratuitous gradients/glows/shadows. Preserve purposeful feedback and reduced-motion information. Add no emoji outside the approved chat reactions.

**Scope:** #903 visual specification. Chat C and functional turn/gain behaviour remain fixed.

**Evidence:** [390x844-player-menu.png](evidence/current/390x844-player-menu.png), [844x390-player-menu.png](evidence/current/844x390-player-menu.png), [1280x720-player-menu.png](evidence/current/1280x720-player-menu.png)

**Source:** `PlayerMenu.tsx:101,135; TableMenu.tsx:120; FortuneTray.tsx:129; CostCard.tsx:52; SeatRail.tsx:11,121–122.`

## Overlay coverage

| Overlay | Observed result | Routing |
|---|---|---|
| Own player detail | Landscape bank/dock action compresses to 270×20 px. Desktop fortune values wrap in a narrow column. | #903 |
| Other player detail | Full identity appears in detail. Public score remains distinct from private totals. | Preserve |
| Table menu | Controls meet 44 px in the measured fixture. Landscape Leave requires scrolling. | #903 sheet treatment |
| Costs | Content and 44 px controls fit all three sizes. | Preserve prices and rules |
| Help | Readable 14 px body. Landscape lower rules require scrolling with a weak cue. | #749 |
| Trade | 10–11 px metadata. Hotseat helper mentions player trades despite Bank-only actions. Landscape Get controls require scrolling. | #831 |
| Fortunes | Nested surfaces; landscape Points row starts below the fold with a weak cue. | #829; preserve landed #776 |
| Discard | Desktop five inputs48×36 px. Phone fields meet 44 px. | #903 audit |
| Robber and victim | Clear current instruction and selectable victim controls in tested fixture. | Preserve |
| Incoming offer | Yes/No controls meet 44 px. Timer and goods remain explicit. | Preserve #831 contracts |
| Error/reconnect | Visible message; rendering fixture does not prove network recovery. | Preserve |
| Results | Valid 10-point winner. Portrait333 px table inside324 px viewport hides totals initially. | #748; #878 already landed |
| Roll-off, setup, coaching | Renderer captures and keyboard placement exercised; retain immediate phase instruction. | Preserve |

## Measurement record

Every measured sub-12 px text node and sub-44 px control appears in per-state JSON.
The inventory includes CSS-visible content behind overlays; it is not a count of unique defects.

Main under-12 text nodes: portrait12, landscape11, desktop7. Main targets under44: zero at all three sizes.

Observed undersize controls: one landscape bank/dock menu action270×20 px and five desktop discard inputs48×36 px.
The focused placement list measured above44 px in this fixture. A source32 px minimum alone is not a failed rendered target.

| Text | Size | Boundary |
|---|---:|---|
| Build deficit quantity | 9 px | Core HUD |
| Readiness glyph and deck label | 10 px | Core HUD |
| Landscape build labels | 10.5 px | Core HUD |
| Portrait goods labels | 10 px | Fixed approved hand |
| Trade owned counts | 11 px;10 px landscape | #831 |
| Landscape trade names, route and helper | 11 px | #831 |
| Result column labels | 11 px | #748 |
| Landscape result equation | 11 px | #748 |

Dice, tally icons, cost symbols and My numbers list items are not tap controls.
The board is a canvas; no CSS-font assertion is made about projected token numerals.

## Evidence and design records

- `design-spec.md`: component responsibilities, geometry, behaviour contracts, and builder acceptance checks.
- `source-audit.md` and `overlay-audit.md`: independent source and visual findings.
- `evidence/audit-rollup.json`: deduplicated text and target inventory.
- `evidence/png-manifest.json`: capture dimensions and SHA256 hashes.
- `evidence/current/capture-log.json`: core state and interaction coverage.
- `evidence/current-supplement/supplement-log.json`: own-player, keyboard and rate-detail checks.
- `mocks/`:16 static visual proposals and the manifest.
- `mock-qa.json`, `pixel-qa.json`, `QA.md`: artifact verification and its limits.

## References

Offsuit alternatives are design inferences, informed by the owner’s supplied App Store screenshots.
[Offsuit App Store](https://apps.apple.com/us/app/offsuit-texas-holdem-poker/id6446099491).
[Issue903, latest direction](https://github.com/jarrodjohnson-gif/emberisle/issues/903).

Read `docs/DECISIONS.md`, `docs/design/polish.md`, `ux-review-2026-10.md`, and `jelly-ocean.md` with the later no-cream override.

## Approval boundary

Jarrod chooses a direction before builders receive implementation issues. These are design and architecture proposals.
The desk can turn approved components into scoped build issues. This packet creates no runtime change.
Phase 2 checks the selected HUD with merged Chat C: open tabs, seat bubbles, keyboard, safe areas, rotation and focus.
No chat restyling or board refit is authorized by these mocks.
