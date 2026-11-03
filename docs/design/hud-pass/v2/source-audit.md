# #903 source audit reconciled to current main 51cbe38

Source root: `/Users/jarrod.johnson/Documents/Codex/2026-10-20/resume-emberisle-903-from-the-paused/work/emberisle-current`. This supersedes source facts in `source-audit.md`. Read-only review; no source changes, browser control, issue posts, commits or pushes. All Offsuit alternatives below are **our inference**.

## Changes since the paused checkpoint

* #773 goods V1 and #909 are landed. Portrait goods names are now 10px, desktop 12px; gain/loss tabs are 14px. Old 11/10px gain badges and centre-screen GainFloats are gone. #909's −1 tab problem is fixed and must not be re-raised.
* #776 is landed: the hand control is **My fortunes · N**, only while held/armed (`Hud.tsx:166–174,218–239`); deck count is now on the Fortune buy tile at **10px** (`:452`) and as **Deck N** on the log row (`:512`). The old Fortune/Fortunes ambiguity has been addressed. Preserve this distinction in both directions.
* `styles.css:254` now aligns utility actions to flex-start, so the old portrait “Trade at left / Fortunes at far right” finding is stale. Landscape Trade shares the upper utility row when My fortunes exists, otherwise it is in the footer (`Hud.tsx:278–280,471–475`).
* #899 chat C remains pending. Approved hand V1 and chat C are fixed. The hand is a landed input; phase 2 reconciles the new HUD with chat when #899 lands. #773 is no longer a future prerequisite.

## Seven checklist categories, ranked

| Rank | Category | Severity | Current source fact / design finding | What Offsuit would do instead (inference) |
|---|---|---|---|---|
| 1 | **Sameness** | High | **No cream fails systematically:** `styles.css:25–40,160–170` makes surface, glass, table and paper cream. Seats, instruction, log and actions use those tokens (`:193–221`). Build tiles still sit inside a rounded filled surround (`:209–211`). This is a structural hierarchy issue as well as a palette issue. | One cool opaque neutral surface; unboxed supporting information; few large plain controls; strong fill reserved for the immediate action. Remove nested surfaces instead of merely recolouring both. Do not restyle approved goods/chat as part of phase 1. |
| 2 | **Scale** | High | Build deficit quantity is 9px (`BuildCost.tsx:60`), ready check 10px (`Hud.tsx:119`), Fortune remaining count 10px (`:452`), landscape build names 10.5px (`styles.css:278`). Main controls themselves are 44/52px: `ui/button.tsx:15–19`, `SeatRail.tsx:150`, `Hud.tsx:427`. Actual source exception: desktop discard fields 36px (`DiscardBar.tsx:44`). Complete inventory below. | Readable action names and quantities, 12px absolute text floor and larger action labels; at least 44px targets. Give the shortfall a legible line/count instead of packing a tiny badge onto a tiny chip. |
| 3 | **Weak hierarchy** | High | Public points are already 20px and 750 weight (`SeatRail.tsx:105–115`; `styles.css:116–119,201`). Desktop first lines still pack name, goods, fortunes and score into a 192px rail (`SeatRail.tsx:82,101–110,170`). Active seat already has a 2px bottom rule and static 2px dot ring (`styles.css:195,200`), so report it as weak, not absent. Main instruction is broad (`Hud.tsx:65`); latest-event line shares only 20px height with My numbers and now Deck N (`:498–512`; `MyNumbers.tsx:53`). | Give active seat and score clear visual priority, move secondary counts off the crowded first line, and make the immediate verb the primary action. Allow latest event enough legible room without adding another persistent helper card. |
| 4 | **Clutter** | Medium | Always-on **Hidden fortunes may add points.** (`SeatRail.tsx:21–23,177`; `Hud.tsx:310`) repeats a rule. **Build, trade, or end your turn** repeats visible controls (`Hud.tsx:65`). Menu repeats points in facts and ledger (`PlayerMenu.tsx:86–90,135–144`). Deck remaining appears in the buy tile and log during main (`Hud.tsx:452,512`); this is public data with legitimate off-turn access, so consolidate placement rather than remove availability. Costs/help both repeat build/points rules (`HowTo.tsx:61–64`; `CostCard.tsx:70–93`). | Evergreen rules live in deliberate help/details. One compact score ledger, no inner score card. One public location for deck count that remains visible off turn and with an empty hand. Delete repetitive helper copy before deleting useful costs or disabled reasons. |
| 5 | **Inconsistency** | Medium | Same action is Stronghold desktop / Upgrade phone (`Hud.tsx:447`), Build a stronghold when armed (`:100–101`), Raise a stronghold in legal-placement keyboard list (`PlaceList.tsx:92`). How to play title is 24px (`HowTo.tsx:55`) versus Costs 20px (`CostCard.tsx:55`). Player menu is blurred translucent white (`PlayerMenu.tsx:101`), help/costs opaque, with disparate 8/12/16/20/24px corner families. | One title/control vocabulary and type scale, one flat sheet treatment. Plain **Upgrade** may be concise, but resulting stronghold language stays unambiguous. Keep approved Route/Swords SVGs and resource symbols. |
| 6 | **Misalignment** | Medium | Fixed rules split portrait action rows at 400px when fortunes are held (`styles.css:273–276`) and place landscape End turn/dice in a sticky footer (`Hud.tsx:263–284,514`). Fresh 390×844 confirms Trade/My fortunes are now correctly grouped left; the second row still occupies the lower left of a large filled surround. Fresh 844×390 shows a long empty middle between dice and End turn in the footer, and unused filled space under the upper actions. These are composition weaknesses, not failed click targets. | Stable row roles, shared baselines and edge alignment; a deliberate column footprint without a filled empty box. Keep the board's declared playing hole stable across phases. |
| 7 | **Generic decoration** | Low–medium | Player menu blur and inner score card (`PlayerMenu.tsx:101,135`) add effects without clarifying the ledger. Custom shadows vary (`TableMenu.tsx:120`; `FortuneTray.tsx:129`; `CostCard.tsx:52`). Rendered tallies use lucide Route/Swords (`SeatRail.tsx:11,121–122`); emoji in `:7` is only an obsolete comment. Overflow fade (`Hud.tsx:539–543`), build readiness (`styles.css:87–90`) and rolled-number flash (`:312–320`) have a real function. | Flat opaque overlay, minimal edge, consistent restrained depth only to explain an overlay. Keep functional feedback. No new emoji outside approved reactions. |

Fresh 51cbe38 main screenshots inspected at `docs/design/hud-pass/v2/evidence/current/1280x720-main.png`, `390x844-main.png`, `844x390-main.png`; use these three for Sameness, Scale, Weak hierarchy, Clutter, Inconsistency and Misalignment. Only Jarrod's name truncates in fresh desktop main; the other three names fit. Fresh coherent fixture has path length5/holder, public4+private2=6 and army3/holder, fixing the old synthetic incoherence. Player-menu captures at the same three sizes support Generic decoration. Paused settled screenshots remain historical evidence only.

The fresh companion JSON confirms no sub-44 main targets at any size. Its log container is 413.38px desktop, **67.78px portrait**, **27.5px landscape**, while Deck N consumes63.31px at every size. This directly verifies the current event-hierarchy problem. Fresh desktop discard JSON confirms all five input targets are **48×36px**; phone discard lists no sub-44 targets.

## Every source-declared <12px instance in the captured HUD/overlays

| Text | Current source and declared size | Route / scope |
|---|---|---|
| Build deficit badge | `BuildCost.tsx:60`, 9px | #903 |
| Build ready check glyph | `Hud.tsx:119`, 10px | #903; record under strict scale checklist though glyph is not a prose label |
| Fortune tile deck remaining | `Hud.tsx:452`, 10px | #903 audit, landed #776 behaviour |
| Short-screen build names | `styles.css:277–278`, 10.5px | #903 |
| Portrait goods name | `hand-motion.css:22`, 10px; desktop override 12px at `:38`; hidden in short view at `:46` | Approved #773 V1. Record exception, do not redesign hand |
| Trade owned count | `trade-panel.css:12`, 11px; short override 10px at `:70` | #831 |
| Short trade resource name, route labels, exact preview | `trade-panel.css:69,73–74`, 11px | #831 |
| Results column headings | `WinScreen.tsx:112`, 11px | #748/#878, accepted short names stay |
| Short results contribution equation | `styles.css:246–248`, 11px | #748/#878 |

Caption is 12px (`styles.css:110–112`), so Route/Swords tallies and short names (`SeatRail.tsx:86,120`) are **not** sub-12 typography. V1 gain/loss tabs are 14px (`hand-motion.css:82`), so the old 11/10px gain finding is fixed. Cost symbols are now 9px (`styles.css:287`), an icon measurement rather than text/target size.

Canvas numeral note, outside the DOM inventory: `mobile-fit.ts:164–168` still documents an 11px board numeral floor and `docs/design/tokens.md:124` describes a 11.4px sideways-phone diorama case. Those are perspective-projected glyph heights, not CSS font sizes. New captures/renderer measurement are needed to claim an actual under-12 result. Do not infer it from canvas texture font sizes.

## Targets under 44px: exact source exceptions / exclusions

* **Confirmed declared exception:** desktop discard number inputs 36px (`DiscardBar.tsx:44`); phone inputs 44px.
* **Needs focused-state DOM measurement:** legal-placement list uses `h-auto min-h-8` (`PlaceList.tsx:156`), allowing a 32px short item. This is focus-revealed (`:145`), not normally visible.
* **Needs DOM measurement, approved chat scope:** closed chat preview native button lacks 44px minimum (`Chat.tsx:384`). #899 owns it; do not create competing chat work.
* Adjacent lobby-only note, not in settled HUD capture scope: compact rename input is 28px (`Lobby.tsx:56`); compact name button has no min height (`:35`).
* Do **not** count dice (36px /24px landscape), 20px My numbers list items, cost chips, tally icons or ready glyph as sub-44 targets: they are readouts/decorations. Main action buttons default 44px; builds are 52px high; seats 44px high. A small symbol is not automatically a small hit area.

## Semantics and behaviour both directions must preserve

1. **Public score and local private total are different.** `SeatRail.tsx:72,110–115` uses public score as hero and local hidden +N as secondary; on strip +N is visual sr-only. `PlayerMenu.tsx:141–144` exposes private total only to its owner, or after game over. `rules.ts:238–257` encodes that boundary. Fixture 4 public +2 private is total 6; do not reveal opponents' hidden total or relabel 4 as an incorrect score.
2. **Route/Swords show actual tallies.** `SeatRail.tsx:76,120–122` shows longest continuous path length and wayfarers played; holder treatment at `:48–58` is distinct. Rules thresholds/ties live at `rules.ts:212–235`; each award adds **2** points at `:240–257`, not the tally count. A path-holder badge next to length 1 in the synthetic fixture is not rules evidence.
3. **Keep disabled builds and costs inspectable.** `Hud.tsx:113–115,430–443` intentionally uses aria-disabled focusable controls, refusal hints, explicit missing/No spot/None left reasons (`:40–47,413–451`). Hiding unavailable builds loses future price comparison and reasons. A direction that collapses prices must provide deliberate legible disclosure with a 44px target.
4. **Keep fixed phase geometry.** Landscape column is full height (`Hud.tsx:375–379`), End turn pinned (`:263–284,514`), playing-hole footprint declared (`mobile-fit.ts:84–100`). Shorter setup/roll/discard/wait content must not re-fit or move the board phase by phase. Preserve V1 fixed hand size and current My fortunes held/armed visibility/focus return (`Hud.tsx:166–175`).
5. **Keep placement/modal behaviour.** Armed instruction/cancel (`Hud.tsx:244–257`), touch Place/Cancel (`PlaceChip.tsx:32–41`), keyboard legal list, focus traps/return, viewport-bounded scrollable sheets stay. Rest-state pictures alone do not validate these.
6. **Keep functional temporal feedback.** Current turn moment waits for roll only, 1800ms, ends on input (`TurnMoment.tsx:14,24,41–47,51–61`). Gains now live on V1 hand for 2200ms plus 300ms fade (`Hand.tsx:21–26`; `hand-motion.css:59–67`), not centred gain floats. Preserve motion-reduced information and privacy.

## Existing issue routing / avoid duplicates

#903 owns no-cream seats/build bar/menus direction. Cross-reference #831 trade, #829 playable fortune, #748/#878 results, #749 help, #531 turn, #827 gains, #774 landscape hand. #776, #773 and #909 are landed behaviour, not outstanding prerequisites. Chat C #899 remains the phase-2 dependency. No emoji outside the approved reaction system.
