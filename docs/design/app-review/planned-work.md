# Planned work register

Every open issue in jarrodjohnson-gif/emberisle, grouped by player journey, so Astra (#903) sees all planned UX and features.
Input for Astra checkpoint 2 of #903. It lists work; it decides nothing.
As of 2026-10-21 21:40 UTC: 184 open issues, 33 open PRs, not counting #957 (read from GitHub that day).
Counts: 95 in the table, 31 older UX specs and builds, 7 Unreal-era issues, 51 not UX.
Refresh: page through `gh api "repos/jarrodjohnson-gif/emberisle/issues?state=open&per_page=100&page=N"` (drop the pull requests), list the open PRs, then update the rows.
Status and tier come from labels. Player-visible text is a one-line summary of the issue body, not a spec.

## Planned UX and features

| Issue | Title | Status | Tier | Player sees or does | Depends on |
|---|---|---|---|---|---|
| **Entry, title and help** | | | | | |
| [#466](https://github.com/jarrodjohnson-gif/emberisle/issues/466) | Personal invites: pre-built player profiles, invite codes, walk-in intros and Easter eggs | in-review | 1 | Pre-built player profiles, invite codes, walk-in intros, Easter eggs (idea; needs design). | - |
| [#749](https://github.com/jarrodjohnson-gif/emberisle/issues/749) | Implement an illustrated setup reference in How to play | in-review | 3 | How to play gets a short illustrated setup section. | #670 audit |
| [#778](https://github.com/jarrodjohnson-gif/emberisle/issues/778) | Design the cinematic game-night invite: fog, real board reveal, profile setup and lobby music (Design) | claimed | 1 | Cinematic invite page: fog, board reveal, profile setup, lobby music (design doc only). | - |
| **Profile and identity (profiles, Wins, history, PINs)** | | | | | |
| [#763](https://github.com/jarrodjohnson-gif/emberisle/issues/763) | Implement profile text edits, PIN changes and local PIN reset | claimed | 1 | Edit profile text and change PIN; local PIN reset. | #762 |
| [#764](https://github.com/jarrodjohnson-gif/emberisle/issues/764) | Implement authenticated profile attachment and frozen seat attribution | paused | 1 | Host and join attach a verified profile; seats show who you are. | #762 |
| [#766](https://github.com/jarrodjohnson-gif/emberisle/issues/766) | Implement title and lobby profile forms with host-scoped sessions | todo | 2 | Title and lobby get profile create, login, resume and PIN forms. | #762, #763, #764 |
| [#767](https://github.com/jarrodjohnson-gif/emberisle/issues/767) | Implement profile Wins, private history and completed-game counters | backlog | 2 | Wins sheet, private history, games/wins/losses counters. | #766 |
| [#768](https://github.com/jarrodjohnson-gif/emberisle/issues/768) | Research personal profile media wiring and mixer integration | backlog | 1 | Profile media (walk-in clips) plays through the sound mixer (research). | #678, #719 |
| **Lobby, hosting, joining and watching** | | | | | |
| [#690](https://github.com/jarrodjohnson-gif/emberisle/issues/690) | Waiting Room Idea Brain Dump | backlog | 3 | Waiting-room ideas list: less friction and downtime while the table fills. | - |
| [#746](https://github.com/jarrodjohnson-gif/emberisle/issues/746) | Implement a permanent game-night address with a named Cloudflare tunnel | in-review | 1 | Same permanent game-night address every night (named tunnel). | - |
| [#833](https://github.com/jarrodjohnson-gif/emberisle/issues/833) | Open table: anyone with the link can join without typing a code | in-review | 1 | Open table: join from the title by link with no code. | - |
| [#944](https://github.com/jarrodjohnson-gif/emberisle/issues/944) | Open tables: one table per host player, not one per host server | todo | 1 | A player hosts at most one open table; host leaving hands it on. | #833 |
| **Setup and readiness** | | | | | |
| [#143](https://github.com/jarrodjohnson-gif/emberisle/issues/143) | Research a dice roll-off for who goes first, and a rematch that carries the winner forward | in-review | 1-deep | Dice roll-off to pick who goes first (research). | - |
| [#548](https://github.com/jarrodjohnson-gif/emberisle/issues/548) | Design lobby-selectable turn-timer presets | in-review | 1-deep | Lobby turn-timer presets; 120 s stays default (design). | - |
| [#666](https://github.com/jarrodjohnson-gif/emberisle/issues/666) | Research and design 5-6 player games (epic): write docs/design/six-players.md | in-review | 1-deep | Seats for a 5th and 6th player (design doc only). | - |
| [#842](https://github.com/jarrodjohnson-gif/emberisle/issues/842) | Design: fog of war mode | claimed | 1-deep | Fog of war game mode, neighbour veil (design). | - |
| [#843](https://github.com/jarrodjohnson-gif/emberisle/issues/843) | Design: selective expansion pieces | claimed | 1-deep | Lobby toggles for Beacon docks and New fortunes, off by default (design). | - |
| **Play: rolling, building, board and camera** | | | | | |
| [#539](https://github.com/jarrodjohnson-gif/emberisle/issues/539) | Implement skippable long animations and a Calm/Brisk toggle (J-1) | claimed | 2 | Long animations skippable by tap; Calm/Brisk toggle. | - |
| [#560](https://github.com/jarrodjohnson-gif/emberisle/issues/560) | Implement owned-dock rate labels at their controlling buildings | in-review | 2 | Label at your dock-controlling building, e.g. "Your 2:1 timber dock". | #538 |
| [#590](https://github.com/jarrodjohnson-gif/emberisle/issues/590) | Legal-spot glow is faint for the ivory seat on grain and waste | claimed | 3 | Legal-spot glow readable for the ivory seat on grain and waste. | - |
| [#627](https://github.com/jarrodjohnson-gif/emberisle/issues/627) | Board fit: skip refit and view switch while a keyboard shrinks the canvas | claimed | 3 | Board does not refit when a phone keyboard shrinks the canvas. | - |
| [#687](https://github.com/jarrodjohnson-gif/emberisle/issues/687) | Dice must be completely random: prove it, and let players see it | paused | 3 | Dice proven random; each roll shown as a log line. | - |
| [#830](https://github.com/jarrodjohnson-gif/emberisle/issues/830) | Placing a home or stronghold: make the legal spots glow | claimed | 2 | Legal home and stronghold spots glow clearly when placing. | - |
| [#840](https://github.com/jarrodjohnson-gif/emberisle/issues/840) | Your-turn cue is easy to miss: make it clearer | claimed | 2 | Clearer your-turn cue on PC (sound, visual). | - |
| [#954](https://github.com/jarrodjohnson-gif/emberisle/issues/954) | Style the roll line in the HUD chip for practice and hotseat (follow-up to #687) | todo | 3 | Roll line styled in the HUD chip (red 6 and 8, bold for your roll). | #687 |
| **Goods and hand** | | | | | |
| [#439](https://github.com/jarrodjohnson-gif/emberisle/issues/439) | Keep the hand bar off screen until the player holds a good | in-review | 2 | Hand bar stays hidden until you hold a good. | #424, #419 |
| [#772](https://github.com/jarrodjohnson-gif/emberisle/issues/772) | Mock goods card and icon options in the real game for Jarrod to pick (Design) | paused | 2 | Goods card look options for Jarrod to pick (Goods cards V1 Column chosen; rebuild under #773 not open). | - |
| [#774](https://github.com/jarrodjohnson-gif/emberisle/issues/774) | Phone sideways: move the goods cards to a side rail | paused | 1-deep | Phone sideways: five goods cards move to a right-side rail. | card-look issue |
| [#825](https://github.com/jarrodjohnson-gif/emberisle/issues/825) | Gain pop-ups: hold longer, darker and easier to read, a little bigger on PC | paused | 2 | Gain pop-ups hold about 2.5 s, darker, larger on PC. | - |
| **Trade** | | | | | |
| [#363](https://github.com/jarrodjohnson-gif/emberisle/issues/363) | Decide: whether bots trade with players | in-review | 1 | Decision: whether bots trade with players (decision, in-review). | - |
| [#537](https://github.com/jarrodjohnson-gif/emberisle/issues/537) | Implement compact demand signals for unaffordable trade offers (TR-2) | claimed | 2 | Compact "Tide is looking for 2 grain" signal for offers you cannot pay. | - |
| [#561](https://github.com/jarrodjohnson-gif/emberisle/issues/561) | Design an open-ended trade ask with explicit acceptance rules | in-review | 1-deep | "Any good" trade ask with counter/accept rules (design). | - |
| [#644](https://github.com/jarrodjohnson-gif/emberisle/issues/644) | Bank and dock trades in multiples (6:2, 8:2) in one tap | paused | 2 | Bank and dock trades in multiples (6:2, 8:2) in one tap. | - |
| [#646](https://github.com/jarrodjohnson-gif/emberisle/issues/646) | "I need" button: show the table what goods you're after | in-review | 2 | "I need" button shows the table up to two goods you want. | - |
| [#831](https://github.com/jarrodjohnson-gif/emberisle/issues/831) | Simplify the trade dialog and the trade flow | in-review | 1 | Trade dialog simplified: Table and Bank tabs, fewer steps. | - |
| [#850](https://github.com/jarrodjohnson-gif/emberisle/issues/850) | Trades: give people time before bots take an offer, and allow counter-offers | claimed | 1 | Bots wait 8 s before accepting an offer; counter-offers later. | - |
| **Chat, reactions and soundboard** | | | | | |
| [#117](https://github.com/jarrodjohnson-gif/emberisle/issues/117) | Let players chat and send emoji reactions at the table | backlog | 3 | Parent: table chat and emoji reactions (chat now exists; parent still open). | - |
| [#120](https://github.com/jarrodjohnson-gif/emberisle/issues/120) | Add Jarrod's emoji images to src/assets/emotes/ | backlog | 3 | Jarrod emoji images added as reactions. | - |
| [#520](https://github.com/jarrodjohnson-gif/emberisle/issues/520) | Chat follow-ups from the #477/#502/#503 takeover review | paused | 2 | Chat follow-ups: Escape, minimize and similar edge cases. | - |
| [#663](https://github.com/jarrodjohnson-gif/emberisle/issues/663) | Build the custom PNG sticker pipeline: drop a PNG, get a sticker | claimed | 2 | Drop a PNG in a folder, get a sticker. | #635 |
| [#664](https://github.com/jarrodjohnson-gif/emberisle/issues/664) | Merge emoji, stickers and soundboard into one quick-react tray | paused | 2 | Emoji, stickers and soundboard in one quick-react tray (epic). | #635 |
| [#736](https://github.com/jarrodjohnson-gif/emberisle/issues/736) | Implement the shared three-section quick-reaction picker (#664) | backlog | 2 | Shared three-section quick-reaction picker. | #669 |
| [#737](https://github.com/jarrodjohnson-gif/emberisle/issues/737) | Integrate the unified reaction tray in lobby and remove duplicate chat pickers (#664) | backlog | 2 | Unified tray in lobby; duplicate chat pickers removed. | #736, #669 |
| [#738](https://github.com/jarrodjohnson-gif/emberisle/issues/738) | Verify the complete unified reaction flow and label the win sound GG! (#664) | backlog | 2 | Win button reads "GG! (speaker)"; full flow verified. | #736, #737 |
| **HUD, menus and seat rail** | | | | | |
| [#129](https://github.com/jarrodjohnson-gif/emberisle/issues/129) | Design the in-game HUD layout so it never covers the board | backlog | 1 | HUD layout that never covers the board (design; Astra #903 owns the HUD pass). | #128 |
| [#481](https://github.com/jarrodjohnson-gif/emberisle/issues/481) | Small follow-ups from the #469 / #479 reviews | claimed | 3 | Small follow-ups: copy-table-code fallback and similar (board look, one menu button). | - |
| [#485](https://github.com/jarrodjohnson-gif/emberisle/issues/485) | Seat strip and seat menu polish after #482 | in-review | 3 | Seat strip: names no longer cut at 844x390; menu polish. | - |
| [#491](https://github.com/jarrodjohnson-gif/emberisle/issues/491) | Landscape HUD column: keep Roll / End turn pinned at the bottom | in-review | 3 | Landscape phone: Roll and End turn pinned at bottom of HUD column. | - |
| [#492](https://github.com/jarrodjohnson-gif/emberisle/issues/492) | Lazy-chunk retry polish after #489 | in-review | 3 | Join code kept after reload; lazy-chunk retry polish. | - |
| [#511](https://github.com/jarrodjohnson-gif/emberisle/issues/511) | Fortune tray: turn banner shows through its rounded top corners | in-review | 3 | Fortune tray: turn banner no longer shows through rounded corners. | - |
| [#531](https://github.com/jarrodjohnson-gif/emberisle/issues/531) | Implement a persistent seat-level current-turn marker (T-2) | claimed | 2 | Current-turn ring and seat mark on every seat chip. | - |
| [#827](https://github.com/jarrodjohnson-gif/emberisle/issues/827) | Show what other players gain on their seat bar | in-review | 2 | Other seats briefly show what they gained after a roll or trade. | - |
| [#834](https://github.com/jarrodjohnson-gif/emberisle/issues/834) | Show the build version in the Table menu | claimed | 3 | Build version at the bottom of the Table menu and title footer. | - |
| [#912](https://github.com/jarrodjohnson-gif/emberisle/issues/912) | Hidden in-game bug reporter | backlog | 2 | Hidden in-game bug reporter, e.g. in the Table menu (needs owner answers). | - |
| [#913](https://github.com/jarrodjohnson-gif/emberisle/issues/913) | Show the client and server version somewhere quiet | claimed | 2 | Client and server version shown quietly. | - |
| **Fortunes and wayfarer** | | | | | |
| [#360](https://github.com/jarrodjohnson-gif/emberisle/issues/360) | Decide: what a plenty fortune does when the bank is out of the card you named | in-review | 1 | Decision: what a plenty fortune does when the bank lacks the named card. | - |
| [#826](https://github.com/jarrodjohnson-gif/emberisle/issues/826) | Robber: grey out the hex it sits on | claimed | 2 | Wayfarer hex and its number token greyed out. | - |
| **Bots and bot moments** | | | | | |
| [#562](https://github.com/jarrodjohnson-gif/emberisle/issues/562) | Implement persistent practice-bot seat labels | paused | 3 | Persistent "Practice" label on bot seats and bot action labels. | - |
| [#608](https://github.com/jarrodjohnson-gif/emberisle/issues/608) | Bot action moments: show and sound what a CPU seat just did | paused | 2 | Show and sound what a CPU seat just did (client-only, option A). | - |
| [#720](https://github.com/jarrodjohnson-gif/emberisle/issues/720) | Implement public bot-presentation events at committed client updates (#608) | backlog | 1 | Public bot-presentation events at committed updates. | - |
| [#721](https://github.com/jarrodjohnson-gif/emberisle/issues/721) | Implement bounded bot moments with shared centre ownership (#608) | backlog | 1 | Bounded bot moments sharing one centre slot. | #720 |
| [#722](https://github.com/jarrodjohnson-gif/emberisle/issues/722) | Implement non-pickable target cues for bot presentations (#608) | backlog | 1 | Non-pickable target cues for bot actions. | #720 |
| [#723](https://github.com/jarrodjohnson-gif/emberisle/issues/723) | Integrate bot moment highlights, cue ownership and lifecycle proofs (#608) | backlog | 1 | Integrate bot highlights, cue ownership, proofs. | #720, #721, #722 |
| [#725](https://github.com/jarrodjohnson-gif/emberisle/issues/725) | Host event feed so online bot moments show every action in order | todo | 1 | Host event feed so online bot moments appear in order. | #720-#723 |
| **Win, results and rematch** | | | | | |
| [#150](https://github.com/jarrodjohnson-gif/emberisle/issues/150) | Research a rematch that keeps the table and gives the winner first seat | in-review | 1-deep | Rematch keeps the table; winner gets first seat (research). | - |
| [#513](https://github.com/jarrodjohnson-gif/emberisle/issues/513) | Win screen headline: seat-colour text fails contrast | in-review | 3 | Win headline readable: seat-colour text fails contrast. | - |
| [#541](https://github.com/jarrodjohnson-gif/emberisle/issues/541) | Implement the staged win celebration before the score table (J-2) | todo | 2 | Win celebration in three 600 ms beats before the score table. | #539 |
| [#550](https://github.com/jarrodjohnson-gif/emberisle/issues/550) | Implement final per-seat goods-lost-to-steals statistics | paused | 2 | Score table shows goods each seat lost to steals. | #220 |
| [#748](https://github.com/jarrodjohnson-gif/emberisle/issues/748) | Implement compact phone results with expandable player score breakdowns | claimed | 2 | Phone results as compact per-player summaries that expand. | #670 |
| **Disconnect, rejoin and recovery** | | | | | |
| [#324](https://github.com/jarrodjohnson-gif/emberisle/issues/324) | Decide: what the table does when a connected player stops taking their turn | in-review | 1 | Decision: what happens when a connected player stops taking turns. | - |
| [#553](https://github.com/jarrodjohnson-gif/emberisle/issues/553) | Implement an honest host and rejoin status indicator | in-review | 1 | Reachable / Reconnecting / Offline indicator and round-trip time. | - |
| **Sound, music and haptics** | | | | | |
| [#542](https://github.com/jarrodjohnson-gif/emberisle/issues/542) | Implement guarded contact haptics with a table-menu toggle (J-3) | in-review | 3 | Phone haptics on landing and paying ticks, Table-menu toggle. | #533 |
| [#662](https://github.com/jarrodjohnson-gif/emberisle/issues/662) | Add optional sea-and-wind ambience in the Table menu, off by default | todo | 2 | Optional quiet sea-and-wind ambience, off by default. | #635 |
| [#669](https://github.com/jarrodjohnson-gif/emberisle/issues/669) | Sound menu: one place for every volume and mute | claimed | 2 | Sound menu: every volume and mute in one sheet. | - |
| [#845](https://github.com/jarrodjohnson-gif/emberisle/issues/845) | Adaptive game music: layers that change with the game | paused | 1 | Adaptive music layers that follow the game (idea). | #823 |
| **Visual system, polish and terrain** | | | | | |
| [#124](https://github.com/jarrodjohnson-gif/emberisle/issues/124) | Make the browser table look good: HUD, ocean, boats, wayfarer, and pieces | backlog | 3 | Parent: make the table look finished on PC (HUD, ocean, boats, wayfarer). | - |
| [#595](https://github.com/jarrodjohnson-gif/emberisle/issues/595) | Visual direction 2026-10: paper chips on a teal table (epic) | in-review | 1-deep | Epic: paper chips on a teal table (visual direction chosen 2026-10-14). | - |
| [#597](https://github.com/jarrodjohnson-gif/emberisle/issues/597) | Jelly-quality ocean: crystal water, tilted camera, paper backdrop, harbour life (epic) | in-progress | 3 | Epic: jelly-quality ocean, crystal water, tilted camera, paper backdrop. | - |
| [#599](https://github.com/jarrodjohnson-gif/emberisle/issues/599) | Polished cartoon terrain: sculpted tiles with real features per terrain (epic E of #597) | todo | 3 | Epic: sculpted terrain tiles with real features per terrain. | - |
| [#639](https://github.com/jarrodjohnson-gif/emberisle/issues/639) | Board: per-hex variety (turned copies and a few seeds per kind) | backlog | 2 | Per-hex variety: turned copies, a few seeds per kind. | - |
| [#640](https://github.com/jarrodjohnson-gif/emberisle/issues/640) | Board: show which corners have harbor access | backlog | 2 | Show which corners have harbor access. | - |
| [#641](https://github.com/jarrodjohnson-gif/emberisle/issues/641) | Board: a "classic" look option (the sculpted board from before the jelly overhaul) | backlog | 2 | Classic board look option (pre-jelly sculpted board). | - |
| [#642](https://github.com/jarrodjohnson-gif/emberisle/issues/642) | Board moments: goods fly on a payout, pieces land with dust, Bruno's rat steals, a title flyover, longest-path and army markers | backlog | 1 | Board moments: goods fly on payout, landing dust, rat steals, title flourish. | - |
| [#680](https://github.com/jarrodjohnson-gif/emberisle/issues/680) | Dice look exploration: 2–3 jelly-style mockups next to the current dice (Design only) | backlog | 3 | Dice look mockups next to current dice (design; owner picks). | #643 |
| [#741](https://github.com/jarrodjohnson-gif/emberisle/issues/741) | Implement piece drop, jelly squash and bounded landing dust | backlog | 2 | Pieces drop, squash and puff dust on landing. | #739 research |
| [#758](https://github.com/jarrodjohnson-gif/emberisle/issues/758) | Implement the restored Classic land builder | backlog | 2 | Restore the Classic land builder. | #750 |
| [#759](https://github.com/jarrodjohnson-gif/emberisle/issues/759) | Implement atomic Jelly and Classic scene selection | backlog | 2 | Switch Jelly and Classic scenes atomically. | #758 |
| [#760](https://github.com/jarrodjohnson-gif/emberisle/issues/760) | Integrate the local Classic board preference and acceptance proof | backlog | 2 | Local Jelly/Classic setting beside Water and View. | #759 |
| **Mini-games** | | | | | |
| [#928](https://github.com/jarrodjohnson-gif/emberisle/issues/928) | Spike: play a Flash game in a lobby box with Ruffle (Sandwich Stacker) | in-review | 2 | Spike: self-hosted Flash game in a lobby box (Ruffle). | - |
| [#929](https://github.com/jarrodjohnson-gif/emberisle/issues/929) | Design: lobby mini-games shelf (solo Flash games, plus native multiplayer like tic-tac-toe and trivia) | todo | 2 | Lobby mini-games shelf: solo Flash, trivia, tic-tac-toe (design). | - |
| [#937](https://github.com/jarrodjohnson-gif/emberisle/issues/937) | Lobby box: play Sandwich Stacker while you wait (plain prototype, held Left/Right buttons) | todo | 2 | Lobby box: Sandwich Stacker prototype, held Left/Right buttons. | #928, PR #935 (merged) |
| **Accessibility and performance** | | | | | |
| [#310](https://github.com/jarrodjohnson-gif/emberisle/issues/310) | Research the phone frame time: SSAO, pixel ratio and the idle loop | in-review | 1-deep | Phone frame-time research (SSAO, pixel ratio, idle loop). | - |
| [#312](https://github.com/jarrodjohnson-gif/emberisle/issues/312) | Design a colour-blind-safe way to tell the four seats apart | in-review | 1-deep | Colour-blind-safe way to tell four seats apart (design). | #238 |
| [#330](https://github.com/jarrodjohnson-gif/emberisle/issues/330) | Run SSAO at half CSS size in free view | in-progress | 2 | SSAO at half size in free view (faster frames). | #310, #328 |
| [#464](https://github.com/jarrodjohnson-gif/emberisle/issues/464) | Test the board's frame time on a real GPU and set the draw-call budget | backlog | 3 | Real-GPU frame time and draw-call budget. | - |

Tier `1-deep` is a design or research tier. `-` means the issue has no tier label.
Several "Depends on" issues (#762, #635, #670, #750, #823, #739, #773) are not open, so they are probably closed.

## Older UX specs and builds, probably shipped (31)

These are Sept-era research, design and build issues still labelled open, mostly `status:in-review`.
Their features probably exist on main. The desk should confirm each one before closing.

- Host, join, lobby and title: #79, #136, #167, #142, #156, #148.
- Chat and reactions: #118, #119, #159, #160, #162.
- Board look and docks: #125, #127, #130, #131, #135, #141, #157, #238, #144.
- Camera, phone layout and touch: #147, #169, #171, #172, #175, #422.
- Wayfarer steal picker and rule fixes: #92, #94, #95, #96.
- Missing-asset bug: #89.

## Open PRs that change UI

| PR | Issue | What it changes |
|---|---|---|
| #706 | #531 | Current-turn ring and seat mark on every seat chip |
| #716 | #553 | Connection health in lobby and table; saved-seat recovery |
| #824 | #537 | Demand signal for offers you cannot pay |
| #835 | #834 | Build version in the Table menu |
| #838 | #826 | Wayfarer hex and number token greyed out |
| #844 | #542 | Phone haptics with a Table-menu toggle |
| #848 | #830 | Legal home and stronghold spots glow |
| #856 (draft) | #840 | Clearer your-turn cue on PC |
| #867 | #827 | Roll and trade gains shown on other seats |
| #873 | #646 | Share up to two needed goods |
| #879 | #590 | Pale-seat legal markers with dark outline |
| #881 | #560 | Owned dock rates at controlling buildings |
| #882 | #833 | Open table joined from the title |
| #883 | #831 | Trade split into Table and Bank routes |
| #905 | #627 | No board refit while a keyboard shrinks the canvas |
| #936 | #774 | Phone sideways: goods cards on a side rail |
| #955 | #687 | Each roll shown as a log line |
| #807 (draft) | #749 | Illustrated setup in How to play |
| #812 | none named | Invite page served at /invite.html |
| #857 (draft) | #763 | Profile edit and PIN protocol (no screen yet) |

Design-only PRs (docs, no UI yet): #709 (#666), #692 (#561), #682 (#548), #853 (#843), #849 (#842), #818 (#778), #799 (#772, draft).
Not UI: #699 (desk inbox), #896 (#804 audit), #815 (#703), #920, #934 (#932), #953 (#950).

## Not UX: counted only (51)

No player-visible effect. Issue numbers only.

- Early build-out plumbing (Sept: shell, serving, tunnel, rules audits, tests) (25): #69, #70, #71, #72, #73, #74, #75, #76, #77, #78, #80, #81, #82, #83, #84, #85, #86, #87, #88, #111, #114, #116, #123, #154, #197
- CI, soak and flaky proofs (5): #887, #950, #951, #804, #803
- Agent framework, desk and process (10): #323, #411, #703, #851, #854, #870, #916, #932, #947, #903
- Server-internal: profile results, deletion, cloud migration (design and research) (11): #765, #889, #890, #891, #789, #790, #791, #792, #793, #794, #795

#903 is the review itself, counted here so it is not double-listed.

## Abandoned plan

Proposed to close, Jarrod's call.
None of the 17 Abandoned-plan issues is open. The numbers: #32, #34, #35, #38, #39, #40, #42, #43, #46, #47, #48, #50, #51, #60, #61, #64, #65.
Seven open issues carry the same Unreal and packaged-Windows plan. They are also proposed to close, Jarrod's call:

- #33 hex-id map onto the Unreal level (status in-review).
- #37 host, join and lobby screens as Unreal widgets.
- #41 host-button connection through host.txt.
- #45 glow and click-to-place flow.
- #49 dice tumble landing on server faces.
- #62 Windows package steps for the engine.
- #63 how a friend installs and joins (zip).

They count in the totals above as "Unreal-era" (7).

## Owner decisions that constrain UI

From `docs/DECISIONS.md`. Dates are those in the table.

- 2026-10-21: New look-and-feel work goes to Astra as a mock or spec before anyone builds it.
- 2026-10-20: #903 is a whole-app UX and architecture review, run in 5 checkpoints, each stopping for Jarrod's `go`.
- 2026-10-20: No cream in Astra's HUD directions. The hand and chat wait for #773 and #899.
- 2026-10-20: Fortunes button reads "Play fortune · N" when one is playable, else "Fortunes · N". Provisional.
- 2026-10-20: Chat is one button with two tabs: Chat (6 emoji), then Sounds & stickers. Reactions bubble at the seat.
- 2026-10-20: Chat C drops the Chat/All filter and the top-right preview pills. Text presets stay in Sounds & stickers.
- 2026-10-20: Goods cards use V1 Column. Numbers centred.
- 2026-10-20: Seat tallies use lucide Route and Swords icons, not emoji.
- 2026-10-20: Win table on portrait phones uses short column names (Out, Str, Path, Army, Hid).
- 2026-10-20: Pale-seat legal markers use the teal glow (mock 2).
- 2026-10-20: Emote badge returns in game only, not in the lobby, after the chat audit.
- 2026-10-19: Owned dock rates get a small marker on the building, no text labels. Dock goods piles at 2.5x.
- 2026-10-19: Trade dialog is option A, Table and Bank tabs.
- 2026-10-19: Fog of war is option A, neighbour veil, `prio:p2`. Expansions are lobby toggles, off by default.
- 2026-10-19: Open tables: anyone with the link can join, alongside code tables.
- 2026-10-19: Leaving the lobby frees the seat at once. A dropped connection holds it 90 s. No kick button.
- 2026-10-19: People get first dibs on table trades. Bots wait 8 s before a Yes.
- 2026-10-19: Robber hex gets a stronger grey.
- 2026-10-18: Turn-timer extension is a majority vote of other seated players; 2026-10-20 adds +60 s and a raised cap.
- 2026-10-18: Goods cards are pale at rest and fill with full colour on gain.
- 2026-10-18: Sheep baa plays only when a player touches a pasture hex.
- 2026-10-18: Background music is "The Old Tower Inn" (CC0). Per #662 (owner decision, undated here): no music loop in game; optional ambience, off by default.
- 2026-10-17: Bot action moments stay client-only (option A).
- Undated: Profiles are p0 (#763, #764, #766).

## Gaps

- **Missing parents.** #779 (cloud epic), #773 (goods cards rebuild), #670, #750 and #762 are named as parents or dependencies but are not open. I did not check why.
- **Version display twice.** #834 (Table menu footer) and #913 (quiet client and server version) overlap.
- **Status contradicts body.** #466 is `status:in-review` but its body says backlog idea, do not start. #803 is `status:done` but open.
- **Colour-blind marks.** #312 designs seat marks, but #590 says the new seat colours removed marks. Decide whether #312 still stands.
- **Bots and trades.** #363 asks whether bots trade with players. The 2026-10-19 decision and #850 assume they do. #363 is still open.
- **Goods cards.** #772 is paused, but the decision picked V1 Column. The build issue (#773) is not open.
- **Parents still open.** #117 (chat) and #124 (visual polish) are `backlog` while their children look shipped.
- **Bot moments.** #608 is paused while #720-#723 are backlog and #725 is todo behind them.
- **HUD design.** #129 is a backlog HUD design in the Sept docs. Astra's #903 now owns the HUD pass.
- **Look-and-feel backlog.** #639-#642, #741 and #758-#760 are board looks. The 2026-10-21 rule sends new looks to Astra first. They may already have specs.
- **Phone goods rail.** #774 is paused, but PR #936 is open for it.
- **Unreal list.** The 17 numbers given as abandoned are not open. Only seven related issues are.
- **Unverified.** The 31 older issues and every "Player sees" line come from labels and the first part of each body. I read no full bodies and no code.
