# Emberisle design laws v1 (draft, 2026-10-23)

Fourteen laws for every builder and reviewer. Owner decisions (`docs/DECISIONS.md`) beat any outside guideline; where they differ, the law says so. Tags: **O** owner, **H** HIG, **O+H** both. Every HIG claim was verified on the page named in Sources. Numbers are CSS px at 390x844 and 844x390.

## Layout and stability

**1. One stationary box (O+H).** The dock is one fixed-size box per orientation; its height and the hand row's top edge never change between turn states. Only the words and controls inside change.
Why: #971 measured the card row moving 170 px portrait, 198 landscape (122/150 from the offer card alone); owner: "everything just stays put"; HIG Layout.
Check: a proof cycles every turn state at both sizes; hand-row y and dock height identical.
Not required: equal height in both orientations.

**2. Fixed slots; nothing appears or disappears (O).** Every element that can come and go (dice, Fortunes, End turn, offer line, payout chips, log, deck, turn line) owns a slot of fixed size and position. Absent means greyed or empty, never collapsed.
Why: DECISIONS 2026-10-22: Fortunes "always one fixed spot and one label"; the offer is one line plus Yes/No.
Check: Fortunes box same x, y, width whenever shown; fixed-height turn line; no row moves a sibling.
Not required: dice or Roll on another seat's turn (owner: never).

**3. The island never shrinks below its share (O).** The island keeps at least 60 % of viewport height in portrait (proposed; owner confirms) and full height beside a column no wider than 42 % in landscape. Dock content never changes the fit.
Why: owner: "the map got small"; polish.md principle 1.
Check: `__isle.fit` unchanged across states; share logged.
Not required: the same share on desktop.

**4. Safe areas and one spacing scale (O+H).** Controls stay inside the safe area; gutter 16 px on phones, 24 from 1024 px; spacing 4, 8, 12, 16, 24, 32, 48 only.
Why: HIG Layout; polish.md "Spacing".
Check: `hud-safe-area-prove` green; no off-scale value in new CSS.
Not required: a visible frame.

## Touch and reach

**5. Actions live in the bottom third (O).** Everything pressed on your turn (Roll, builds, Trade, Fortunes, End turn, Yes/No) sits in the lower third of a phone viewport; reading goes up top.
Why: owner: "where the thumb is". HIG Layout prefers top-leading for reading; the owner wins.
Check: action tops at or below y 563 portrait; y 260 or the column's lower half landscape.
Not required: menu, seats or chat at the bottom.

**6. 44 px targets, 8 px apart (H).** Every interactive element is at least 44x44 CSS px with 8 px to its neighbours; Trade and End turn are never adjacent.
Why: HIG Buttons, Games and Design Tips: at least 44x44 pt; HIG Accessibility: spacing matters as much as size. Android: 48 dp, 8 dp gaps; WCAG 2.5.8 floor 24 px.
Check: the proof lists every visible interactive box; fail under 44 or gap under 8. Dice faces are not targets.
Not required: 48 px; a drawn 44 px box.

**7. Tap, then confirm, on the board (O+H).** Placing on a coarse pointer is tap to select, tap to commit, with a 44 px Place chip; no legal spot sits under the dock.
Why: HIG Gestures: show when a gesture is unavailable; #129.
Check: zero legal corners under dock elements at both sizes.
Not required: drag-to-place.

## Hierarchy and clarity

**8. One primary per screen state (O+H).** Exactly one filled primary button is visible (Roll, Play, Start, Yes, or End turn once nothing is affordable).
Why: polish.md principle 3; HIG Buttons: a prominent style for the likeliest action, never destructive; owner is stricter than HIG's "one or two".
Check: visible `variant=primary` count is 1 on your turn, 0 otherwise.
Not required: full width on desktop.

**9. Numbers big, sentences short, one voice (O+H).** Five sizes only (12/15/20/28/56 px), counts `tabular-nums`, one sentence in one place says what to do now, no uppercase-tracked labels, 12 px only for meta.
Why: polish.md "Type"; HIG Typography and Design Tips: 11 pt minimum, no light weights, few typefaces.
Check: no size outside the tokens; one `turn-banner` per state.
Not required: Dynamic Type on the web.

**10. Sheets for depth, never stacked (H).** Anything beyond the next action (long offer terms, fortune tray, costs, breakdowns) is one sheet with a visible Close; a second waits for the first.
Why: HIG Modality: obvious dismiss, never one modal over another; DECISIONS 2026-10-22.
Check: at most one open dialog; Close on screen at three viewports.
Not required: a sheet for the offer line (law 2).

## Feedback and motion

**11. Motion is brief, on transform and opacity, and never stops the player (O+H).** polish.md durations (80 to 320 ms; roll moment 900; one looping pulse). Never animate layout. Over 320 ms is skippable by a tap; no animation delays an intent.
Why: HIG Motion: brief, precise, cancellable.
Check: no transition on height, top or margin; End turn tapped mid-roll-moment reaches the host within 150 ms.
Not required: haptics.

**12. Gains and losses show on every turn, yours or not (O+H).** The +N/-N rise (green gain, red loss) plays whenever the hand changes, including on another seat's turn; sign and number, never colour alone.
Why: owner: animations "still show when it isn't your turn"; HIG Feedback; HIG Color: more than colour.
Check: a bot roll that pays you fires the flash once.
Not required: a toast per gain.

## Accessibility

**13. Contrast and reduced motion are gates (H).** Text 4.5:1 (3:1 at 24 px or 18.5 bold), non-text edges 3:1, glass sampled over the real board. Under `prefers-reduced-motion` CSS collapses, three.js loops hold still, gains show as a static chip.
Why: HIG Accessibility uses WCAG AA values and names Reduce Motion; WCAG 1.4.3, 1.4.11, 2.3.3.
Check: `contrast-prove` green including new chips; a reduced-motion run loses no information.
Not required: a dark theme (owner 2026-10-04 says none; HIG Color asks for one; owner wins).

## Consistency and naming

**14. One name, one colour, one place (O+H).** Each good, piece and fortune has one name (README "Names"), one colour and one icon everywhere; seat colour only on the dot, pieces and legal pulse; chrome is stone, glass and ink; labels are verb plus amount.
Why: polish.md principle 5; HIG Color: one colour, one meaning; HIG Buttons: verb labels.
Check: new strings match the Names list; no new colour token or surface.
Not required: icons on every button.

## Adding something new

A new element or feature (mini-games hub, profile or sound panel) answers these in its issue first:

- **Home.** Which journey (title, lobby, table, results) and which existing slot or sheet. It never makes a slot appear, disappear or resize (laws 1, 2).
- **Optional.** Never a requirement for practice, hosting or joining; mini-games are optional while waiting (owner).
- **Space.** At most one slot in portrait and in short landscape, none of the island's share (law 3); larger means a sheet (law 10).
- **Quiet state.** With nothing to say it shows a greyed slot, never a gap.
- **Exit.** How it closes, with nothing else moving.
- **Proof.** One proof checks its slot, targets and contrast, registered in `package.json` and `ci.yml`.
- **Mock first.** The owner approves a mock placed beside the current screen before building (DECISIONS 2026-10-21, 2026-10-22).

## What we never do

No dock shift (1). No element without a slot (2). No camera refit caused by chrome (3). No target under 44 px, no destructive primary (6, 8). No stacked sheets, no modal for a gain (10, 12). No layout animation, no unskippable motion over 320 ms, no shake, no confetti (11). No colour-only information, no text under 12 px, no uppercase labels (9, 12). No dark theme, no cream, no third surface (owner). No feature that practice, hosting or joining depends on.

## Sources

HIG (read via Apple's page-data endpoint, 2026-10-23): [Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Motion](https://developer.apple.com/design/human-interface-guidelines/motion), [Typography](https://developer.apple.com/design/human-interface-guidelines/typography), [Color](https://developer.apple.com/design/human-interface-guidelines/color), [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback), [Modality](https://developer.apple.com/design/human-interface-guidelines/modality), [Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures), [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons), [Designing for games](https://developer.apple.com/design/human-interface-guidelines/designing-for-games), [Design Tips](https://developer.apple.com/design/tips/). [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [WCAG 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html), [Android touch targets](https://support.google.com/accessibility/android/answer/7101858). Repo: `docs/design/polish.md`, `docs/DECISIONS.md`, `docs/research/mobile-ux-benchmark.md`, issue #971, `src/components/game/Hud.tsx`.
