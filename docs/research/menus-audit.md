# Menus audit

Research for [#670](https://github.com/jarrodjohnson-gif/emberisle/issues/670), 2026-10-17.

The menus already belong to Emberisle's cream-and-teal palette. They need a coherent finish, not a new visual theme.
The clearest gaps are glass in the player menu, repetitive trade controls, and concealed phone score columns.
The title has a wordmark, working entry paths, and restrained copy. A custom drawn mark remains an optional identity improvement.

## Evidence and limits

- Inspected checkout `f3a4040` and the issue's full body and comments.
- Captured touch-enabled Chromium viewports at exactly **440×956** and **956×440**, with device scale factor 1.
- Used `/usr/bin/chromium`, version **154.0.8037.57**, with SwiftShader.
- These are Chromium observations. **Safari, iOS, physical devices, notches, and the software keyboard were not tested.**
- The GPU fallback selected Simple water. Do not judge the approved Crystal water from these captures.
- Tested the real title, Host, Join, lobby, practice, hotseat, and chat entry controls.
- Injected main-phase goods and fortunes through the development store for repeatable menu inspection.
- Injected a completed hotseat state for the win screen. This was not a naturally completed game.
- Reviewed all twelve JPEGs and the supporting flow PNGs visually, alongside source. No application code changed.
- Final capture produced **30 PNGs** and **12 quality-75 JPEGs**. JPEGs occupy approximately **504 KiB**.
- The capture reported **zero page exceptions**. Sound toggling stored `emberisle-muted=1` at both viewport sizes.
- A supplemental same-flow run collected console errors and page exceptions: **zero of either**, across both sizes.
- `git diff --check` passed. All **46 local links** resolve to existing files; all twelve JPEGs exist.

The twelve JPEGs below accompany this research for review. The full PNG corpus and capture report remain ignored local artifacts.
Their directory is `test-results/670-audit/`; they are not repository links or portable evidence.

| Surface | Portrait | Landscape |
|---|---|---|
| Title | [440×956](menus-audit/440x956-title.jpg) | [956×440](menus-audit/956x440-title.jpg) |
| Table menu and settings | [440×956](menus-audit/440x956-table-settings.jpg) | [956×440](menus-audit/956x440-table-settings.jpg) |
| Player menu | [440×956](menus-audit/440x956-player-menu.jpg) | [956×440](menus-audit/956x440-player-menu.jpg) |
| Trade | [440×956](menus-audit/440x956-trade.jpg) | [956×440](menus-audit/956x440-trade.jpg) |
| Fortunes | [440×956](menus-audit/440x956-fortunes.jpg) | [956×440](menus-audit/956x440-fortunes.jpg) |
| Win | [440×956](menus-audit/440x956-win.jpg) | [956×440](menus-audit/956x440-win.jpg) |

## Which direction applies

- [Jelly Ocean](../design/jelly-ocean.md#L3) supersedes Basalt and specifies opaque cream surfaces.
- It explicitly permits system sans and rounded system numerals [at line 7](../design/jelly-ocean.md#L7).
- Shared resource SVGs and 8/12/20px radii are approved [at lines 27 and 39](../design/jelly-ocean.md#L27).
- Chat, menus, lobby, and win inherit semantic tokens and existing accessible behavior [at line 43](../design/jelly-ocean.md#L43).
- [Visual direction](../design/visual-direction.md#L217) specifies Play as the sole primary, with explicit online controls below.
- [Polish](../design/polish.md#L285) records the later Play-primary decision. Earlier Host-primary research no longer controls priority.
- [Title/lobby](../design/title-lobby.md#L40) describes an older glass treatment. It does not override Jelly Ocean.
- [Menus](../design/menus.md#L3) describes the older Unreal client. Its separate Host/Join screens are not browser requirements.
- [Browser research](title-menu.md#L29) rejects accounts, shops, mode carousels, and unnecessary entry pages.
- [UX review](../design/ux-review-2026-10.md#L68) and [visual polish](visual-polish.md#L151) record historical geometry problems, not current failures.
- The issue comment's `docs/design/direction.md` does not exist in this checkout.

“Handmade” here means specific imagery, symbols, proportions, and material consistency.
It does not require ornamental fonts, random rough edges, or a literal wooden desk.

## Coverage

| Surface or flow | Runtime observation at both sizes | Source anchor |
|---|---|---|
| Title | Cream sheet, large Emberisle wordmark, one dark Play button, island behind it. Landscape uses two columns. | [EmberisleApp](../../src/components/game/EmberisleApp.tsx#L184) |
| Host | Host a table opens the real network lobby directly. No extra setup page. | [EmberisleApp](../../src/components/game/EmberisleApp.tsx#L247) |
| Join | Entering a missing code returns an inline error. Joining a freshly hosted code reaches its roster. | [EmberisleApp](../../src/components/game/EmberisleApp.tsx#L250) |
| Practice | Play starts the four-seat practice table. “3 bots, no network” explains its meaning. | [EmberisleApp](../../src/components/game/EmberisleApp.tsx#L237) |
| Hotseat | Four seats, one table starts a shared-device table directly. | [EmberisleApp](../../src/components/game/EmberisleApp.tsx#L295) |
| Lobby | Code, Copy, Copy link, roster, chat, readiness, victory target, and Leave appear together. | [Lobby](../../src/components/game/Lobby.tsx#L118) |
| Table menu | Turn, How to play, Costs, sounds, Water, View, and Leave form a compact cream sheet. | [TableMenu](../../src/components/game/TableMenu.tsx#L119) |
| How to play | Opens from Title and closes through its visible Close button. Short prose explains rules and picking. | [HowTo](../../src/components/game/HowTo.tsx#L45) |
| Player menu | Seat facts and point breakdown appear over translucent glass. Resource-rich states expose dense wrapping. | [PlayerMenu](../../src/components/game/PlayerMenu.tsx#L102) |
| Trade | Five resource rows each contain give/want steppers. Portrait fits; landscape requires vertical scrolling. | [TradePanel](../../src/components/game/TradePanel.tsx#L105) |
| Fortune tray | Held kinds, effects, disabled reasons, and resource choices are visible. Landscape scrolls inside the narrow left column. | [FortuneTray](../../src/components/game/FortuneTray.tsx#L145) |
| Chat | Lobby embeds the composer; online play opens the separate Table chat sheet. | [Chat](../../src/components/game/Chat.tsx#L565) |
| Win | Winner and total lead. Portrait hides later scoreboard columns inside horizontal scrolling. Landscape shows them together. | [WinScreen](../../src/components/game/WinScreen.tsx#L135) |
| Settings | Your seat unfolds name/color; Wayfarer unfolds mode-specific rules. Table settings expose sound, water, and view. | [EmberisleApp](../../src/components/game/EmberisleApp.tsx#L185), [TableMenu](../../src/components/game/TableMenu.tsx#L175) |

## Ranked findings

Severity ranks player impact, not whether a screen resembles an AI template.
“Medium” deserves a focused change; “Low” is polish or an owner preference. No critical blocker was established.

| Rank | Surface | Issue | AI tell or incomplete | Severity | One-line fix |
|---|---|---|---|---|---|
| 1 | Win, portrait | Later contribution columns and Total begin offscreen without an explicit sideways cue. | Incomplete discovery; data exists in a 560px minimum-width table. | Medium | Keep totals visible and add an explicit scroll cue, or approve a compact mobile score layout. |
| 2 | Player menu | White/60 glass exposes the board behind facts while neighboring menus use cream. | Material inconsistency; strongest remaining generic glass treatment. | Medium | Use opaque paper tokens and the shared sheet boundary. |
| 3 | Trade | Twenty repeated +/- controls dominate; resource names lack the shared resource symbols. | Spreadsheet-like form rather than the game's paper goods language. | Medium | Add shared resource marks and clearer give/want grouping while preserving accessible steppers. |
| 4 | Trade, landscape | Bank action and explanation begin below the panel fold. | Incomplete action visibility, although vertical scrolling is available. | Medium | Keep the action/hint visible while the resource rows scroll. |
| 5 | How to play | A long prose block omits the setup placement order and second-outpost starting goods. | Incomplete first-game reference; not filler copy. | Medium | Add one concise setup explanation and shared cost symbols. |
| 6 | Fortune tray | Five inset white rounded cards repeat inside one cream sheet. | Closest example of identical nested rounded cards. | Low | Use paper rows with separators and a shared fortune mark. |
| 7 | Title | Wordmark is bold system text without a distinctive drawn detail. | Limited ownable identity; a wordmark already exists. | Low | Explore a small custom Emberisle letterform detail using the island's shapes. |
| 8 | Table menu/settings | Water and View pairs read as adjacent buttons without a shared segmented boundary. | Utility-list feel; selected ink fill still communicates state. | Low | Unify each pair as one clear paper control without changing options. |
| 9 | Lobby/chat | Empty chat and repeated outlined roster rows create a large form-like area. | Weak visual rhythm rather than missing functionality. | Low | Give roster and conversation distinct, quiet section treatments. |
| 10 | Shared sheets | Trade uses 28px corners; Fortunes uses 24px. Approved sheets use 20px. | Inconsistent curvature between otherwise related surfaces. | Low | Adopt the semantic sheet radius. |

Source checks: the win table declares horizontal overflow and `min-w-[560px]` in [WinScreen](../../src/components/game/WinScreen.tsx#L135).
Fortunes hardcodes 24px corners in [FortuneTray](../../src/components/game/FortuneTray.tsx#L129).
Trade declares `max-h-[85dvh]` and 28px corners in [TradePanel](../../src/components/game/TradePanel.tsx#L105).
How to play's complete copy is in [HowTo](../../src/components/game/HowTo.tsx#L60).
The player menu hardcodes glass in [PlayerMenu](../../src/components/game/PlayerMenu.tsx#L102).

## Check the issue's “AI-made” checklist

| Check | Result |
|---|---|
| Default Tailwind/shadcn appearance | Utilities are implementation details. Repeated trade steppers and fortune cards feel generic; cream/teal tokens already give coherence. |
| Gradients everywhere; purple-blue glows | Not observed on the inspected menu surfaces. Ocean shading is scenery, not menu decoration. |
| Centered stacks of identical cards | Present locally in the fortune tray, not a description of the whole title or lobby. |
| Emoji as icons | Primary menu controls use line icons; goods use SVG symbols. Chat reactions are intentional social content. |
| Generic sans font | System sans is expressly approved. Do not file its presence as a design violation. |
| Filler copy | Not observed. “3 bots, no network” is concrete. How to play needs missing setup information. |
| No logo or wordmark | False literally: Emberisle has a large wordmark. A distinctive drawn treatment remains optional. |
| No texture or illustration | False globally: the island supplies illustration. Flat opaque paper menus match approved restraint. |
| Inconsistent spacing/radii | Mostly coherent; Trade's 28px sheet is a concrete exception. |
| No press feel or sound | False for shared Button: 0.97 press scale, 80ms transition, click/back sounds exist. Audible quality was not assessed. |
| Only lists of buttons | Table menu is appropriately utilitarian. Settings, facts, resource choices, and score data prevent a global list-only diagnosis. |

The shared Button implements press and sound in [button.tsx](../../src/components/ui/button.tsx#L32).
The font and wordmark rules live in [styles.css](../../src/styles.css#L41) and [styles.css](../../src/styles.css#L249).

## Reconcile the earlier desk pass

| Earlier concern | Current conclusion |
|---|---|
| Host must be primary | Superseded by the approved Play-primary decision. Keep Host directly accessible. |
| Menus still use frosted glass | Title, lobby, and Table menu now read as cream. Player menu retains actual glass. |
| No wordmark | A large rounded wordmark exists. A custom drawn logo has not been established as required. |
| Buttons have no press/sound definition | Shared Button already defines both. Do not commission duplicate infrastructure. |
| How to play does nothing on Title | Closed by runtime observation: opens and closes at both sizes. |
| Dune dot contrast | Roster dots have a boundary. The title color picker still shows pale Dune directly on cream; contrast needs a measured follow-up. |
| Missing copy button | Closed by runtime observation: Copy and Copy link appear in the lobby. Clipboard delivery was not asserted. |
| Ready and Start have equal weight | Ready is secondary; Start uses the primary treatment when available. See Lobby's `canStart` branch. |
| In-game menus have no common direction | Jelly Ocean now names menus/chat/lobby/win explicitly. Some local styles still bypass its tokens. |

## Proposed direction

These are six bounded proposals for design review, not an implementation backlog.

1. Finish the opaque-paper material pass. Unify player menu, trade/fortune radii, and related sheet boundaries.
2. Make trade read as goods changing hands. Reuse resource marks and keep its action visible in short landscape.
3. Simplify fortunes into a paper inventory. Prefer separated rows over repeated inset cards; retain effects and disabled explanations.
4. Make phone scores explain themselves. Keep totals discoverable and preserve every contribution and hidden-point reveal.
5. Give How to play a small illustrated setup reference. Reuse cost symbols and describe second-outpost income.
6. Explore one ownable title detail. Keep the large wordmark, visible island, Play priority, and direct online entry.

Avoid ornamental texture over small text. Keep the board as the illustration and protect existing focus, touch, and safe-area behavior.

## Questions for Jarrod

- Would you prefer a custom Emberisle wordmark detail, or keep the approved system-lettered title?
- Should phone scores use compact per-player summaries, or keep a table with a clear sideways-scroll cue?
- Should How to play remain a quick reference, or include a small illustrated setup section?

These questions do not block this research. New layouts or visual identity changes need Jarrod's decision before implementation.

## Reproduction

Run from the checkout with dependencies already installed:

```bash
npm run dev
# Separate terminal:
npm run host
# Capture invocation used for this audit:
CHROMIUM_PATH=/usr/bin/chromium node /tmp/670-capture.mjs
```

The `/tmp` helper is session-local. Use the following steps to reproduce its states without depending on that file:

1. Open `http://127.0.0.1:8080/?host=ws://127.0.0.1:8787` in touch-enabled Chromium at each requested viewport.
2. Wait for terrain details to load. Capture Title, then unfold Your seat and Wayfarer.
3. Open How to play, capture it, and close it. Submit `ZZZZ` as a missing join code; capture the error.
4. Press Host a table. Capture the lobby. Open another tab, enter its code, and press Join.
5. Capture the joined roster. Press Ready in that tab and keep it connected.
6. Add two bots, press Ready, and capture the ready lobby. Press Start and open Table chat.
7. Return to Title. Press Play and capture practice; return and press Four seats, one table for hotseat.
8. Open Table menu. Capture settings and toggle sound; inspect `emberisle-muted` in local storage.
9. In hotseat, use the development-store fixture below. Wait 2800ms for gain animations to finish.
10. Open the current seat's player menu, Trade, and Fortunes separately. Capture and close each.
11. Set `phase: 'over'`, `winner: current`, and the current player's `hidden.vp: 10`; capture the win.

Main-phase fixture, evaluated in the development browser console:

```js
const g = window.__emberisle;
const s = structuredClone(g.getState().state);
s.phase = 'main';
s.dice = [3, 4];
s.playedCard = false;
const me = s.players.find(p => p.id === s.current);
me.resources = { timber: 5, clay: 5, wool: 5, grain: 5, ore: 5 };
me.hidden = { knight: 2, road: 1, plenty: 1, monopoly: 1, vp: 1 };
me.boughtThisTurn = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 };
s.seq++;
g.setState({ state: s, buildMode: 'none', error: null });
```

The fixture deliberately supplies an inventory, not a legal completed setup. “No path to lay” is expected in that fixture.
Its ten-hidden-point win demonstrates layout and reveal behavior, not a possible fortune-deck distribution.
The browser launch used `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
Expanded title settings require scrolling, especially sideways. The three-mode Wayfarer summary adds visible density even when collapsed.
This is a copy/priority consideration, not evidence of broken navigation.

Screenshot filenames identify viewport and surface; local `report.json` records browser, files, page exceptions, and sound-toggle checks.
The supplemental `/tmp/670-console.mjs` uses the same flows without screenshot writes.
Its `console-report.json` records zero console errors and page exceptions; both runs exited successfully.
