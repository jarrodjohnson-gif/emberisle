# Research: mobile and digital board-game UX benchmark (Part A)

- step: 1 Research, node: UX benchmark for the "WOW" pass
- date: 2026-10-05
- agent: Muse Spark (subagent), with three parallel research passes (Catan family / other digital board games / mobile polish benchmarks)
- branch: `docs/ux-benchmark` — docs only, no code

## What this is

A benchmark of real shipped games against the ten UX dimensions that matter for
Emberisle, then a synthesis: the top 25 patterns to adopt (ranked by impact over
effort), a first-5-minutes flow, and a motion + sound spec sheet. It builds on
`docs/research/competing-games.md` (why Catan Universe lost and Colonist.io won),
`docs/research/ux-ui-improvements.md` (2026-10-05 source review), `docs/research/visual-polish.md`,
and `docs/research/mobile.md` — it does not repeat them.

## Non-negotiables for every proposal below

- **Names:** outpost, stronghold, path, fortune, wayfarer; timber, clay, wool, grain, ore.
  Never Catan's trademarked terms in UI proposals.
- **North star (Jarrod):** "Offsuit × Catan" — simple, elegant, polished, AAA feel but
  simple, just works; **board first; remove chrome by default.** Any pattern that adds
  chrome must name what it replaces.
- **Design tokens** come from `docs/design/polish.md`: durations 80 / 150 / 220 / 280 /
  320 ms, legal-spot pulse 1.2 s, roll moment 900 ms; `--ease-out`
  `cubic-bezier(0.22, 1, 0.36, 1)`, `--ease-snap` `cubic-bezier(0.34, 1.56, 0.64, 1)`,
  `--ease-in` `cubic-bezier(0.4, 0, 1, 1)`; radii 12 / 16 / 24; resource fills
  timber `#2f6b3a`, clay `#b5522a`, wool `#8fbf5a`, grain `#e0b13a`, ore `#6e7580`;
  neutrals `bg #efeae0`, `surface #f7f4ee`, `fg #1c1915`, `sea-ink #1b726e`,
  `accent-ink #a94b30`, `danger #b3261e`; glass = white ≥ 70 % + 16 px blur.
  Reduced motion: CSS durations collapse to 1 ms; looping three.js motion stops and
  holds a steady state; sounds still play.
- **Evidence rule:** every claim about another game carries a source — a timestamped
  video URL *with its publish date*, or a store/article URL. `(inferred)` marks
  inference. "Not verified" marks gaps. Newer footage (2024–2026) was preferred for
  every game; where only older footage exists the date is flagged and the UI may
  have changed since. "Steal this" patterns are recommended only when verified in
  recent builds.
- **Phones first:** every pattern is specified at 390×844 and 360×640 portrait,
  844×390 landscape, and 1280×720 desktop.

## What Emberisle does today (grounded in the repo, 2026-10-05)

The live build could not be screenshotted from this session (no browser control);
"today" is grounded in code on this branch plus the proofs in the README.

| Dimension | Today | Source |
|---|---|---|
| Turn clarity | A glass `turn-banner` names the phase/actor; when it is your turn it gets an accent tint (`border-accent`, accent gradient). The tab title becomes "● Your turn — Emberisle" so a background tab signals. A `TurnCountdown` chip shows the host's turn timer. | `src/components/game/Hud.tsx:308` (`data-testid="turn-banner"`), `Hud.tsx:184` (`turnText`), `src/lib/turn-title.ts:5` |
| Gain/loss feedback | The hand diffs counts on every state: a gain flashes `+N` green, a loss `-N` red, **on the hand card itself**, 1200 ms (`FLASH_MS`), `ease-out`. Small text over the resource card. | `src/components/game/Hand.tsx:23` (`FLASH_MS = 1200`), `Hand.tsx:108-123` (`data-testid="resource-flash"`) |
| Affordance | Build buttons (Path / Outpost / Stronghold / Fortune) show label + icon only; unaffordable = 50 % opacity (`UNAFFORDABLE`), cost lives in the `title` tooltip (hover-only — invisible on phones). Legal board spots pulse in your seat colour. | `src/components/game/Hud.tsx:95`, `Hud.tsx:340-365`, `title={priceLabel(kind)}` |
| Rules reference | Costs exist in exactly two places: one sentence in How to play ("Build paths (timber + clay), outposts (timber, clay, wool, grain), strongholds (three grain, two ore). Fortunes cost wool, grain, ore.") and an `sr-only` paragraph for screen readers. No visible costs card. | `src/components/game/HowTo.tsx:59`, `src/components/game/Hud.tsx:446` |
| Board focus | Camera fits the island into the hole the HUD leaves (`chromeInsets`); 25° lean overhead default; drag orbits, wheel/pinch zooms, Home/double-tap re-fits. Tap targets ≥ 44 px; tap-then-confirm on coarse pointers. | `src/lib/scene/mobile-fit.ts`, `scripts/touch-place-prove.mjs` (README) |
| Trading | Trade panel + trade toast exist (ask the table, 20 s, Yes/No). Bank/dock trade UI exists. | `src/components/game/TradePanel.tsx`, `TradeToast.tsx` |
| Social | Chat dock (presets, emotes, unread badge), reactions float 2 s over the sender's seat card, player action menu, lobby chat, watchers. | `docs/design/chat.md`, `src/components/game/Chat.tsx` |
| Juice | Dice settle 150 ms (`die-settle`); the roll sum shows once at `text-display` 56 px (accent-ink on a 7); outpost lands 280 ms with `--ease-snap` and a knock on contact; path grows 220 ms; paying hexes glow once after a roll; pieces land with CC0 Kenney sounds on contact. | `src/components/game/Dice.tsx:24-25`, `Dice.tsx:154` (`data-testid="roll-sum"`), `docs/design/polish.md` sound table |
| Accessibility | Seat marks (triangle/bars/ring/plus) supplement colour on pieces and UI (`seat-marks-prove`); contrast ≥ 4.5:1 on text (`contrast-prove`); reduced-motion handling in renderer and CSS; keyboard placement flow (`keyboard-place-prove`); screen-reader costs line. | `docs/design/seat-marks.md`, README proof table |
| Performance feel | Render on demand with 30 fps idle gate (`idle-prove`); DPR capped 1.5 on coarse pointers; chunk-fail recovery; host ping/keepalive, reconnect by saved seat, room persistence. | README "Run it" / proof table |

### Judging the fixes already in flight for Jarrod's 5 complaints

Claude is building fixes for complaints 1–4. Against the benchmark evidence gathered
below, each fix is judged here rather than re-proposed:

1. **Turn clarity** — the accent-tinted banner + tab title + countdown is the right
   *set* of signals, but the benchmark says the banner is still too quiet: every
   strong game pairs the "your turn" moment with motion (a slide/fade-in, not a
   static tint) and a dedicated chime *at the moment the turn changes* (ours reuses
   the `chip_gain` click today — `src/lib/sound.ts:88`), plus a persistent
   "whose turn" marker on the seats themselves. Proposed improvement: animate the
   banner's arrival and give the chime its own cue entry (see pattern T-1), and add
   a seat-level current-turn marker that survives the banner being dismissed.
2. **Gain feedback** — the 1200 ms on-card flash is correct in *place* (colour is
   information; the hand card is the resource's home) but wrong in *scale and
   duration* for Jarrod's ask. He wants centre-screen "+2 Timber" that fades.
   Judgement: do both, sequenced — the centre-screen moment (pattern G-1, ~900 ms,
   `text-title` 20 px, resource fill token as text colour on glass) for the *event*,
   kept small enough to never cover the island's middle; the hand-card flash stays
   for the *ledger*. Never replace the ledger with the moment: overlapping gains
   stack in the ledger, and the moment is skipped under reduced motion while the
   ledger is not. (Contrast note: the moment's text is `fg` ink on glass with a
   resource-fill dot — wool/grain fills fail 4.5:1 as text on glass, so the colour
   goes on the dot, not the words.)
3. **Build affordance** — opacity-50 + hover tooltip fails on phones (no hover) and
   fails the "at a glance" test everywhere. The benchmark consensus: the cost is
   printed *on the button* ("Path · 1 timber 1 clay", already the polish.md
   direction), affordable builds get a subtle glow/lift, unaffordable show the
   missing good ("need 1 clay") on long-press or on tap, never a dead button.
   Proposed improvement: put the price on the button face and add the missing-good
   hint (pattern A-1); keep `aria-disabled` focusability.
4. **Costs card** — the How-to sentence is not a reference card. Every physical and
   digital settler game ships a persistent, one-tap costs reference. Proposed: a
   single "Costs" chip in the table menu opening a `rounded-sheet` card (pattern
   R-1); it replaces nothing on screen by default (menu already exists), satisfying
   "remove chrome by default".
5. **"Sloppy"** — the benchmark's through-line: sloppiness is inconsistent motion
   (mixed durations/easings), text that means the same thing in two voices, and
   numbers shown small or twice. The cure is the polish.md token discipline plus
   patterns J-1..J-3 below, not new features.

## A1. Catan family

### CATAN Universe (USM/Exozet/Asmodee; current patch 2.7.5, ~Jul 2026)

1. **Turn clarity** — The active player gets a countdown timer on their avatar panel; the roll/end-turn button is only active during your turn ("If you see a 'Roll Dice' button or the N key prompt is active → it's your turn", community skill doc updated ~Jul 2026, https://github.com/tuitamogamer-gpt/claude-code-setup/blob/HEAD/claude-ai-skills/catan-player/SKILL.md). A dedicated "it's your turn" ticker exists (Steam 2.0 patch notes ~2019, FLAG old; still referenced as current in the 2026 skill doc). Turn timer is punitive: inactivity can get you kicked and replaced by AI; the custom-game timer setting is "somewhat hidden" (androidayuda review ~Dec 2025, https://en.androidayuda.com/games/recomendados/catan-universe/). 2.6.x notes cite a "steadier turn timer" (apkbog 2.7.5 notes ~Jul 2026, https://apkbog.com/en/apk/catan-universe/2.2.11).
2. **Gain/loss feedback** — Resource distribution animations play after every roll; the 2026 skill doc warns to wait ~1–2 s after actions before reading state because "placement animations (dust effects), resource distribution animations, and trade offer popups can obscure the board" — animations long enough to block input. Dust/particle burst on piece placement. Steal flow is modal: move figure → if multiple opponents adjacent, a second modal asks which opponent to steal from. Sound: "appropriate sound effects for different moves" (mysterygames review, crawled ~Jul 2026). ms timings not verified.
3. **Affordance** — Build readiness is ambient: "The game makes it obvious which build options you have at any time by placing an available piece on the side of the screen when you can build" (Pixelated Cardboard, Apr 2023 — FLAG old, behavior consistent with current build). Context-sensitive primary button (lower right) shows the next action — roll or end turn — with a smaller secondary you hold to reveal all options. Build buttons show remaining piece counts. Anti-pattern: trade and End Turn sit very close together; the 2026 skill doc recommends keyboard shortcuts to avoid misclicks.
4. **Rules reference** — "Arrival on Catan" guided onboarding (walkthrough + AI games); per-expansion tutorials "brief as possible" (Pixelated Cardboard 2023, FLAG old; "comprehensive tutorial" still on Play Store page crawled Mar 2026). No in-HUD costs quick-reference verified. Trade dialog microcopy is fiddly: "click upper half of resource icons to increase" (2026 skill doc).
5. **Board focus** — 3D board on a virtual table, tilted camera; automatic camera pans/zooms to new buildings and moving pieces (can be disabled); 2D top-down camera toggle exists. Effectively landscape-first on mobile; resource bar icons "small — zoom in mentally on the bottom bar" (2026 skill doc). Chrome criticism: "difficult to remember all the available options during a game, mainly because most of them are off-screen" on mobile (androidayuda, Dec 2025).
6. **Trading** — Y key / trade button opens domestic trade dialog; set give and receive, confirm via checkmark; responses arrive as accept / counteroffer / decline. Maritime/bank trades in the same interface with 4:1 / 3:1 / 2:1 ratios. Modal-heavy flow; no timed offer expiry verified.
7. **Social** — "Emjoii" emoji chat; chat profanity filter (2.6.3); friend & block lists, guilds, in-game and whisper chat, report dialogs (2.7.5 notes ~Jul 2026). Emotes beyond emoji chat, rematch, invite links: not verified.
8. **Juice** — Board pieces fall onto the table on game start; placement dust effects; per-move sounds. Win screen treatment in 2024–2026 footage: not verified. Haptics: not verified. Only timing figure: ~1–2 s animation/input-block (2026 skill doc).
9. **Accessibility** — Subtitles and variable AI difficulty listed under accessibility (iofreeonline technical report, Feb 2026). Colour-blind, text size, reduced motion, screen reader: not verified.
10. **Performance feel** — 2.7★ from 86,544 Google Play reviews (crawled Mar 2026). "Plagued by technical debt for years… frequent disconnections" (iofreeonline, Feb 2026); login "feels like it was designed in 2005". Mitigations: "steadier turn timer," "better multiplayer stability," "replacement AI more stable" (2.6.x, Jul 2026). Load time and signal-loss behaviour: not verified.

**Steal this** (2024–2026 verified): (1) Context-sensitive primary action button — one big button that is "Roll" then "End turn," inactive when it isn't your turn. (2) Ambient build affordance — surface the piece at the screen edge the moment it's affordable instead of hiding readiness in a menu. (3) Hold-for-more pattern — default HUD is one primary action; everything else behind hold/long-press. (4) 2D camera toggle + auto-camera off switch.

**Avoid this**: (1) Punitive inactivity kicks with a hidden timer setting — never a surprise kick with friends. (2) Trade and End Turn as adjacent tap targets — keep turn-ending actions spatially separated. (3) Core actions off-screen on mobile — "remove chrome" must mean one primary action + progressive disclosure, not hidden actions. (4) Modal-chained wayfarer flow — combine "pick hex, then victim" into one step.

### CATAN Classic mobile app (USM "Catan Classic", v4.8.2, last update Feb 19 2024; store listing touched Mar 24 2026)

1. **Turn clarity** — Real-time multiplayer only (no async); turn indication specifics not verified in 2024–2026 sources. Trade requests/counters arrive as popups during opponents' turns (Pixelated Cardboard ~Aug 2024).
2. **Gain/loss feedback** — Not verified in detail; flat 2D top-down board, minimal custom artwork.
3. **Affordance** — Not verified for build-readiness highlighting. Build/trade menus "more frustrating than it needs to be" and "designed for a stylus rather than a thumb" (iofreeonline/Dinsun, Feb 2026).
4. **Rules reference** — Bite-size tutorial series, one concept per lesson — but "you can't go through them as a series; the app forces you back to the menu to select the next one" with a repeated welcome screen (Pixelated Cardboard, Aug 2024). Almanac follows the physical rulebook's glossary but "is left feeling incomplete". No quick-reference costs card verified.
5. **Board focus** — Scrollable board with pinch zoom; three switchable graphic sets; strictly 2D top-down; **landscape only, one direction** — "Flipping your phone over won't result in the app flipping" (Aug 2024). Tap targets criticized as stylus-scale (Feb 2026); "interface can be sluggish on smaller screens".
6. **Trading** — Offer a deal; any opponent can accept, decline, or counter-offer. Trade menus "clunky"; pass-and-play trading with 4 people "tricky" logistically (Aug 2024). Bank/port trade UI specifics not verified.
7. **Social** — Cross-platform real-time: Quick Match and Custom games (public/private, AI fill); "online play… lacks the social nuance that makes the physical game great" (Feb 2026) — no chat system verified. 10 AI opponents with Expansion/Aggression/Skill star ratings; the global Easy/Medium/Hard setting's interaction with per-AI ratings "isn't explained anywhere" (Aug 2024). Rematch/invite links/emotes: not verified.
8. **Juice** — Minimal ("isn't a lot of custom artwork here"). Detailed dice-roll statistics across games and per-AI win percentages as a stats-nerd substitute. Win screen, haptics: not verified.
9. **Accessibility** — Only the tutorial listed (Feb 2026). Colour-blind, text size, reduced motion, screen reader: not verified.
10. **Performance feel** — Launch feels broken: "you will get a blank screen for a second, then you will return to your phone screen before the app actually launches a few seconds later" (Aug 2024). Crash recovery exists — a "match recovered" screen asks every player to opt back in — but if one player never rejoins, the rest are stranded with no way to remove them (App Store review Oct 2024). "Battery usage is surprisingly high for a board game" (Feb 2026).

**Steal this** (2024–2026 verified): (1) Three switchable graphic sets — cheap, high-perceived-value personalization. (2) Bite-size one-concept tutorials — right granularity, but as a continuous flow. (3) Per-opponent stat tracking (dice distributions, win %) — a progression surface with zero art cost.

**Avoid this**: (1) The "match recovered" deadlock — reconnect needs a timeout that converts the missing seat to AI or lets the room continue. (2) Stylus-scale tap targets — every control thumb-sized. (3) Single-orientation lock — support both landscape directions at minimum. (4) The bounce-to-home-screen launch — first paint must be a branded loading state, never a home-screen flash.

### Colonist.io — web (crawled Sep 2026; engineering blogs Feb 2026 and Jun 2026)

1. **Turn clarity** — Per-mode turn timers published on the homepage: 1v1 = 10 s, 4-player = 30 s, C&K = 40 s, Rush = 10 s (https://colonist.io/?mainpage=1). The Jun 2026 Rush engineering blog reframes the UI as "what is each player allowed to do right now" instead of "whose turn is it" — every player carries their own action-state at all times (https://blog.colonist.io/colonist-rush-development/). Active-player panel highlighting and audible turn ping visible in gameplay footage (Season 17 ranked video https://www.youtube.com/watch?v=6dLCcfP3jKA, ~Jun 2026 — inferred).
2. **Gain/loss feedback** — Gains are logged as typed game events in a persistent game log. The official rules page shows an animated GIF of resource cards being collected — collection is an animated card-to-hand motion (https://colonist.io/catan-rules/, inferred from the GIF's presence). Wayfarer steal and discard flows have their own animated explainer GIFs. Exact durations/easing/colours: not verified.
3. **Affordance** — The state-machine reframe is the key pattern: the client always knows exactly which actions are legal for you right now (Jun 2026). Trade rates are printed on the cards in your hand plus a legend of all trade rates when you have a port or an empty hand (official trade-system blog Aug 2023 — FLAG old, design still live: https://blog.colonist.io/improving-the-colonist-trade-system/). Self-identified gaps (Jun 2026): "more information when choosing whom to rob… trade offers to communicate more context… opponent panels to make it easier to identify who's winning at a glance."
4. **Rules reference** — Official how-to video with chapters (04:37 "Ending Your Turn," 04:47 "Colonist Interface," 05:13 "In-game Menu": https://www.youtube.com/watch?v=XUcO2wYcIEY). Rules page with cost table and animated GIFs per concept; probability dots under every number token; trade-rate legend in the bank tab. First-60-seconds specifics not verified beyond "Play vs Bots" fast onboarding. No in-HUD one-tap costs card — costs live on the website, not in the game chrome.
5. **Board focus** — Web-first landscape client; flat 2D vector-art board, high information density. "The interface isn't what you'd call beautiful, but it's refreshingly utilitarian: no cruft, just speed and clarity" (TapSmart review ~Sep 2026). Camera/zoom and tap-target px: not verified. Player colours blue / red / orange / brown / white.
6. **Trading** — The best-documented trade UI in the genre (trade blog Aug 2023, FLAG date, current design): vertical give/receive mapping (offered resources move up and away from your hand, requested come down toward it — "upward and downward directions offer a more direct mental mapping of giving and receiving" after 20+ explorations); dedicated bank tab for bank trades; per-player response status icons (accept / reject / still deciding); counteroffers even without the resource; jump-in on others' counteroffers; open-ended/wildcard offers; embargo moved into the player profile. Speed engineering (Jun 2026): rejected offers disappear immediately and offers you can't afford are never shown — "dramatically reduced distracting trade noise."
7. **Social** — In-game chat with Fair Play & Chat Toxicity improvements shipped 2025 (blog Feb 2026: https://blog.colonist.io/colonist-io-2025-summary/). Friends expansion (2025) for faster setup; private rooms with host options and ready-checks. Invite links: not verified. Emotes: not verified. Mute: not verified. Presence: player panels + turn order; 7,761 online / 236,118 games-per-day counters (Sep 2026). Rematch: not verified.
8. **Juice** — Dice-roll animation, card-collect animation (rules-page GIFs); pacing data: 5 s dice timer is the most popular Rush speed and players starting at 5 s replay more than at 8 s (Jun 2026). Celebration moments, haptics (n/a web), sound specifics: not verified.
9. **Accessibility** — No colour-blind mode as of January 2025, despite a feature request open since January 2020 (UX case study citing a Jan 2025 conversation with a senior developer: https://shannanyoung.com/colonist-accessibility-case-study/). Text size, reduced motion, screen reader: not verified.
10. **Performance feel** — No install; instant play; "find a real opponent in a matter of seconds" (TapSmart, Sep 2026). Scale: 60M games played in 2025, 10.1K peak concurrent (2025 summary). Load time in seconds, reconnect flow, signal-loss behaviour: not verified.

**Steal this** (2024–2026 verified): (1) Per-player trade response status — accept/reject/waiting icons on every offer. (2) Rejected offers auto-dismiss; unaffordable offers never render (Jun 2026 spam fix). (3) "What can I do right now" state machine — expose the legal-action set per player instead of a turn flag. (4) Trade rates printed on the resource cards in hand. (5) Data-driven pacing — they A/B-tested 5 s vs 8 s timers and shipped the default the retention data supported; instrument turn length from day one.

**Avoid this**: (1) No colour-blind support after 5 years of requests — ship non-colour encodings at launch; it's a competitive edge none of the three have verified. (2) Costs reference lives outside the game — the excellent rules page is on the website, not in the HUD. (3) Winner-identification gap — their own team admits opponent panels don't show who's winning at a glance; keep per-player victory progress always visible.

### Colonist.io — mobile web

Thinner evidence — most mobile coverage is the native iOS app, distinguished here. The Jun 2026 Rush blog is the strongest mobile-web evidence: trade-offer spam "became particularly annoying" on mobile devices, which drove the hideable-trade-offers design (trade offers have a hidden state and a visible state on mobile). The team rejected hotkeys explicitly to preserve competitive fairness between web and mobile players — input parity is a stated design constraint. Third-party description: "compatible with mobile devices… optimized for mobile play… access through a web browser" (crazigame, crawled Sep 2026). Tap-target sizes, one-handed portrait ergonomics, camera/zoom gestures on mobile web: not verified. Do not conflate with the native iOS app (TapSmart Sep 2026 praises its portrait mode — that is the App Store app, not mobile web).

**Steal this**: (1) Hideable trade-offer panel on small screens with aggressive auto-filtering. (2) Input parity as a design rule — no desktop-only shortcuts that unbalance mobile play; every action equally fast by touch.

**Avoid this**: Treating mobile web as a shrunk desktop client — Colonist's own lesson was that offer spam acceptable on desktop became unbearable on phones. The PWA must be mobile-first in layout, not just responsive.

## A2. Other digital board games

### Ticket to Ride — Marmalade Game Studio edition (Steam Nov 2023; Android v1.10.0 updated 27 Nov 2025)

*Sources: store pages (Steam/Google Play, crawled 2025–2026), official trailer https://www.youtube.com/watch?v=bRX_LdIa4bM (~Jun 2026), Dicebreaker Nov 2023, game-solver user reviews (~Dec 2025), Stumpt Japan-expansion gameplay https://www.youtube.com/watch?v=6kKfP3LDjJU (~2025, inferred), Wikipedia (Google Play rating data Sep 2024).*

1. **Turn clarity** — Async notification confirmed in current store copy: "Set up or join an asynchronous game and play across multiple days — we'll notify you when it is your turn" (Steam + Google Play, 2025–2026). In-game real-time turn indicator (visual/audio at the table): not verified. Whose turn otherwise: not verified.
2. **Gain/loss feedback** — Ticket completion → 3D postcard reveal: "when you complete a ticket, it flips to reveal a postcard of a train puffing into the destination you just reached, an animated 3D scene" (Marmalade creative director Mike Rosser, Nov 2023; still featured in the Jun 2026 trailer). Route claiming plays in a 3D world with sculpted terrain. Durations/easing: not verified.
3. **Affordance** — Route-claim readiness display: not verified. Anti-evidence: Dicebreaker (Nov 2023) reports launch complaints of a "cluttered user interface"; a game-solver reviewer (~Dec 2025) reports "Sometimes we have enough train cards of the correct color but the app won't let us place them" — affordance around claiming still confusing two years post-launch.
4. **Rules reference** — No verified in-game costs/rules quick-reference or tutorial flow. Store copy includes a 4-step "HOW TO PLAY" text — marketing-page onboarding, not in-game.
5. **Board focus** — Board-first by design: full 3D board is the entire play surface; chrome edge-docked. Tap targets / one-handed / portrait-vs-landscape: not verified. Vertical maps (India) required a UI pass for portrait phones (Days of Wonder Q&A, Pocket Gamer, 2015 — FLAG old).
6. **Trading** — N/A.
7. **Social** — Leaderboards, private games with friends, couch play, online ranked/unranked — all in current store copy. Chat, emotes, mute, rematch, invite links: not verified.
8. **Juice** — 3D world, animated trains, character cast, postcard reveals. Anti-juice: "the new animations making matches longer than they need to be, with no option to speed them up" (Dicebreaker, Nov 2023); as of Dec 2025, AI opponents in single-player "can take 30–60 seconds just to decide to take 2 cards" (game-solver). Splash screens called slow for async players.
9. **Accessibility** — Not verified.
10. **Performance feel** — Load time: not verified with numbers. "Unbelievably slow compared to previous version" after one 2025 update (game-solver). Crash reports at 2023 launch (Dicebreaker: "mixed" Steam reception); current Google Play 4.6★ / ~4k reviews and App Store 4+ with 8,683+ ratings (~Dec 2025) suggests stability recovered.

**Steal this** (2024–2026 verified): (1) Celebrate completion at the location of the achievement — the reveal plays on the completed route, not in a modal; for Emberisle, play the fortune/stronghold completion beat on the hex/vertex itself. (2) Async promise as a feature line — "we'll notify you when it is your turn" stated plainly. (3) Board-first 3D presentation with edge-docked chrome.

**Avoid this**: (1) Unskippable opponent/animation pacing with no speed control — the single most repeated complaint across two years of reviews. Ship a game-speed toggle that works mid-game. (2) Cluttered HUD at launch (Dicebreaker 2023). (3) Claim affordance that silently refuses ("enough cards but won't let us place them", Dec 2025) — any disabled build action must say why ("missing 1 ore").

### Carcassonne — official app (Asmodee Digital / Twin Sails Interactive; last update 5 Aug 2026 per Gizmodo spec; Play Store 2.9★/11k votes, App Store 2.5★/265 votes)

*Sources: Meeple Mountain Android review (content ~2020–21, crawled recently — UI may have changed, FLAG), Pocket Gamer iOS launch (Mar 2020), Steam community videos https://steamcommunity.com/app/598810/videos/, Steam discussions (2020) on timeout/AI takeover, Wikicarpedia digital-versions page, Kotaku DLC screenshot galleries (~May 2026).*

1. **Turn clarity** — Turn structure inherently legible (draw → place → optional meeple); no verified dedicated "your turn" banner/sound. Online lobby shows per-player game list; in-game turn order follows the scoreboard ring (inferred).
2. **Gain/loss feedback** — Scoring animations on feature completion; reviewer notes "it's interesting to see the animations of the scoring and the tile placement the first few times" — i.e., they get old, and there is no way to change game speed once the game has begun (Meeple Mountain). Scoreboard ring advances visibly (inferred).
3. **Affordance** — "Play With Fields" toggle: shows who controls which fields — a state-reveal button for the hardest-to-read board state. "Dead Tiles" setting warns when a spot becomes impossible to fill; "Remaining Tiles List" lets players peek at undealt tiles. Legal tile placements "clearly marked"; tile rotates freely.
4. **Rules reference** — "The built-in tutorial does an excellent job of teaching the basics" but "the concept of placing farmers into fields is never even mentioned" — "arguably the most crucial aspect of the game" (Meeple Mountain). Tutorial completion ≠ rules coverage; audit against strategic rules, not just mechanical ones. First-60-seconds: brief loading → home with Play Local / Play Online / Resume, profile at-a-glance.
5. **Board focus** — 2D/3D view toggle in-game ("I'm 2D all the way" — 3D is decorative, 2D is the competitive view). "Meeple Finder" setting: placed meeples "occasionally jump up into the air to make it easier to see where everything is" once the board fills — the reviewer's favourite feature. Misclick data point: the confirm-tile button is immediately replaced by the confirm-meeple button with no "are you sure," so "it is very common that you miss opportunities to place workers due to overly sensitive controls" — "downright infuriating" in ranked games.
6. **Trading** — N/A.
7. **Social** — Online multiplayer with joinable-game list; entries expand to show requirements (karma/skill/expansions); "online chat functionality" from menus. Emotes, rematch: not verified.
8. **Juice** — Tile-placement and scoring animations; meeple jump; achievements. Volume settings exist; specifics not verified. No ms timings measurable from text sources.
9. **Accessibility** — Language selection, graphics-quality setting, volume sliders. Colour-blind, text size, reduced motion, screen reader: not verified.
10. **Performance feel** — Timeout handling verified via Steam discussion (2020): when a player's clock runs out they are eliminated and replaced by AI, which finishes their turns; a disconnected player can resume/reconnect even after the AI has played turns for them. Online game creation uses a per-player total time bank — chess-clock style.

**Steal this**: (1) "Meeple Finder" pattern → a "piece finder" toggle that briefly pops all placed pieces so a crowded board becomes readable. (2) Information-reveal buttons over persistent chrome — momentary overlays answering "who controls what" / "what's left in the deck" instead of permanent HUD panels. (3) 2D/3D toggle with 2D as the serious view. (4) Total-time-bank clock per player (chess-clock style), set at table creation.

**Avoid this**: (1) Confirm-button swap with no confirm step — never swap a confirm button's meaning mid-flow. (2) No mid-game speed control. (3) Tutorial that skips the strategically crucial rule — audit Emberisle's tutorial against wayfarer play and the fortune deck. (4) Undocumented AI personalities — describe bot styles in one line each if shipped.

### Wingspan — digital edition (Monster Couch; Steam 2020, mobile 2021, Switch; Nintendo Insider review May 2026; YouTube playthroughs Jun–Sep 2026)

*Sources: PC Gamer review (2020), TouchArcade iOS review (Aug 2021), game-solver user reviews (~Jan 2026), Nintendo Insider Switch review (May 2026), https://www.youtube.com/watch?v=xQaiRY7-4jw (~Sep 2026), https://www.youtube.com/watch?v=jRMfoVQd400 (~Jun 2026).*

1. **Turn clarity** — Documented weakness: "It's also not always clear what element is active, or what precisely the game wants you to click on to proceed" (PC Gamer, 2020); no 2024–2026 source contradicts it. Turn timers explicit and surfaced pre-game: 5-minute turn limit for real-time matchmaking, 24-hour (up to 72 h in async) for asynchronous — chosen at matchmaking. Dead-time delight: "You can click on your birds while you wait for your turn and they make adorable chirps" (PC Gamer, 2020).
2. **Gain/loss feedback** — "Gorgeous transitions in between areas, lovely subtle card animations" (TouchArcade, 2021); animated birds, calls, environmental sound. Frequent small gains get ambient feedback — motion + sound at the site of the gain — rather than modal celebration. Durations: not verified.
3. **Affordance** — "You can't make a wrong move because the game doesn't let you" — illegal actions prevented outright rather than explained (Eurogamer preview 2020 — FLAG old; shipped reviews don't contradict). Cost: "It can get crowded with a big hand of cards" (PC Gamer, 2020); on iPhone "a few tiny button touch targets" and a "thin tall font [that] can be a challenge for older eyes, even on an iPhone Max" (TouchArcade, 2021; echoed Jan 2026).
4. **Rules reference** — "The tutorial does a thorough job of teaching you the game" (PC Gamer, 2020); "well-explained tutorials" re-confirmed on Switch (Nintendo Insider, May 2026); a Jan 2026 player review calls it "easy to understand and get through." Counterpoint: "Sometimes, things aren't clear enough and you might miss the small touch target arrow to progress" (TouchArcade, 2021) — tutorial gating on tiny targets is its own failure mode.
5. **Board focus** — "Digital adaptations of board games should be best on iPad because of the screen real estate" — touch "very good" on iPad; on iPhone text runs small (TouchArcade, 2021). Player board is the persistent focus; opponents' boards a tap away (inferred).
6. **Trading** — N/A.
7. **Social** — Online multiplayer up to 5, custom premade games, matchmaking, hot-seat/couch, weekly "Champ of the Birds" challenge with global leaderboard. Chat/emotes/mute/rematch/invite links: not verified.
8. **Juice** — Animated watercolour habitats, bird idle animations + species calls, gentle guitar score by Paweł Górniak (TouchArcade, 2021). Celebration moments / win screen: not verified. Haptics: not verified.
9. **Accessibility** — Text size option explicitly requested by players (thin tall font hard for older eyes — TouchArcade 2021, game-solver Jan 2026); no evidence it was ever added. Colour-blind, reduced motion, screen reader: not verified.
10. **Performance feel** — Jan 2026 reviews split: "crash loops," lost collections after reinstall, no cloud save, AI "brutally slow — borderline unplayable" vs. "very well designed and runs very smoothly" (game-solver). Perceived performance is dominated by AI turn pacing, not frame rate. iOS push notifications for async games confirmed working (TouchArcade, 2021).

**Steal this**: (1) Dead-time micro-interaction — tappable birds that chirp while you wait; Emberisle equivalent: tapping outposts/hexes during others' turns gives a tiny satisfying response. (2) Async push notification for "your game needs you" (verified working on iOS, 2021). (3) Ambient rather than modal gain feedback for frequent small gains. (4) Pre-game timer choice (5-min real-time vs 24 h async) presented at matchmaking, not buried in settings.

**Avoid this**: (1) "Not clear what's active / what the game wants you to click" — every interactive state needs a visible current-target cue. (2) Tiny tutorial touch targets gating progress — tutorial "next" affordances ≥ 44 pt. (3) Thin decorative fonts at small sizes with no text-size option — requested 2021, still requested 2026; ship dynamic text size. (4) AI turn pacing with no throttle control.

### Board Game Arena (platform) — with per-title notes on 7 Wonders, Azul, Splendor

*Sources: BGA live game help/wiki (7 Wonders page, current — https://en.boardgamearena.com/gamepanel?game=sevenwonders), Tom's Guide (2024), Eric Juneau blog (Oct 2025), Quarter To Three forum (Jun 2023, May 2024), BGA bug report #88500 (May 2023), Tabletop Gaming Guild TTR Europe on BGA https://www.youtube.com/watch?v=odGCiP3b4l0 (~May 2026).*

1. **Turn clarity** — The current player's panel is highlighted and a status line states whose turn it is / what they must do (platform convention; 7 Wonders wiki shows per-state prompts like "you must select…"). Optional sound alert when it becomes your turn plus a yellow notification bar at the top for turn-based games (BGA forum, 2016 — FLAG old, design still live per 2024–2025 discussions). Push notifications are a user preference (confirmed working on phones, Qt3 Jun 2023); email fallback exists. Timers: real-time tables show per-player clocks; turn-based show time-per-move. If a player exceeds their time, opponents can vote to expel them — verified via bug #88500 (May 2023), where a player was expelled on the last turn and told this is "completely allowed within the rules of BGA."
2. **Gain/loss feedback** — Platform convention: point gains animate the score marker along the score track rather than snapping; game log narrates every gain/loss in text with a scrollable history — the log is the persistent trace that solves "gains flash by too fast." Exact ms/easing: not verified.
3. **Affordance — best in class** — 7 Wonders (live wiki, current): every card shows possible actions; costs carry an icon language — red cross = you can't gather the resources, yellow check + number = you can buy from neighbours (number = coins owed), green check = buildable with your own resources. Wonder stages use the same convention. Illegal moves are generally unclickable rather than error-modal (platform convention).
4. **Rules reference** — Interactive tutorials on the game page ("learn while playing") repeatedly cited as the killer feature (Tom's Guide 2024). Game-specific help one click from the table. First-60-seconds: lobby → table → tutorial prompt; "BGA can get finicky and it's best to know which buttons to click" (Tom's Guide 2024).
5. **Board focus** — 2D, zoomable boards; mobile works but dense titles (Terraforming Mars) require "a lot of scrolling back and forth" and card zoom via long-press "hoping it pops in properly" (Tom's Guide 2024). Light titles (Heat) work fine on phones. Lesson: the hex board must be fully legible at phone width with tap (not hover/long-press) zoom. Tables watchable by spectators with live progress (Qt3 Jun 2023).
6. **Trading** — No platform-wide trading UI; trading is per-title. BGA bug #97633 discusses adding notifications when someone accepts/counters a trade offer — even BGA treats trade-response alerts as an unsolved notification problem. Any counter-offer must re-alert the proposer ("it's your turn again").
7. **Social** — Table chat box (free text) on every table; player profiles with friend lists; invite via "Copy Link" from the play screen — "go to the play screen, select turn-based and number of players, then click on one of the open spots and do Copy Link" (Qt3, May 2024); the same post says invites "made this so much harder than it used to be" — a 2024 UX regression complaint. Emotes: not verified. Mute: inferred per-table ignore. Rematch: not verified. Presence: online indicators (inferred).
8. **Juice** — Deliberately low-juice: subtle per-game move sounds; theme-appropriate background music per game (Eric Juneau Oct 2025). Win: results panel with scores, ELO changes, "play again" flow (inferred).
9. **Accessibility** — Not verified as platform features.
10. **Performance feel** — "If something goes wrong, just refresh. You'll still be in the same game as if you never left" (Eric Juneau, Oct 2025) — state is server-held; reconnect is a non-event. Internet-dependent by design; occasional bugs acknowledged.

Per-title notes — **7 Wonders:** the red-cross/yellow-check/green-check cost language is the steal; simultaneous drafting means no downtime. **Azul:** near-wordless UI; title-specific affordance details not verified. **Splendor (BGA edition):** most-played implementation; per-title UI specifics not verified — the official app (below) is better documented.

**Steal this**: (1) Tri-state cost icon language (live): red cross / amber check-with-price / green check on every buildable — adopt as the universal build-readiness signal. (2) Every action narrated in a persistent, scrollable game log + animated score markers. (3) Refresh-proof sessions — server-held state; reconnect resumes mid-turn with zero ceremony. (4) Interactive "learn while playing" tutorial plus community-editable strategy notes. (5) Copy-link invite from the table — keep it one click; BGA's 2024 regression complaints show what happens when you add steps.

**Avoid this**: (1) Expulsion-by-vote as the timeout mechanism — verified to feel bad and be gamed. On timeout: auto-pass or AI-substitute, never let opponents vote a leader out. (2) Hover-dependent card zoom on touch devices. (3) Making invites harder over time.

### Splendor — official app (Days of Wonder / Asmodee; iOS/Android, 2015; still distributed — appsmenow page updated 5 Oct 2026)

*Sources: AV Club app review (Keith Law, 2015 — FLAG old; the app's UI is largely unchanged since), Pocket Gamer (2015), TouchArcade launch + online-multiplayer update (2015/2016), HowLongToBeat user reviews (2024-ish), appsmenow gameplay-video index (updated Oct 2026). No verified 2024–2026 footage of the app itself found — footage searches return the physical game; flagged throughout.*

1. **Turn clarity** — Turn-based sequential; specific "your turn" visual/audio cue: not verified.
2. **Gain/loss feedback** — Token/card acquisition animations: not verified. Noble visits: not verified.
3. **Affordance — the benchmark pattern (2015, FLAG old)** — Bottom asset panel: your cards and tokens shown per colour with two numbers — larger = cards owned, smaller = tokens held (AV Club). Two-tier readiness highlight: on your turn, cards you can purchase now get a green boundary; after you take tokens or buy mid-turn, cards you could purchase next turn with your new purchasing power get a blue boundary. This "now vs. soon" distinction is the single best answer to "can't tell when you can build" in the benchmark. Tap any opponent's avatar to see their assets.
4. **Rules reference** — "Solid tutorial to teach you the short rules" (Pocket Gamer, 2015); UI/fonts "highly customizable" at launch (TouchArcade, 2015).
5. **Board focus** — Tabletop metaphor: cards and poker-chip tokens fill the screen; asset panel bottom-docked. Portrait-friendly by nature of the card grid. Tap targets/one-handed: not verified.
6. **Trading** — N/A (reservation is the interaction).
7. **Social** — Pass-and-play, online multiplayer (2016): ranked + unranked, cross-platform via Days of Wonder account, private password games. Karma system: quitting mid-game loses Karma; table creators can set minimum-Karma thresholds. Chat/emotes/mute/rematch/invite links: not verified.
8. **Juice** — Gem/token art is the juice; "sparkly" presentation. AI speed control exists (3x option). Win/celebration, sound/haptics: not verified.
9. **Accessibility** — Negative evidence: "The menus are hard to read because of the italic cursive font being used throughout" (HowLongToBeat ~2024) — still generating complaints nine years post-launch. Colour-blind/text-size/reduced-motion: not verified.
10. **Performance feel** — "The app must constantly save the game-state" — reviewer crashed several times pre-release and lost a game in progress only once across 30+ games (AV Club, 2015). AI turns had a "lull… even on 3x speed" (HowLongToBeat, ~2024).

**Steal this** (2015-verified, flagged — included because no newer Splendor-app source exists and the patterns are exceptional): (1) Green = buyable now / blue = buyable next turn readiness highlighting, recomputed live mid-turn. (2) Dual-number asset readout (big = permanent engine, small = liquid tokens) per good. (3) Karma-gated tables for ranked/async play. (4) Constant autosave as a design guarantee (2015!).

**Avoid this**: (1) Decorative italic/cursive fonts in functional UI — still generating readability complaints in 2024. (2) AI pacing with only a 3x band-aid.

## A3. Mobile polish benchmarks

### Offsuit — iOS poker (north star; deeper dive)

*Evidence: designer Sam's launch writeup (Product Hunt, 2023) — https://www.producthunt.com/products/offsuit-poker/launches/offsuit-poker?comment=2369474 · review/feature roundup, updated Dec 16, 2025 — https://game-solver.com/offsuit-texas-holdem-poker/ · changelog through v2.7.1 (Sep 12, 2025) — https://offsuit-poker-offline-ios.soft112.com · Google Play listing — https://play.google.com/store/apps/details?id=com.offsuit.offline&hl=en-US*

1. **Turn clarity** — Not verified in detail (no public gameplay teardown). Poker's turn = action on you; reviews never complain about missing turns, but DO complain AI turns are slow with no speed control and ask for pre-fire fold/check ("Just let us pre-fire a fold or check before our turn so games can move faster," game-solver reviews, Dec 2025). (Inferred: your-turn state is clear; the gap is pacing, not signalling.)
2. **Gain/loss feedback** — "The animations and chip movements make every hand feel intense and cinematic" (game-solver, 2025). Winning cards highlight at showdown — but a bug report says non-winning cards also glow ("random cards that are not part of the win glow up and it becomes very confusing"). Hand reveals added v2.3.1 (Oct 2024). Exact durations: not verified.
3. **Affordance** — Legal actions (fold/check/call/raise) appear only on your turn (inferred, poker-standard). A win% calculator displays automatically; one reviewer asked to swap win% for pot odds, implying stats are always-on by default. Stat tracking expanded v2.7.1 (Sep 2025): VPIP, PFR, ATS, 3-BET, 11 metrics.
4. **Rules reference** — Hand-rankings cheat sheet added v2.2.1 (May 2024) — the direct precedent for a costs card. Reviewer: "We had no idea how to play poker now we cant stop playing" (2025) — first-60-seconds works. No account needed to start (Product Hunt, 2023); "no waiting for games."
5. **Board focus** — Portrait-first: "we love playing and holding our phone normally instead of rotating it" (2025 review). Table = oval with seats around it, pot/community cards centre, your cards bottom. Tap targets: not verified.
6. **Trading** — N/A. Friend invites exist; one reviewer reports adding friends always errors with "internet connection problem" (2025).
7. **Social** — Emotes, card backs, avatars added v2.3.1 (Oct 2024); private tables + friend play; global leaderboards (weekly); Discord community. In-app chat: explicitly requested by reviewers ("It needs chat though") — not present.
8. **Juice** — "absolutely hooked. love the sound design as well" (Product Hunt comment, 2023). Chip movements described as cinematic (2025). Motion timings: not verified. Haptics: not verified.
9. **Accessibility** — Not verified (no colour-blind/text-size/reduced-motion documentation found).
10. **Performance feel** — "matchmaking is super fast" (2025). Offline AI Arena works without internet. Critical gap: "if the app restarts while youre in a tournament, it doesnt go back into the tournament, you just lose" — no session restore (2025 review).

**Why it feels premium (deeper):** the verified on-screen inventory is table, seats, pot, cards, action buttons, stats — and the praise is uniformly about absence: "super minimal no clutter, no random buttons, no weird pop-ups. Just poker"; "No extra tinsel, no piles of gold. Just a simple poker game with a clear design"; "If Apple designed a seamless poker app, this would be it. No bombing of pop up ads clean interface when betting" (game-solver, Dec 2025). The maker's 2023 launch copy lists the subtractions as features: "No constant pop-ups · No account needed · No waiting for games · No fake felt or neon." Hierarchy reviewers describe: big tabular numerals for pot/stacks (inferred from poker convention), quiet labels for actions. Premium = restraint + one considered sound design + correct-feeling chip motion. Drift risk: by 2025 the game added seasons, hero drops, lucky reels, fortune wheel (v2.6.1, May 2025) — reviewers still praise minimalism, but the feature surface is growing.

**Steal this**: (1) Hand-rankings-style cheat sheet, one tap, mid-turn (v2.2.1, May 2024) — the exact answer to "no quick-reference costs card": outpost, stronghold, path and fortune costs on one panel, reachable without leaving the board. (2) Refusal list as a design spec — write Emberisle's equivalent ("no banners, no forced tutorial, no casino chrome") and hold it. (3) Auto-visible odds/stats — win% shown by default taught novices; Emberisle equivalent: glanceable "what would this build cost / what do I gain" readouts. (4) Portrait-first one-hand play as a praised, deliberate property.

**Avoid this**: (1) Wrong-highlight bug — non-winning cards glowing confused players (Dec 2025). For Emberisle: when hexes pay out, highlight ONLY the paying outposts/strongholds — a mis-highlighted hex destroys trust. (2) No speed control for AI turns — the #1 recurring complaint. (3) No crash/mid-tournament restore — Emberisle (PWA!) must restore game state on reload. (4) AFK players auto-fold 3–4 times before removal — keep away-timers short and visible.

### Balatro (mobile, launched Sep 26, 2024)

*Evidence: iPhone in Canada mobile review (Sep 25, 2024) — https://www.iphoneincanada.ca/2024/09/25/balatros-ios-android-release/ · Engadget mobile port review (Sep 2024) — http://www.Engadget.com/gaming/balatro-is-an-almost-perfect-mobile-port-163050971.html · AV Club on scoring presentation (Nov 2025) — https://www.avclub.com/balatro-hones-the-art-of-making-numbers-go-up · Gazettely review (Feb 2024) — https://gazettely.com/2024/02/games/balatro-review/ · gameplay: eskil_tv 150-jokers run (Aug 16, 2026) https://www.youtube.com/watch?v=CaGx921vMus; retroglitched economy run (~Apr 2026) https://www.youtube.com/watch?v=7q-77nDpJzg*

1. **Turn clarity** — Single-player; the "turn" is the Play/Discard decision. Play/Discard buttons only meaningful with cards selected (inferred; community portrait mod v2.2.0 Jun 2026 documents swipe-up-to-play / swipe-down-to-discard with the same guards — https://github.com/shaggylorean/balatro-portrait-mobile/commit/4a0fb7c56896de08ecedefd94f8f42f373a607e7, FLAG: community mod, not official).
2. **Gain/loss feedback** — The genre benchmark for "gains don't flash by." Each scoring card triggers a popup + "a punchy kick" of iPhone haptic per card; returning cards to deck fires "quick succession of haptics" (iPhone in Canada, Sep 2024). Score popups scale ~1.3x in the portrait mod (Jun 2026). Audio: "satisfying dings of chips raining down mix with ascending synth chords" during big scores (Gazettely, Feb 2024). Scoring is staged left-to-right, card by card — never instantaneous (inferred; ms not measured).
3. **Affordance** — Tap-to-select cards on mobile; Planet/Arcana cards must be dragged to use. Floating hand preview shows detected hand name + level + chips × mult, with a pulse animation when the detected hand changes (portrait mod, Jun 2026 — community). Selected cards lift (inferred).
4. **Rules reference** — Poker-hand knowledge assumed; in-game collection + run info screens document jokers (inferred). No formal tutorial cited — not verified.
5. **Board focus** — Landscape-first design squeezed to portrait; official build playable but community mod notes "PC-sized targets were below Android minimums" for Use/Sell buttons (Jun 2026). Engadget (Sep 2024): text readable on large phones, "less so on tiny devices"; drag-and-drop feels better than mouse; foldables ideal. One-handed portrait play works via tap (2024).
6. **Trading** — None.
7. **Social** — None in-game.
8. **Juice** — Constant ambient motion: "Everything is in constant, trippy motion… the UI ever so slightly wiggles; in the shop, cards gently sway; booster packs glimmer with a picturesque sheen; CRT scan lines and digital noise" (AV Club, Nov 2025). Restraint pattern: ambient wiggle is low-amplitude; spikes happen only on scoring. Single looping acid-rock track. Haptics: per-card kicks on iPhone (Sep 2024) — the strongest mobile-haptic reference in this set. Win: run completion → unlocks screen; endless mode offered.
9. **Accessibility** — High Contrast Cards option built in (Engadget, Sep 2024) — also helps non-colour-blind players distinguish suits. Text size / reduced motion / screen reader: not verified.
10. **Performance feel** — "Boots up nearly instantly… even when you're smashing antes while pushing your score deep into scientific notation, the game doesn't get bogged down" (Engadget, Sep 2024). Cloud saves + multiple profiles. No disconnect handling needed (offline).

**Steal this**: (1) Per-card haptic kicks during staged scoring — for Emberisle: when a roll pays goods, pulse each paying outpost in sequence with a light haptic + tick sound, not one bulk toast. (2) Floating selection preview with change-pulse — the model for a "selected build → cost/output" preview chip that pulses when your tap selection changes hexes. (3) Faint outlines for empty slots = capacity readable at a glance — ghost outlines for unbuilt outpost spots. (4) Ambient low-amplitude motion + spike only on moments — board-first calm, celebration on payouts/wins.

**Avoid this**: (1) PC-sized tap targets shipped to phones — the community had to scale Use/Sell buttons 1.4x to reach Android minimums (Jun 2026). Spec 44 px+ targets from day one. (2) Tiny-device text legibility flagged at launch — test goods counts on small phones.

### Marvel Snap (mobile)

*Evidence: emotes guide (Dexerto, crawled Oct 2026; article likely 2022 — FLAG older, mechanics verified current via Fandom wiki crawled Aug 2026) — https://www.dexerto.com/gaming/marvel-snap-emotes-1998276/ · https://marvelsnap.fandom.com/en/wiki/Emotes · snap mechanic guide (Digital Trends, 2022 — FLAG older, mechanic unchanged per 2026 sources) · Alliances/chat (2024) — https://csrlm.com/new/marvel-snap-introduces-alliances-enhanced-gameplay.html · gameplay footage (Sep 2026): https://www.youtube.com/watch?v=mSRzMU26wTc (2:24); https://www.youtube.com/watch?v=2Iq8yUBc1w8 (3:31); https://www.youtube.com/watch?v=UdQMf_yTKCA (2:51)*

1. **Turn clarity** — Simultaneous turns: both players act, then hit END TURN; resolution when both lock (Digital Trends, 2022 — mechanic confirmed current by 2026 footage). Turn banner + energy refill each turn (inferred from footage).
2. **Gain/loss feedback** — Power totals flip with punchy animation at each location on reveal; cube count at top doubles on Snap (2→4→8). Retreat = instant loss for 1 cube. Visual timing not measured.
3. **Affordance** — Energy cost printed on the card (top-left gem); cards you can't afford are dimmed/undraggable (inferred, genre-standard). Energy bar refills to turn number each turn.
4. **Rules reference** — Tutorialized first matches vs AI; card text is full-rules on the card (inferred). Not deeply verified.
5. **Board focus** — Portrait, one-handed: 3 locations across the top half, hand along the bottom, drag up to play (inferred from footage). Matches run ~3 minutes (gaming.news, Mar 2025).
6. **Trading** — None; the Snap is the negotiation: a public bet/retreat decision (double-or-retreat) that is the game's social pressure valve.
7. **Social** — 5 picture emotes via tapping your avatar top-left in-match; mute via tapping opponent's avatar → mute (Dexerto; Fandom, Aug 2026). Alliances (2024): 30-player guilds with in-game chat, shared bounties. No open text chat in matches.
8. **Juice** — Card slam, location reveals with zoom, variant art; snap animation with screen shake (inferred from footage). Win celebration: cube gain animation. Ms not measured.
9. **Accessibility** — Not verified.
10. **Performance feel** — Short matches = natural reconnect granularity; specific reconnect behaviour not verified.

**Steal this**: (1) Cost on the object — energy number on every card, always visible; Emberisle: print build costs on the build buttons themselves, never only in a reference panel. (2) Simultaneous commit (END TURN) as a turn-clarity pattern — a single big, always-visible commit control that changes state when locked. (3) Snap as public commitment — a one-tap, high-drama bet gesture with instant visual payoff; model for a high-stakes trade or wayfarer moment. (4) Avatar-tap emotes + per-opponent mute — zero-chrome social (no chat box); mute discoverable in two taps.

**Avoid this**: (1) Retreat math is subtle (snapping when "unlosable" actually costs cubes because the opponent retreats) — any bet/double mechanic's edge cases must be tutorialized. (2) Emote set is tiny and meaning is player-invented — don't mistake emotes for communication.

### Hearthstone (mobile)

*Evidence: turn-timer rules (wiki, crawled Sep 2026) — https://hearthstone.fandom.com/wiki/Advanced_rulebook · rope discussion (Blizzard forums, Apr 2024) — https://us.forums.blizzard.com/en/hearthstone/t/rope-mean-nothing/126119 · phone-UI port writeups (2015 — FLAG old) · gameplay: funkimonki (~Jun 8, 2026) https://www.youtube.com/watch?v=Hpekqnb91qw; BonMarroe (Sep 18, 2026) https://www.youtube.com/watch?v=gaT9RGXus84*

1. **Turn clarity** — Best-in-class, three layers: (a) full-screen "YOUR TURN" splash at turn start; (b) the End Turn button on the right edge glows/pulses during your turn; (c) a 75-second turn timer with the famous burning rope appearing at ~15 s remaining (wiki; Apr 2024 forum thread confirms current). Turns 1–2 are shorter (~60 s).
2. **Gain/loss feedback** — Damage numbers slam, minions explode, golden cards; mana crystals refill with animation at turn start. Known wart: animations eat into the 75 s server timer, so long animation chains can skip the opponent's whole turn (wiki) — a polish bug that became a griefing vector.
3. **Affordance** — Playable cards lift/glow green when you have mana; hero power highlights when usable (inferred, long-standing design). Mana shown as filled crystals + number on phone UI (PhoneArena, 2015 — FLAG old).
4. **Rules reference** — Forced tutorial missions for new players (inferred). Card keywords with long-press detail (inferred).
5. **Board focus** — Phone UI (2015, FLAG old): hand pushed to the screen edge, tap to zoom into a "hand drawer"; mana as a number at the side. Still landscape on phones. One-handed: tap-to-expand then drag (inferred).
6. **Trading** — None.
7. **Social** — Emotes ("Greetings," "Well played") via hero portrait; squelch/mute (inferred). Friend matches (inferred).
8. **Juice** — Legendary entrance animations, pack-opening ritual. Rope burn with accelerating audio is the iconic urgency cue (Apr 2024 forum confirms still the reference). Ms not measured.
9. **Accessibility** — Not verified.
10. **Performance feel** — Disconnect during a turn can forfeit; mobile data drops mid-animation are a known pain (inferred).

**Steal this**: (1) The three-layer turn signal (banner + glowing commit button + escalating timer) — the single best answer to "not obvious when it's your turn": a turn banner AND a persistent glowing "your move" affordance, not just one. (2) Rope-style urgency escalation — calm for most of the window, audio-visual burn in the last stretch; a fixed, generous timer with a dramatic final-seconds treatment beats a constantly blinking one. (3) Tap-to-zoom hand drawer for small screens — a pattern for fortune cards on narrow phones: collapsed strip, tap to fan out large.

**Avoid this**: (1) Animations consuming the turn clock (wiki-documented) — never let celebration animation eat into the next player's decision time; queue juice outside the timer. (2) Roping as griefing — a visible timer with no anti-stall design invites stalling; default sensible timers, and don't punish fast players for slow ones.

### Pokémon TCG Live (mobile) — the cautionary benchmark

*Evidence: gameplay (Nov 1, 2025) — https://www.youtube.com/watch?v=5KCXfQx4cIU · patch archive incl. iOS slowdown fixes (Mar 2024) & Learning Lab lessons (Mar 2026) — https://www.perfectly-nintendo.com/pokemon-tcg-live-pc-mobile-all-the-updates/ · Pocket Tactics on iOS perf (2024) — https://www.pockettactics.com/pokemon-trading-card-game-live/broken · community perf complaints (2026) — https://community.pokemon.com/en-us/discussion/comment/5404 · launch report (Jun 2023) — https://www.dicebreaker.com/games/pokemon-trading-card-game-live/news/pokemon-tcg-live-released-on-pc-and-mobile*

1. **Turn clarity** — Turn banner exists (inferred from footage); but the top community complaint is opponent turns take far too long ("I feel like I can play 5 games of [Snap] in the time it would take to do one game of this" — famiboards; complaint persists per 2026 posts). Turn clarity is fine; turn pacing is the failure.
2. **Gain/loss feedback** — Prize-card takes, KO animations (inferred from footage). Holographic VFX patched/added Mar 2024. Not measured.
3. **Affordance** — Legal actions highlighted; energy attach flow guided (inferred). Not verified in text.
4. **Rules reference** — Learning Lab lessons added Mar 2026 (patch 1.36.0) — onboarding retrofitted years after launch. Tutorial existed at launch.
5. **Board focus** — Cramped on phones; "UI that seems incompatible with humans" (htxt.co.za, 2023 — FLAG older). Active/bench layout carries over from PC.
6. **Trading** — None (trading removed vs the old client — a removal players still resent).
7. **Social** — Avatars, ranked ladder; no meaningful chat (inferred).
8. **Juice** — Holographic card VFX improved Mar 2024; otherwise minimal celebration vs the IP's potential (inferred).
9. **Accessibility** — Not verified.
10. **Performance feel** — The anti-pattern archive: iOS main-menu slowdowns (patched Mar 2024); official recommendation of iPhone 11 or newer with overheating/battery reports on 11/12/13/14 (Pocket Tactics, 2024); "phone heats up… battery loses 30-40% a match" (famiboards); 2026 community thread: "unstable and slow… random errors daily… a massive downgrade" vs the old client. Store ratings ~2.8–2.9 (cited in academic paper, 2024). This is what "feels sloppy" looks like at scale.

**Steal this**: (1) Learning Lab (Mar 2026): bite-size, named lessons added post-launch — ship a minimal tutorial and grow a lesson list; small topical entries, not a rewritten tutorial. (2) Kept parity with the physical game's rules, which preserved trust with enfranchised players.

**Avoid this**: (1) Shipping a rewrite that performs worse than its predecessor — "a massive downgrade" (2026 community). Every animation added must keep frame budget; perf regressions read as "sloppy" faster than any UI choice. (2) No thermal/battery budget on mobile — overheating + 30–40% battery per match. Cap particle counts and background animation on phones. (3) Daily random errors / game-breaking interactions (2026) — correctness bugs in core rules erode trust more than missing features. (4) Opponent-turn dead time with no pacing design — give watchers a live view of the acting player's options resolving in real time.

### Clash Royale (mobile, real-time)

*Evidence: elixir mechanics (wiki) — https://clashroyale.fandom.com/wiki/Elixir · Google Play editorial on elixir (crawled Aug 2026) · emotes/mute (Dot Esports, Aug 4, 2026) — https://dotesports.com/general/news/how-to-unmute-emotes-in-clash-royale · gameplay (Nov 23, 2025) — https://www.youtube.com/shorts/7diCyIPR77w*

1. **Turn clarity** — Real-time: no turns. Clarity comes from the elixir bar (bottom): starts at 5, max 10, fills 1 per 2.8 s; 2x elixir at 2:00, 3x in the final minute; match timer top-center with overtime/tiebreak. "It's always your turn" — the design problem is pacing, solved by the accelerating elixir economy.
2. **Gain/loss feedback** — Tower explosions, crown popups (1 per princess tower, 3 + instant win for king tower), elixir-drop pings. Damage numbers on towers tick live. Ms not measured.
3. **Affordance** — Cards on the elixir bar gray out when unaffordable and light up the moment they become playable — the purest "can I do it now" signal in this set; next-card preview ("next" slot) enables planning. Placement validity shown by live deploy radius (inferred from footage).
4. **Rules reference** — Training camp + card info on tap (inferred). Not verified in recent text.
5. **Board focus** — Portrait, one-handed by design: arena fills the screen, hand is a 4-card bar at bottom thumb reach, emote bubble bottom-left. The whole game is playable with one thumb (inferred; widely attested).
6. **Trading** — None.
7. **Social** — Emotes: speech-bubble button bottom-left opens emote deck + text bubbles; mute via prohibition icon in the same panel (Dot Esports, Aug 2026); 100-emote-per-battle anti-spam cap; clan chat with emote pages. No open chat with opponents.
8. **Juice** — Troop deploy poof, tower rubble, king-tower activation; x2/x3 elixir announcements; sudden-death mode. Ms not measured.
9. **Accessibility** — Not verified.
10. **Performance feel** — Real-time PvP demands low latency; specific reconnect behaviour not verified.

**Steal this**: (1) Gray-until-affordable on the action bar — build buttons in a persistent bottom bar, dimmed with cost shown, lighting up the instant goods suffice. (2) "Next" preview slot — show what's coming (next phase, next build unlock) in a small preview. (3) Accelerating economy as pacing (2x/3x elixir) — pace through economy, not dialogs. (4) One-thumb portrait layout — primary actions in the bottom third; board fills the rest.

**Avoid this**: (1) Elixir-leak pressure (max 10, wasted overflow) is core to CR but would be anxiety-inducing in a chill board game — don't import resource-cap pressure. (2) Emote spam as tilt weapon exists despite the 100/battle cap — default reactions to tasteful and make mute one tap.

### Royal Match (mobile match-3)

*Evidence: design analysis (Tiffany Tsang, Feb 2026) — https://medium.com/@tsangtiffany/royal-match-a-winning-combination-21312179e366 · ad/design breakdown (PocketGamer.biz) · booster guide (Google Play editorial, crawled Nov 2025) · gameplay: strategy (~Sep 23, 2026) https://www.youtube.com/watch?v=2NQMmvKrOXA; walkthrough part 3 (~Sep 21, 2026) https://www.youtube.com/watch?v=mmwdxeJQ9vA*

1. **Turn clarity** — Move-based: moves counter top; level goal icons top; "no moves left" state unmistakable (inferred from footage). No timer pressure by default.
2. **Gain/loss feedback** — Cascading matches with combo escalation (TNT → rocket → light ball); win = coin fountain + star fill + King Robert celebration. "Responsive haptics and crisp animations… every match feels tactile; basic actions become small moments of delight" (Medium, Feb 2026). Ms not measured.
3. **Affordance** — Boosters sit beside the board, tappable with clear counts; pre-level booster select on hard levels. Combos are made, not menu-picked — affordance through play (inferred).
4. **Rules reference** — Mechanics introduced one per level set with guided first use (inferred). New obstacles named in-level.
5. **Board focus** — Portrait, board-first: "clear silhouettes and strong contrast make tiles and obstacles instantly readable" (Medium, Feb 2026); deep-black background vs bold matchables (PocketGamer.biz). Rounded forms, no sharp edges. Fully one-handed.
6. **Trading** — None.
7. **Social** — Teams, leaderboards, Facebook friend challenges; King Robert as a parasocial character whose emotions respond to gameplay (PocketGamer.biz) — a mascot that reacts to your play, no chat needed.
8. **Juice** — Combo chain reactions with rising pitch; level-complete sequence: moves→coins conversion, stars, chest. "Beautifully simplistic systems (simple is hard!)" (mobilegamer.biz, 2023 — FLAG older). Win celebration is multi-beat, never a single popup. Ms not measured.
9. **Accessibility** — High-contrast colour design (PocketGamer.biz); dedicated colour-blind/text options not verified.
10. **Performance feel** — 100% ad-free, no wifi needed (store listing) — offline-first; load-to-play near-instant (inferred).

**Steal this**: (1) Multi-beat win celebration — convert leftovers → coins → stars → chest in sequence; Emberisle: on victory, stage it — final goods tally, then longest-path/stronghold reveals, then the win banner. Never one modal. (2) Character that reacts to gameplay (PocketGamer.biz) — a wayfarer or herald figure whose posture reflects game state (winning, blocked, waiting); presence without chat. (3) Contrast-first readability — hexes/goods read by shape + strong contrast before colour. (4) 100% ad-free, offline-capable as a premium signal — suits a PWA.

**Avoid this**: (1) Booster-before-level upsell pattern is monetization chrome — the exact "extra tinsel" the north star forbids. (2) Sequel/feature creep dilutes the thing that worked (Royal Kingdom "trying to be a little too much," gamigion 2025) — guard Emberisle's scope the same way.

### Monopoly GO (mobile board game — closest structural relative)

*Evidence: multiplier UI guide (TheGamer, ~Jul 2024 — FLAG older, UI confirmed current by 2026 footage) — https://thegamer.com/monopoly-go-dice-multiplier-tips-how-to-use-guide · gameplay: Lola Bunny session (Sep 8, 2026) https://www.youtube.com/watch?v=xwB41p8SQ9E; Trick-or-Treat dice duels (Sep 30, 2026) https://www.youtube.com/shorts/Vi7Enqym7sc; Quick Wins (Sep 1, 2026) https://www.youtube.com/watch?v=3UOc-ZnXxr8 · Monster Mash season (GameSpot, Sep 2026)*

1. **Turn clarity** — Solo-paced: the giant "GO!" button bottom-center is the entire turn — it pulses/bounces when a roll is available (inferred from footage). No timer; your turn is whenever you tap. The closest analog to Emberisle's "is it my turn" problem, solved by making the action control enormous and central.
2. **Gain/loss feedback** — Dice tumble, token hops tile to tile, rent/cash erupts in coin fountains; Bank Heist and Shutdown are full mini-scenes. Multiplier (x2–x100+) scales the celebration. Ms not measured.
3. **Affordance** — Dice multiplier in the small orange/purple circle beside the GO button; purple = max affordable; flickering lights during High Roller events (TheGamer, 2024). Build/upgrade prompts appear contextually on owned tiles. Cost and stake visible at the point of action.
4. **Rules reference** — Mr. Monopoly guides; first board tutorialized (inferred). Not verified in recent text.
5. **Board focus** — Portrait; the 3D board is the screen, token and dice front and center; menus collapse to edges. One-handed: everything is the GO button + tile taps.
6. **Trading** — Sticker trading with friends/Facebook groups (real trading of collectibles!); Shutdowns/Heists are take-that vs friends' boards; Community Chest co-op. The only game in this set with genuine trading — asynchronous, gift-based, social rather than a trade UI.
7. **Social** — Friend leaderboards, co-op Partner events, sticker gifting/trading, invite links (30–100 dice per invite per community guides). No open chat with strangers; Facebook groups handle trading talk.
8. **Juice** — The genre's juice maximalist: dice physics, coin showers, landmark build animations, seasonal reskins (Monster Mash season Sep 23–Nov 25, 2026, with KPop Demon Hunters + Ghostbusters crossovers — GameSpot). New dice duel feature (Sep 2026). Haptics on roll: not verified.
9. **Accessibility** — Not verified.
10. **Performance feel** — Quick session granularity (roll a few times, leave); event timers drive return visits. Reconnect specifics: not verified.

**Steal this**: (1) The enormous single action control — one giant GO button = zero ambiguity about what to do next; when it's your turn, one primary control (Roll / End turn) should dominate the bottom of the screen. (2) Stake shown at the point of action (multiplier circle beside GO) — roll/build controls carry their stakes inline. (3) Asynchronous, gift-based trading (stickers with friends) rather than a live trade UI — simple offer/accept flows over real-time haggling chrome. (4) Tile-counting as skill expression — readable board geometry is gameplay depth; keep hex math legible.

**Avoid this**: (1) Juice maximalism as default — coin fountains for everything trains players to ignore feedback; reserve big celebrations for wins and rare payouts. (2) FOMO event stacking (4+ concurrent systems in Sep 2026 footage) is engagement chrome that fights "remove chrome by default."

### Mini Motorways (Dinosaur Polo Club — the minimal-elegant pick)

*Evidence: Steam page incl. palettes & Creative Mode (crawled Jun 2026) — https://store.steampowered.com/app/1127500 · Eurogamer review (design) · Creative Mode iOS first look (Sep 1, 2025) — https://www.youtube.com/watch?v=Tg5cjzWQCOY · daily challenge (Aug 19, 2025) — https://www.youtube.com/watch?v=5TWXCaxJQdg · Gaming Nexus review (crawled Oct 2026) · Redbrick review (accessibility)*

1. **Turn clarity** — Real-time, no turns: the "turn" is the weekly upgrade choice — a forced pause with 2 upgrade cards (inferred).
2. **Gain/loss feedback** — Trips tick the score counter; failure is a slow, readable cascade (pins pile up), never a jumpscare — "the often-sudden transition from meditative to manic" (Gaming Nexus). Score is a single number, always visible.
3. **Affordance** — Tools (road/bridge/motorway/roundabout) as a minimal bottom palette with counts; dragging previews the road in a contrasting colour before commit (inferred from footage). Upgrades offered as explicit A/B choices weekly.
4. **Rules reference** — "Watch a 30 second clip of the game and you understand almost everything you need to play" (Gaming Nexus). Rules are visible — colour-matched houses and stores — not explained.
5. **Board focus** — The purest board-first game here: the map IS the UI; palette tools overlay nothing. Houses read as two colour strips; stores read via shadow. Night mode + colour-blind palettes per map (Steam). Drag-to-draw roads; pinch zoom on larger maps (inferred).
6. **Trading** — None.
7. **Social** — Daily/weekly challenges with leaderboards; GIF export of city layouts for sharing (Steam). No chat.
8. **Juice** — "Chilled tumbler of pips and muttering hums and clicks and whistles and honks" — a responsive soundtrack by Disasterpeace that grows with the city (Eurogamer; Steam). Cars' headlights in Night Mode. Juice is ambient and systemic, not event-based. Win = score + leaderboard; failure = the city visibly choking.
9. **Accessibility** — Colour-blind and Night mode palettes selectable per map (Steam; Redbrick). Caveat: the colour-blind palette has documented criticism — a Steam forum thread (2021, FLAG older) found yellow/green houses still confusable and recommended night mode as a second opinion. Lesson: ship the palette, but test it with actual colour-blind players.
10. **Performance feel** — Tiny install (~350 MB on Steam; far less on mobile), instant load (inferred). No signal dependency (Apple Arcade offline).

**Steal this**: (1) Rules made visible, not explained — colour-matched houses/stores teach the game in 30 seconds (Gaming Nexus); hex number tokens + goods icons should teach payouts at a glance. (2) Single always-visible score as the only persistent number — one victory-progress readout, permanently on screen; everything else contextual. (3) Responsive ambient audio that grows with game state — music/stingers that intensify as the game progresses. (4) GIF/layout export for sharing (Steam) — one-tap "share this board" image = free social + win celebration.

**Avoid this**: (1) Colour-blind palette shipped without adequate testing — an accessibility checkbox that doesn't survive real dichromacy is worse than none. Test Emberisle's goods palette under simulation and with players. (2) "One map at a time" save limitation frustrated players (Gaming Nexus) — for the PWA: support multiple concurrent games/saves from the start.

## B. Top 25 UX patterns Emberisle should adopt

Ranked by impact ÷ effort. IDs: T = turn clarity, G = gains, A = affordance, R = reference/onboarding, B = board focus, TR = trading, S = social, J = juice, AX = accessibility, P = performance feel. Every proposal uses polish.md tokens; viewports are 390×844 and 360×640 portrait, 844×390 landscape, 1280×720 desktop.

### T-1. Three-layer turn signal: arrival motion + persistent glow + chime at the moment

- **Who does it:** Hearthstone — full-screen "YOUR TURN" splash + End Turn button glowing/pulsing on the right edge + 75 s timer with burning-rope escalation in the last ~15 s (wiki crawled Sep 2026; Blizzard forum Apr 2024 confirms current). CATAN Universe — context-sensitive primary button that is "Roll" then "End turn," inactive otherwise (community skill doc ~Jul 2026). Monopoly GO — one giant GO button bottom-centre pulsing when a roll is available (footage Sep 2026, inferred). Marvel Snap — always-visible END TURN anchor.
- **Emberisle today:** accent-tinted glass banner (`src/components/game/Hud.tsx:308`, `data-testid="turn-banner"`), tab title "● Your turn — Emberisle" (`src/lib/turn-title.ts:5`), `TurnCountdown` chip. The banner is static — no arrival motion, no persistent glow on the action. A your-turn chime exists (`yourTurn()`, `src/lib/sound.ts:88`) but it reuses the `chip_gain` click with a 30 ms buzz rather than a dedicated turn-change sound.
- **Proposal:** on turn change to you: (a) the banner slides in — translateY 8 px → 0, opacity 0 → 1, 220 ms `--ease-out`; (b) the primary action (Roll, then End turn) becomes the single Primary button and breathes — box-shadow pulse 1.2 s sine loop in your seat colour; (c) the turn-change moment gets a dedicated chime. A `yourTurn()` exists today (`src/lib/sound.ts:88`) but it reuses the `chip_gain` click and fires a 30 ms buzz — the proposal is: add a real `ui_your_turn` entry to the cue map (`server/cue.mjs`) instead of the reused click, fire it exactly once at the turn-change event, −6 dB under piece sounds, and set its haptic to 15 ms (down from 30 ms). The banner copy is verb-first (T-3): "Roll the dice" / "Build, trade, or end your turn". When it is not your turn, the banner names the actor and the seat dot carries a 3 px ring in their colour (see T-2).
- **Viewports:** 390×844 / 360×640 — banner full-width glass chip, 16 px radius, 12 px x / 8 px y padding, `text-body` 15 px; primary action 48 px tall, full width, bottom-anchored above the hand. 844×390 — banner top-left, primary action pinned bottom-right 48 px. 1280×720 — same as landscape, banner top-centre.
- **Reduced motion:** no slide, no pulse — banner appears instantly with a 2 px `sea-ink` left border; chime still plays.
- **Completion test (Playwright):** in hotseat, end a turn; within 300 ms assert `turn-banner` text starts with "Your turn", computed `transform`/`opacity` transition is running (or instant under reduced motion), and the audio stub received `ui_your_turn` exactly once. Fail if the chime fires more than once per turn change or the banner takes > 400 ms to reach full opacity.

### T-2. Seat-level current-turn marker that survives the banner

- **Who does it:** BGA — current player's panel highlighted + status line ("you must select…", live 7 Wonders wiki). Colonist.io — active-player panel highlighted per the Jun 2026 Rush blog's "what is each player allowed to do right now" reframe.
- **Emberisle today:** the rail/strip shows seats; the current seat has an accent border on desktop (`Hud.tsx` rail, `state.current`), but below `md` the rail was historically hidden (fixed by #172 work) and there is no persistent "who is acting" mark independent of the banner.
- **Proposal:** every seat chip (rail, phone strip, lobby, trade toast, win rows) carries a current-turn ring: 3 px solid in the seat's colour + seat mark, 8 px offset glow at 20 % opacity. On the phone strip the acting seat's card also rises 2 px (translateY −2 px, 150 ms `--ease-out`). It is always visible, even when the banner is dismissed or the chat dock is open.
- **Viewports:** 390×844 — strip cards 44 px tall, ring inside the card edge; 360×640 — same, names truncate with ellipsis after 10 chars; 844×390 / 1280×720 — rail cards, same ring treatment.
- **Reduced motion:** ring appears with no rise animation.
- **Completion test:** in a 3-seat game, after each pass, assert exactly one `[data-current-turn="true"]` element exists and its seat id equals `state.current`; assert it is visible (non-zero box) at 390×844 and 1280×720. Fail on zero or two.

### T-3. Verb-first next-action copy in the banner

- **Who does it:** Colonist.io Rush (Jun 2026) — the UI's job is "what is each player allowed to do right now." BGA per-state prompts ("you must select…").
- **Emberisle today:** `turnText` (`Hud.tsx:184`) already varies by phase but is sentence-style; the polish remove-list wants one short sentence in one voice.
- **Proposal:** the banner always leads with the verb: "Roll the dice", "Place an outpost — tap a glowing corner", "Build, trade, or end your turn", "Move the wayfarer", "Discard 3 goods". `text-body` 15 px, sentence case, no period. Setup phases name the piece and the gesture. This replaces the current longer instruction strings; How to play keeps the full rules.
- **Viewports:** identical copy at all sizes; at 360×640 allow two lines max, ellipsis beyond 90 chars (inferred cap — measure in proof).
- **Reduced motion:** n/a (copy only).
- **Completion test:** walk setup → roll → main → wayfarer in hotseat; assert banner text matches `/^(Roll|Place|Build|Move|Discard)/i` at each phase and contains no uppercase-tracked label. Fail on any phase showing the old two-sentence copy.

### G-1. Centre-screen "+2 Timber" gain moment, staged then faded

- **Who does it:** Balatro — each scoring card triggers a popup + iPhone haptic kick per card, staged left-to-right, never instantaneous (iPhone in Canada, Sep 2024; AV Club Nov 2025). Marvel Snap — power totals flip centre-screen at each location on reveal (footage Sep 2026). This is Jarrod's explicit ask.
- **Emberisle today:** gains flash `+N` green / losses `-N` red **on the hand card**, 1200 ms (`src/components/game/Hand.tsx:23`, `FLASH_MS = 1200`, `data-testid="resource-flash"`) — small, peripheral, and (per Jarrod) "flash by too fast."
- **Proposal:** on a roll's gains, show stacked lines centre-screen, just above the island's vertical centre: "+2 Timber", "+1 Clay" — `text-title` 20 px / 600, `fg` ink text on a glass chip (`rounded-chip` 16 px, 12 px x / 8 px y), each line led by a 12 px dot in the resource's fill token (timber `#2f6b3a`, clay `#b5522a`, wool `#8fbf5a`, grain `#e0b13a`, ore `#6e7580`) with the polish.md 1 px `black/10` inner ring. (Text is never set in the fill colour directly: wool and grain fills are ~2:1 on glass and fail 4.5:1; the dot carries the colour identity.) Sequence: lines appear staggered 120 ms apart, each rises 24 px and fades over 900 ms (`--duration-moment`), `--ease-out`; the whole stack is gone by 1.6 s. One `chip_gain` tick per roll at the first line's appearance (not per hex). The hand-card flash stays as the ledger (see G-3) — the moment never replaces it.
- **Viewports:** 390×844 — stack centred horizontally, top edge at 38 % of viewport height (never covering the island's middle third); max 5 lines, then "+N more". 360×640 — same, `text-body` 15 px if 4+ lines. 844×390 / 1280×720 — stack at 42 % height, `text-title` 20 px.
- **Reduced motion:** no centre moment at all — gains appear only in the ledger and the log.
- **Completion test:** rig a roll paying 2 timber + 1 clay; assert a centre-screen element containing "+2 Timber" appears within 300 ms of the roll, is fully transparent by 1.8 s, and the hand counts are correct throughout. Under `prefers-reduced-motion`, assert no centre element ever appears. Fail if the moment covers the island's centre third (assert its bounding box stays above the island hole's vertical centre).

### G-2. Paying pieces pulse in sequence with a tick — and ONLY the payers

- **Who does it:** Balatro — per-card haptic kicks during staged scoring (Sep 2024). Offsuit — the wrong-highlight bug: non-winning cards glowing at showdown "becomes very confusing" (Dec 2025 reviews) — the negative proof that precision matters.
- **Emberisle today:** paying hexes glow once after a roll (#441, `flash-prove`).
- **Proposal:** extend the hex glow to the pieces: each paying outpost/stronghold scales 1.0 → 1.12 → 1.0 over 280 ms (`--ease-snap`), staggered 90 ms per piece in seat order, with a soft tick sound and an 8 ms `navigator.vibrate` pulse (guarded) per piece. Only pieces that actually gained goods pulse — never the hex alone, never non-paying neighbours. Bank-short resources stay dark (already in `flash-prove`).
- **Viewports:** visual only on the 3D board; identical at all sizes. Ticks capped at 8 per roll (beyond that, one tick).
- **Reduced motion:** no scale pulse — pieces get a steady 1.2 s highlight hold instead; ticks still play (sound is not motion).
- **Completion test:** rig a roll where two outposts pay and one adjacent outpost does not; step the renderer's virtual clock and assert the two payers' scale peaks > 1.05 and the non-payer never exceeds 1.0; assert the audio stub got one tick per payer. Fail on any pulse on a non-paying piece.

### G-3. Every gain and loss is narrated in a persistent, scrollable log

- **Who does it:** BGA — every action narrated in a persistent scrollable game log + animated score markers (platform convention). Colonist.io — gains logged as typed game events ("Resource received from dice roll").
- **Emberisle today:** a log line exists in the HUD and the full game log lives in the chat dock (`docs/design/chat.md` — Chat/All filter, Copy log). The HUD's single log line can be missed.
- **Proposal:** keep the dock log as the persistent record; add one rule: every goods delta (roll gains, builds spent, steals, discards, trades, fortune plays) appends exactly one log line in one voice — "Tide gains 2 timber, 1 clay", "Ember spends 1 timber, 1 clay — path". Lines are `text-caption` 12 px, muted, newest at bottom, 200 kept. The HUD's single visible line always shows the latest line. No line is ever shown twice (no duplicate in banner + log + toast).
- **Viewports:** all — the dock log is unchanged; the HUD line is one line, ellipsis-truncated.
- **Reduced motion:** n/a.
- **Completion test:** play a scripted sequence (roll with gains → build a path → trade); assert the dock log contains one line per event in order, each matching the voice pattern `/^[A-Z][a-z]+ (gains|spends|steals|discards|trades|plays)/`, and no event produced zero or two lines. Fail on duplicates or missing lines.

### A-1. Cost on the button face; tap an unaffordable build to learn what's missing

- **Who does it:** Marvel Snap — energy cost printed on the card, always visible. Clash Royale — cards gray out when unaffordable and light up the instant they become playable. Monopoly GO — stake (multiplier) shown at the point of action (TheGamer 2024). TTR Marmalade — the negative: "enough cards but won't let us place them" (Dec 2025) — silent refusal is the failure.
- **Emberisle today:** build buttons show label + icon only; unaffordable = 50 % opacity (`Hud.tsx:95` `UNAFFORDABLE`); cost lives in the `title` tooltip — invisible on phones (`Hud.tsx:340-365`).
- **Proposal:** build buttons read "Path · 1 timber 1 clay", "Outpost · 1 timber 1 clay 1 wool 1 grain", "Stronghold · 3 grain 2 ore", "Fortune · 1 wool 1 grain 1 ore" — words in `fg` ink `text-body` 15 px, each amount led by its lucide icon set inside a fill-coloured chip using the resource's `-on` colour (polish.md: never text in the fill colour — wool/grain fail contrast on glass). Secondary-button treatment (44 px). Affordable: full opacity. Unaffordable: 50 % opacity AND tapping it shows a 16 px glass chip above the button for 1.6 s: "Need 1 clay" (the single scarcest missing good; "Need 1 clay, 1 wool" for two). The button stays focusable (`aria-disabled`, already the pattern). This is the polish.md "Actions as big soft tiles, worded as the action with its amount" direction, made concrete.
- **Viewports:** 390×844 / 360×640 — buttons wrap to two rows of two, full-width within the action row, 44 px tall; cost text may shorten to icons + counts ("1🌲1🧱" no — icons + numerals: [icon]1 [icon]1) below 360 px width. 844×390 / 1280×720 — one row, same 44 px.
- **Reduced motion:** the "Need X" chip fades in over 150 ms instead of sliding.
- **Completion test:** with 1 timber 0 clay, assert the Path button's accessible name contains "1 timber 1 clay"; tap it and assert a chip reading "Need 1 clay" becomes visible within 300 ms and hides by 2 s; give the player 1 clay and assert the button reaches full opacity without a page reload. Fail if the cost text is missing or the missing-good chip never appears.

### A-2. Tri-state readiness icons: green = build now, amber = possible with a trade, red = no

- **Who does it:** BGA 7 Wonders (live wiki, current) — red cross = can't gather the resources, yellow check + number = buildable via neighbours (number = cost), green check = buildable with your own resources. The clearest build-readiness language in the benchmark.
- **Emberisle today:** binary — affordable (full) vs not (50 % opacity). No "one trade away" state.
- **Proposal:** each build button carries a 16 px leading icon: green check (affordable now), amber "⇄1" (affordable if you trade at your best available rate — bank 4:1, dock 3:1/2:1 — the number is the goods you'd give), red cross (not affordable even with one trade). Tapping the amber state opens the trade panel pre-filled with the cheapest route. Icon has a text label for screen readers ("Path, affordable", "Path, one trade away", "Path, can't afford").
- **Viewports:** icon 16 px at all sizes; at 360×640 the amber number may drop, keeping the ⇄ glyph.
- **Reduced motion:** n/a (static icons).
- **Completion test:** script three hands (affordable / one-bank-trade-away / impossible); assert the three icon states appear on the Path button respectively, and tapping the amber state opens the trade panel with give/take pre-filled to the cheapest route. Fail if the amber state ever suggests a trade the bank can't pay.

### A-3. Two-tier highlight: what you can build now vs after this turn's gains

- **Who does it:** Splendor app — green boundary = purchasable now, blue boundary = purchasable next turn with new purchasing power, recomputed live mid-turn (AV Club, 2015 — FLAG old, no newer source; included because the pattern is exceptional and directly answers complaint #3).
- **Emberisle today:** no "soon" state.
- **Proposal (scoped):** during your main phase only, a build that is exactly one goods-gain away (i.e., affordable after any single legal bank/dock trade you could make right now) gets a 2 px `sea-ink` outline (blue = "soon") instead of the red-cross treatment. Recompute on every hand change. This is A-2's amber state made ambient — adopt A-2 first; A-3 is the zero-interaction version for the roadmap.
- **Viewports:** outline only; no size changes.
- **Reduced motion:** n/a.
- **Completion test:** with a hand one bank trade away from a path, assert the Path button has the "soon" outline and not the red-cross icon; make the trade and assert it flips to green-check within 300 ms. Fail if the outline appears during another player's turn.

### A-4. Ghost outlines so build capacity reads without tapping

- **Who does it:** Balatro portrait mod (Jun 2026, community) — faint outlines for empty card slots make capacity readable at a glance.
- **Emberisle today:** legal spots pulse in your seat colour when a build is armed (#437); unarmed, nothing shows capacity.
- **Proposal:** when it is your turn and your main phase, unbuilt outpost spots you could legally use show a 1 px dashed ghost ring at 25 % opacity in your seat colour; unbuilt path edges show a 2 px dashed ghost line. They never pulse (pulse is reserved for armed legal targets) and vanish the moment you arm a build or your turn ends. Setup phase keeps the existing pulse (first-time players need the stronger cue).
- **Viewports:** ghost ring radius 0.13 world units (same as the legal torus); at 390×844 the dashes must remain ≥ 1 px on screen at default zoom — the proof measures.
- **Reduced motion:** ghosts are static (they never animated anyway).
- **Completion test:** in main phase with an affordable outpost, screenshot the board and assert ghost rings exist at ≥ 1 legal corner and zero at illegal corners (neighbour rule); arm the outpost build and assert ghosts are replaced by pulsing legal marks within 300 ms. Fail on ghosts at illegal corners.

### R-1. One-tap costs card from the table menu

- **Who does it:** Offsuit — hand-rankings cheat sheet added v2.2.1 (May 2024); reviewers cite it as a learning driver. This is the direct north-star precedent for complaint #4.
- **Emberisle today:** costs live in one How-to sentence (`HowTo.tsx:59`) and an `sr-only` paragraph (`Hud.tsx:446`). No visible costs card.
- **Proposal:** the table menu gains a "Costs" row; it opens a `rounded-sheet` 24 card, `surface` fill, listing the four builds with resource icons in their fill colours: Path — 1 timber 1 clay; Outpost — 1 timber 1 clay 1 wool 1 grain; Stronghold — 3 grain 2 ore (on an outpost); Fortune — 1 wool 1 grain 1 ore; plus the bank rate line "Bank: 4 of one → 1 of another. Docks: 3:1, or 2:1 in their good." One primary "Got it" button; Esc/backdrop closes. It replaces nothing on screen by default — the menu already exists, satisfying "remove chrome by default."
- **Viewports:** 390×844 / 360×640 — sheet max-height 70 dvh, full-width minus 32 px gutters, scrolls internally. 844×390 / 1280×720 — centred sheet, max-width 420 px.
- **Reduced motion:** sheet appears instantly (no 280 ms settle).
- **Completion test:** open the table menu, tap Costs; assert the sheet lists all four builds with correct costs (text match), is fully inside the viewport at 390×844 and 1280×720, and Esc closes it returning focus to the menu button. Fail if any cost is wrong or the sheet clips.

### R-2. First-game inline coach: three steps, dismissible, never a modal

- **Who does it:** CATAN Classic — bite-size one-concept tutorials (Aug 2024 review) done right as a continuous flow (their failure was forcing a menu round-trip between lessons). Carcassonne — the warning: its tutorial never mentions farmers, "arguably the most crucial aspect of the game" (Meeple Mountain) — audit against strategic rules, not just mechanics.
- **Emberisle today:** How to play is a sheet; the phase sentence is the only inline teaching.
- **Proposal:** on a player's first-ever game (localStorage flag), show a 3-step inline coach in the banner slot: (1) setup — "Tap a glowing corner, then Place"; (2) first roll — "You gain goods when your numbers roll"; (3) first main — "Build when a button lights up — costs are in the menu". Each step shows once, advances on the action, and a quiet "Skip tips" dismisses forever. Never a modal, never blocking input. The coach covers the wayfarer on the first 7 ("Move the wayfarer to a new hex, then pick a victim") — the strategically crucial rule Carcassonne forgot.
- **Viewports:** coach text replaces the banner text; same sizes as T-1.
- **Reduced motion:** n/a.
- **Completion test:** fresh profile (cleared storage) in practice mode; assert step 1 text visible at setup, step 2 after first placement, step 3 on first main phase; complete a full game and start another — assert no coach text appears. Fail if any step blocks a legal tap (assert the board canvas still receives pointer events while a step is shown).

### R-3. Payout iconography audit: rules visible, not explained

- **Who does it:** Mini Motorways — "Watch a 30 second clip of the game and you understand almost everything you need to play" (Gaming Nexus) because colour-matched houses/stores make the rules visible.
- **Emberisle today:** number tokens are rimmed and legible (`tokens-prove`); the 6 and 8 read as hot. The link token → good → hand is carried by colour + icon.
- **Proposal:** a one-time audit (not a build): screenshot every hex at 390×844 and check a new player can answer "which good does this hex pay and how likely" from token + icon alone, with no text. Any hex that fails gets an iconography fix (token pip size, goods icon on the token face, or cap colour nudge) filed as its own XS. The audit itself is the deliverable here; fixes are children.
- **Viewports:** audit at 390×844 (smallest) — if it reads there, it reads everywhere.
- **Reduced motion:** n/a.
- **Completion test:** the audit doc lists all 6 terrain types with pass/fail and, for failures, the filed issue number. Fail if any terrain type is unrated.

### B-1. Chrome budget: the island keeps ≥ 62 % of the viewport

- **Who does it:** Royal Match / Mini Motorways — board-first as a measurable property: "clear silhouettes… instantly readable" (Medium, Feb 2026); "the map IS the UI". TTR Marmalade's negative: "cluttered user interface" (Dicebreaker, Nov 2023).
- **Emberisle today:** the camera fits the island into the hole the HUD leaves (`src/lib/scene/mobile-fit.ts`, `chromeInsets`); `board-look-prove` and `reflow-prove` already assert parts of this.
- **Proposal:** formalise the budget — at 390×844 portrait, the HUD (banner + strip + hand + actions) occupies at most 38 % of viewport height, leaving the island hole ≥ 62 %; at 844×390 landscape, side chrome ≤ 30 % of width; at 1280×720, bottom chrome ≤ 32 % of height. Any new HUD element must name what it replaces or removes to stay in budget (the north-star rule, made numeric).
- **Viewports:** as above; 360×640 — same 38 % cap (tighter absolute px, so the action row wraps).
- **Reduced motion:** n/a.
- **Completion test:** extend the existing prove: at all four viewports, measure the island hole vs viewport and assert the percentages; add one element to the HUD in a fixture and assert the proof fails until something else is removed. Fail if any viewport drops below its budget.

### B-2. Piece-finder pulse for crowded late-game boards

- **Who does it:** Carcassonne — "Meeple Finder": placed meeples "occasionally jump up into the air to make it easier to see where everything is" once the board fills; the reviewer's favourite feature (Meeple Mountain).
- **Emberisle today:** nothing equivalent; late-game boards are dense with paths/outposts/strongholds.
- **Proposal:** a quiet 44 px "Find pieces" button in the table menu (not on the HUD). Tap: all of your pieces do one 280 ms `--ease-snap` hop (translateY 0.15 world units and back) in seat order, staggered 60 ms; opponents' pieces stay still. One-shot, never looping.
- **Reduced motion:** no hop — your pieces get a steady 1 s outline hold instead.
- **Completion test:** on a crafted late-game board, tap Find pieces; assert every one of the seat's pieces peaks above rest and returns to exactly rest within 600 ms, and no opponent piece moves. Fail on any opponent motion or any piece not returning to rest.

### TR-1. Trade panel: give flows up-and-away, receive flows down-toward; every offer shows live per-player responses

- **Who does it:** Colonist.io trade blog (Aug 2023 — FLAG old, design still live; re-verified Jun 2026): "upward and downward directions offer a more direct mental mapping of giving and receiving" after 20+ explorations; per-player response status icons (accept / reject / still deciding) — "similar to real life games, when somebody proposes a trade, we can hear other players say 'no thanks' or 'I accept.'"
- **Emberisle today:** `TradePanel.tsx` + `TradeToast.tsx` exist; the trade ask is 20 s, first Yes wins.
- **Proposal:** restyle the trade panel's two halves spatially: the "You give" row sits above, chosen goods animate upward-and-away (translateY −12 px, fade, 220 ms `--ease-out`); the "You want" row sits below, chosen goods animate down-and-toward (translateY +12 px). The open offer toast shows each other seat's live response icon (check / cross / hourglass) in their seat colour + mark. A counter-offer re-alerts the proposer with the turn-chime (BGA bug #97633's unsolved problem — solve it here).
- **Viewports:** 390×844 — panel is a bottom sheet (already the phone pattern); rows stack give-above / want-below. 1280×720 — centred sheet, same vertical mapping.
- **Reduced motion:** no directional animation — goods appear in the rows; response icons still update.
- **Completion test:** open the trade panel, add 1 timber to give; assert the chip animates upward (bounding box moves −12 px ± 4) under motion-safe and appears instantly under reduced motion; have a bot decline and assert the toast shows its cross icon within 1 s. Fail if give/receive rows are side-by-side or the response icon is missing.

### TR-2. Offers you can't afford never render; rejected offers auto-dismiss

- **Who does it:** Colonist.io (Jun 2026) — "rejected offers disappear immediately" and "offers you can't afford are never shown" — "dramatically reduced distracting trade noise." This was driven by mobile, where offer spam "became particularly annoying."
- **Emberisle today:** the trade toast shows to every seat; a seat that can't afford the ask still sees it.
- **Proposal:** the host already knows each hand — filter at render: if you cannot possibly accept (you lack the asked goods and no bank/dock route closes the gap), the toast never appears for you; the log records "Tide asked 1 timber for 1 clay (you couldn't take it)" as a muted line instead. When every human seat has declined, the toast dismisses instantly with a 150 ms fade — no waiting out the 20 s.
- **Viewports:** all — fewer toasts is the whole point on phones.
- **Reduced motion:** instant dismiss, no fade.
- **Completion test:** 3-tab proof — seat A asks for 2 ore; seat B (holding 0 ore, no route) asserts no toast appears within 2 s but the muted log line does; seats B and C decline and the toast on A dismisses within 500 ms. Fail if B sees a toast or dismissal takes > 1 s.

### TR-3. Bank/dock rates printed where the goods are

- **Who does it:** Colonist.io — trade rates printed on the cards in your hand ("give two wood for one of anything" reads directly off the card) plus a legend when you have a port or an empty hand (trade blog, Aug 2023 — FLAG old, design live).
- **Emberisle today:** bank/dock trade UI exists; rates are not visible on the hand.
- **Proposal:** long-press (or right-click) a goods card in your hand to show a 16 px glass chip: "Bank 4:1 · Dock 3:1 · Timber dock 2:1" — only the rates you actually hold. Release dismisses. On phones without long-press discovery, a one-time coach tip (R-2) mentions it. This keeps the hand clean (north star) while answering "what's my rate" at the point of decision.
- **Viewports:** chip anchors above the pressed card, 44 px minimum press area unchanged.
- **Reduced motion:** chip appears instantly.
- **Completion test:** long-press the timber card holding a timber dock; assert the chip shows "Timber dock 2:1" within 300 ms and dismisses on release; without any dock assert "Bank 4:1 · Dock 3:1". Fail if the chip shows a rate the player doesn't hold.

### S-1. Per-opponent reaction mute in two taps

- **Who does it:** Marvel Snap — tap opponent's avatar → mute (Dexerto; Fandom wiki crawled Aug 2026). Clash Royale — mute via the prohibition icon in the emote panel; 100-emote-per-battle anti-spam cap (Dot Esports, Aug 2026).
- **Emberisle today:** reactions float 2 s over the sender's seat card (`docs/design/chat.md`); player menu offers reactions; no mute.
- **Proposal:** the player action menu gains a quiet "Mute reactions" toggle per seat (persisted in localStorage). Two taps: seat card → mute. A muted seat's reactions never render for you; their chat still does (reactions are the tilt vector, not chat). A small crossed-out-bubble glyph on their seat card reminds you it's on; tap again to unmute.
- **Viewports:** the toggle is a 44 px row in the existing menu at all sizes.
- **Reduced motion:** n/a.
- **Completion test:** mute seat B, have B react; assert no reaction image appears within 3 s on your tab while seat C's reactions still do; unmute and assert B's next reaction renders. Fail if muting also blocks B's chat lines.

### S-2. Invite stays one click — forever

- **Who does it:** BGA — "Copy Link" invite from the play screen (Qt3, May 2024); the same post complains invites "made this so much harder than it used to be" — a 2024 regression from adding steps.
- **Emberisle today:** lobby "Copy link" / copy-code flow exists (`chat-prove` covers `?code=` join links).
- **Proposal:** a standing rule, not a feature: the invite path is measured — from lobby to a joinable link in the clipboard in ≤ 2 taps — and any PR that adds a step must justify it in the PR description against this benchmark. Add the 2-tap assertion to the existing lobby proof.
- **Viewports:** all.
- **Reduced motion:** n/a.
- **Completion test:** in the lobby, count taps from visible lobby to clipboard holding a `?code=` link; assert ≤ 2. Fail on 3+.

### J-1. Nothing unskippable: every animation yields to input, speed toggle works mid-game

- **Who does it:** the negative consensus — TTR Marmalade "no option to speed them up" (Dicebreaker, Nov 2023; still complained of Dec 2025); Carcassonne "no way to change game speed once the game has begun" (Meeple Mountain); Wingspan AI "borderline unplayable" slow (game-solver, Jan 2026); Offsuit "no speed control for AI turns" (Dec 2025 reviews).
- **Emberisle today:** motion tokens cap UI motion at 320 ms (polish.md); the roll moment is 900 ms; wayfarer walk 600–900 ms. No global speed control.
- **Proposal:** two rules. (1) Any animation longer than 320 ms (roll moment, wayfarer walk, win sequence) is skippable by tapping anywhere — the tap jumps it to its end state instantly. (2) A "Calm / Brisk" toggle in the table menu: Brisk multiplies all `--duration-*` by 0.6 and skips the roll moment's hold (dice settle straight to the HUD). The toggle works mid-game and persists in localStorage.
- **Viewports:** the toggle is a 44 px row in the table menu at all sizes.
- **Reduced motion:** implies Brisk-and-then-some — durations collapse to 1 ms per the existing rule; the toggle is hidden (not needed).
- **Completion test:** start the roll moment, tap mid-hold; assert the dice reach the HUD settled state within 100 ms of the tap. Enable Brisk; assert a piece landing completes within 200 ms (0.6 × 320). Fail if any animation ignores the tap or Brisk has no measurable effect.

### J-2. Staged win celebration: tally → reveals → banner, never one modal

- **Who does it:** Royal Match — level-complete is a multi-beat sequence: moves→coins conversion, stars, chest (footage Sep 2026). Monopoly GO's restraint lesson in reverse — reserve the big sequence for the win only.
- **Emberisle today:** `WinScreen.tsx` shows the winner's points and a score table (abbreviations on phones — see ux-ui-improvements.md §3).
- **Proposal:** on win, stage three beats of 600 ms each: (1) the winner's goods tally counts up in the hand (tabular numerals, 400 ms count-up); (2) longest-path and largest-army badges flip onto the winning pieces with a 280 ms `--ease-snap` scale; (3) the win banner ("Tide wins with 10 points") slides in at `text-display` 56 px with the `win` sound. Total ≤ 2 s, skippable by tap (J-1). The full score table from the existing win screen follows the banner — the beats precede it, they don't replace it.
- **Viewports:** 390×844 — beats 1–2 play on the board/hand, beat 3 is a centred glass card; 1280×720 — same, card max-width 480 px.
- **Reduced motion:** all three beats appear instantly in order, no count-up; `win` sound still plays.
- **Completion test:** rig a win; assert the three beats occur in order with the banner last, total sequence ≤ 2.2 s, and a tap during beat 1 jumps straight to the final score table. Fail if the banner appears before the reveals or the sequence exceeds 2.5 s.

### J-3. Haptics on contact moments

- **Who does it:** Balatro — "a punchy kick" of iPhone haptic per scoring card; "quick succession of haptics" returning cards to deck (iPhone in Canada, Sep 2024). Royal Match — "responsive haptics… every match feels tactile" (Medium, Feb 2026).
- **Emberisle today:** no haptics; sounds fire on contact (polish.md sound table).
- **Proposal:** `navigator.vibrate` (guarded — no-op where unsupported): 10 ms on piece landing (with the knock), 8 ms per paying piece tick (G-2, capped at 8), 15 ms on your-turn chime (T-1; replaces the current 30 ms buzz in `yourTurn()`, `src/lib/sound.ts:89`), 10 ms on a fortune you play, 10 ms on a trade offer received, 20 ms on win banner. Never vibrate for opponent actions you only watch, and never during the legal-spot pulse loop. A "Haptics" toggle in the table menu, default on where supported.
- **Viewports:** phones only (coarse pointers); desktop ignores the toggle.
- **Reduced motion:** haptics still fire — they are not visual motion (and the toggle remains available).
- **Completion test:** stub `navigator.vibrate`; build an outpost and assert vibrate was called with 10 within 100 ms of the landing frame; rig a roll paying 3 pieces and assert 3 calls of 8. Fail on vibrate during an opponent's piece landing.

### J-4. Celebration never eats the next player's clock

- **Who does it:** Hearthstone — the documented wart: "animations eat into the 75 s server timer, so long animation chains can skip the opponent's whole turn" (wiki, crawled Sep 2026) — a polish bug that became a griefing vector.
- **Emberisle today:** the host's turn timer (`TURN_MS`, `turnDeadline` in `state`) runs on wall-clock; client animations are cosmetic and don't block intents — but this is by accident, not by rule.
- **Proposal:** make it a rule and a proof: the client's celebration queue (gain moments, piece landings, win beats) never delays intent sending — intents dispatch on pointerup even mid-animation, and the turn timer is computed server-side from intent receipt, never from animation completion. Document it in one line in the README's turn-timer paragraph.
- **Viewports:** n/a.
- **Reduced motion:** n/a.
- **Completion test:** rig a 900 ms roll moment; tap End turn 200 ms into it; assert the `pass` intent reaches the host within 150 ms of the tap (not after the moment ends). Fail if any animation delays any intent.

### AX-1. Dynamic text size: three steps, phone-first

- **Who does it:** the unmet need — Wingspan's "thin tall font [that] can be a challenge for older eyes, even on an iPhone Max" requested 2021, still requested Jan 2026, never shipped (TouchArcade 2021; game-solver Jan 2026).
- **Emberisle today:** five type tokens with a 12 px phone minimum (polish.md); no user scaling.
- **Proposal:** a "Text size" setting in the table menu: Standard / Large / Extra — scaling `text-caption` 12→13→14, `text-body` 15→16→18, `text-title` 20→22→24; `text-number` and `text-display` unchanged (they're already hero-sized). Persisted in localStorage; applies to HUD, sheets, and chat; the board (3D) is unaffected. Layout must not break: the HUD wraps rather than clips (the existing `reflow-prove` gains an Extra-size pass).
- **Viewports:** most valuable at 360×640 — assert no clipped text there at Extra.
- **Reduced motion:** n/a.
- **Completion test:** set Extra, load the table at 360×640; assert no element with text has `scrollWidth > clientWidth` (no clipping) in the HUD, trade panel, and costs sheet; assert the setting survives a reload. Fail on any clipped text or lost setting.

### P-1. Reload restores the table in under 2 s

- **Who does it:** Offsuit — the negative: "if the app restarts while youre in a tournament, it doesnt go back into the tournament, you just lose" (2025 review) — the harshest review driver. BGA — the positive: "If something goes wrong, just refresh. You'll still be in the same game as if you never left" (Eric Juneau, Oct 2025).
- **Emberisle today:** reconnect by saved seat, room persistence across host restarts (`persist-prove`, `rejoin-prove`); the PWA installs to the home screen (`install-prove`).
- **Proposal:** make it a headline guarantee and a number: from reload to interactive table (board drawn, hand correct, turn state correct) in ≤ 2 s on a mid-range phone over the tunnel connection, measured from `navigationStart`. The title screen shows a branded loading state immediately (never the CATAN Classic blank-screen → home-screen bounce, Aug 2024 review). If the seat can't be reclaimed, say why in one line ("Seat is taken.") — never strand the player.
- **Viewports:** measured at 390×844 over simulated 4G.
- **Reduced motion:** n/a.
- **Completion test:** script a mid-game reload in headless Chromium with 4G throttling; assert interactive (first legal action dispatchable) ≤ 2 s in 5/5 runs; assert the branded loading state paints before any game content. Fail on any run > 2.5 s or any blank-white first paint.

## C. First 5 minutes: title → first roll → first build

For a brand-new player in practice mode (Play = instant practice vs 3 bots, per Jarrod's #444 decision). No account, no modal tutorial, no forced sequence — the coach (R-2) teaches inline and every step is skippable.

| Time | Screen / moment | What the player sees and learns | What's deliberately absent |
|---|---|---|---|
| 0:00 | Title | Wordmark, one primary Play button, quiet Host / Join secondaries, How to play. The island orbits behind blurred glass. | No eyebrow, no tagline, no stats, no news (polish.md remove-list). |
| 0:05 | Tap Play → roll-off | Banner: "Roll for first place" (T-3 verb-first). One die, 64 px, centre-bottom. Seats show names + marks, no "0 goods" rows. | No five white "0" cards (polish.md remove-list #1). |
| 0:15 | Setup placement 1 | Banner: "Place an outpost — tap a glowing corner" + Skip-tips. Legal corners pulse in your seat colour (#437). First tap selects (44 px Place chip on touch); second tap commits (mobile.md tap-then-confirm). The outpost drops 0.2 above rest, settles at 280 ms `--ease-snap`, knocks on contact. | No modal explaining setup; the pulse is the explanation. |
| 0:40 | Setup placement 2 | Banner: "Place a path — tap a glowing edge". Same select/commit. The path grows 220 ms. Coach step 1 done. | Second outpost's starting goods arrive as the first gain moment (G-1): "+1 Timber" etc. centre-screen, staged — the player learns gains before the first roll. |
| 1:00 | First roll | Primary action is the pulsing Roll button (T-1). Tap → dice tumble, freeze with `dice_land` 150 ms, the sum shows once at `text-display` 56 px centre-screen for 900 ms (`--duration-moment`), then settles into the HUD. Paying hexes glow; paying pieces pulse in sequence with ticks (G-2); gain lines "+2 Timber" rise and fade (G-1); hand counts bump; the log narrates it (G-3). | The roll is never shown three times (polish.md remove-list #5). |
| 1:30 | First main phase | Banner: "Build, trade, or end your turn". Build buttons show costs on their faces; affordable ones are full-bright, the rest dimmed (A-1). Tap a dimmed build → "Need 1 clay" chip. The Costs card is one tap away in the menu (R-1). Coach step 3 done. | No pop-up saying "you can build now" — the lit button is the message (CATAN Universe ambient affordance). |
| 2:00 | First build | Tap Path (lit) → banner: "Tap a glowing edge — tap Path again to cancel". Place → path grows, knock, haptic 10 ms (J-3). Goods leave the hand with the ledger flash. | No confirm modal for a reversible-economy action; confirm is reserved for placement mis-tap protection (already tap-then-confirm on touch). |
| 2:30 | End turn | End turn is now the Primary (nothing else affordable) — one tap, 80 ms press. Turn passes; the acting seat's ring moves (T-2). Opponent turns play at bot pace with a Brisk toggle available (J-1). | No "are you sure" on end turn (it's undoable only by the next player acting — by design, like the physical game). |
| 3:00+ | First 7 (when it comes) | Banner: "A 7 — discard 3 goods" → discard bar; then "Move the wayfarer to a new hex" with target hexes banded; then the victim picker in the same step (never modal-chained — CATAN Universe avoid #4). Coach covers it the first time (R-2). | No separate tutorial for the 7 later — it was taught when it happened. |
| 5:00 | Mid-game | The player has rolled, gained, built, traded or passed, and seen a 7 — the whole loop. The Costs card, How to play, and chat were each one tap away but never forced. | Nothing was explained twice; nothing modal ever appeared. |

What "taught" means here: the player can, unprompted, roll, read a gain, build a path, open costs, and end their turn — verified by the R-2 completion test, not by a quiz.

## D. Motion + sound spec sheet

Every in-game event → animation, duration, sound, haptic, and priority when events overlap. Durations are polish.md tokens unless noted. Sounds are the CC0 Kenney set mapped in `server/cue.mjs` / `src/lib/sound.ts`; new names (`ui_your_turn`, `gain_tick`) are additions to that map, not new files. Haptics are `navigator.vibrate` ms, guarded, phones only (J-3). Priority: when events overlap, higher-priority events play fully; lower-priority ones are dropped to their end state instantly (never queued behind a moment).

| Event | Animation | Duration | Sound | Haptic | Priority |
|---|---|---|---|---|---|
| Your turn begins | Banner slides in (translateY 8→0, fade); primary action starts 1.2 s glow pulse | 220 ms in; pulse loops | `ui_your_turn` at the turn-change event | 15 ms | 1 — never dropped, never delayed |
| Another's turn begins | Seat ring moves; banner cross-fades | 150 ms | none (their chime is theirs) | none | 2 |
| Roll tapped | Dice tumble (existing) | — | `dice_roll` (existing) | none | 2 |
| Dice freeze | `die-settle` 150 ms `--ease-out`; sum at `text-display` 56 px centre-screen | 900 ms hold (`--duration-moment`) | `dice_land` at freeze | none | 2 |
| Gain moment | "+N Good" lines rise 24 px + fade, staggered 120 ms | 900 ms per line, stack gone by 1.6 s | `chip_gain` once per roll | none | 3 — skipped entirely under reduced motion |
| Paying piece pulse | Scale 1.0→1.12→1.0 `--ease-snap`, staggered 90 ms, seat order | 280 ms each, ≤ 8 ticks | `gain_tick` per piece | 8 ms per piece | 3 |
| Hand ledger flash | Count bumps, `+N`/`−N` on the card | 1200 ms (`FLASH_MS`) `--ease-out` | none (the tick already fired) | none | 4 — always runs, even reduced motion |
| Path built | Grows along the edge | 220 ms `--ease-out` | `path_place` at end of grow | 10 ms at contact | 2 |
| Outpost built | Drops 0.2 above rest, settles, `--ease-snap` overshoot | 280 ms | `outpost_place` at landing frame | 10 ms at landing | 2 |
| Stronghold built | Swaps in at 1.05, settles to 1 | 320 ms | `stronghold_place` at settle | 10 ms at settle | 2 |
| Fortune bought | Card slides into the fortune tray | 220 ms `--ease-out` | `ui_confirm` | none | 3 |
| Fortune played (knight/plenty/monopoly/path) | Card lifts, effect plays at the target (hex/vertex/hand) — never a modal | 280 ms | `fortune_play` (new map) | 10 ms | 2 |
| Wayfarer move | Hops hex to hex (never slides) | 600–900 ms (bible §8) | `wayfarer_hop` per hop (existing pattern) | none | 3 — skippable by tap (J-1) |
| Steal | Victim's goods count ticks down, yours ticks up | 220 ms | `steal` (new map; soft, not punitive) | none | 3 |
| Discard (7) | Discard bar slides up; chosen cards fade out of the hand | 220 ms `--ease-out` | `ui_confirm` on confirm | none | 2 |
| Trade offer sent | Give chips rise-and-fade up, want chips fall-and-fade down (TR-1) | 220 ms | `ui_confirm` | none | 3 |
| Trade offer received | Toast slides in from the bottom | 220 ms `--ease-out` | `trade_offer` (new map, soft) | 10 ms | 2 — re-alerts with `ui_your_turn` on counter (TR-1) |
| Trade accepted/declined | Response icon flips on the toast; toast dismisses | 150 ms `--ease-in` | `trade_yes` / `trade_no` (new maps) | none | 3 |
| Turn timer final 10 s | Countdown chip warms to amber; soft tick each second | — | tick at 5,4,3,2,1 (rope-style escalation, Hearthstone pattern) | none | 2 |
| Win — beat 1 | Winner's goods tally counts up (tabular numerals) | 400 ms | rising `win_count` (new map) | none | 1 |
| Win — beat 2 | Longest-path / largest-army badges flip onto pieces | 280 ms `--ease-snap` | `win_reveal` (new map) | 20 ms | 1 |
| Win — beat 3 | Win banner slides in, `text-display` 56 px | 280 ms | `win` (existing) | 20 ms | 1 |
| Error / illegal pick | Button shakes 4 px horizontally, 2 oscillations | 150 ms | `ui_error` | none | 1 — errors always surface |
| Button press | Scale 0.97 | 80 ms `--ease-out` | `ui_click` on pointerdown | none | 1 |
| Sheet open/close | Settle 280 ms / exit ~200 ms `--ease-in` | 280 / 200 ms | `ui_back` on close | none | 4 |
| Chat line / reaction | Line fades in; reaction floats 12 px up, fades in last 0.5 s | 2000 ms float | none (chat.md decided: no `ui_react` without a CC0 file) | none | 5 — first to drop under load |

Overlap rules: a turn-change (priority 1) cancels any running gain moment or toast animation instantly to its end state. Sounds never stack more than 3 in 500 ms — the mixer drops the lowest-priority ones. Under `prefers-reduced-motion`, all durations collapse to 1 ms (CSS) and three.js loops hold steady (polish.md); sounds and haptics still fire.

## E. Method notes, gaps, and harsh-reviewer pass

- **Newest footage was preferred throughout** (2024–2026); every timestamped frame carries its publish date, and older sources are flagged inline with "UI may have changed since." The three research passes were honest about "not verified" dimensions rather than inventing: ms-level animation timings, haptics, screen-reader support, and colour-blind modes are gaps in the public record for most games, not omissions.
- **Frame captures:** none stored. Per the brief, links + descriptions are preferred over stored images, and no other game's art or assets are in this repo. The `docs/research/mobile-ux-benchmark/` directory was not created — there was nothing we are certain is allowed to store.
- **"Steal this" discipline:** patterns are recommended only when verified in recent builds, with two deliberate exceptions flagged inline (Splendor's 2015 green/blue readiness, Colonist's Aug 2023 trade blog — both flagged old but with designs confirmed still live).
- **What was cut in the self-review:** per-game "avoid" items that duplicated the top-25 (kept only where the game-specific evidence adds something); generic advice ("make buttons bigger") without a number or a source; any pattern that added chrome without naming what it replaces; ms timings inferred from text descriptions (marked inferred or dropped).
- **Deliberate non-adoptions** (benchmark said no): Hearthstone's full-screen "YOUR TURN" splash every turn (too interruptive for a chill board game — T-1 uses the banner + glow instead); Clash Royale's elixir-leak resource pressure (anxiety-inducing here); Monopoly GO's juice maximalism and FOMO event stacking (fights the north star); BGA's expulsion-by-vote timeout (verified to feel bad); CATAN Universe's punitive inactivity kicks; Pokémon TCG Live's entire performance record (the anti-reference).
- **Open follow-ups for a later pass:** hands-on video analysis for frame-accurate timings (turn-indicator onset, gain-animation duration) before locking the motion spec's final numbers; real-device checks of tap targets and text legibility at 360×640; playtesting the R-2 coach with first-time players (automated proofs cannot establish comprehension — see ux-ui-improvements.md).
