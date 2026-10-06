# Complaints: digital Catan (CATAN Universe, classic mobile app, Colonist.io) → Emberisle

- step: 1 Research, Part C list 2 of the UX/backend research brief
- date: 2026-10-05
- method: six parallel researchers harvested sourced complaints from App Store
  reviews (via WorldsApps/AppTail indexed mirrors — the store pages are JS-heavy),
  Google Play reviews (via AppBrain and chrome-stats.com mirrors, incl. 2026
  reviews), Steam reviews and discussions for CATAN Universe (app 544730), Reddit
  (r/ColonistIO, r/Catan — direct access blocked, quotes from indexed snippets,
  labeled as such), Colonist's own engineering blog and design docs, and the
  findings already in `docs/research/competing-games.md` (built on, not repeated).
  Every item below has real sources with verbatim short quotes; URLs are copied
  verbatim from tool output. Nothing is invented. Anything inferred is marked
  **(inferred)**.
- scope note: Emberisle deliberately mirrors Colonist.io's winning shape
  (browser, 4-character room code, no account, no paywall), so Colonist complaints
  transfer most directly. Items already documented in `competing-games.md`
  (Universe paywalls, rate limits, confusing store) are built on with fresh 2026
  evidence rather than repeated.

## How to read an item

Same legend as `complaints-tabletop.md`: statement, 2–3 sources with short
quotes, frequency/severity, category (luck, pacing, UI, social, tech,
monetisation, rules, onboarding), **Emberisle today?** (Yes / No / Partly, with
file:line evidence verified 2026-10-05), and **What Emberisle should do**.
Emberisle's names are used throughout.

Ranked by frequency × severity, most severe first.

---

### 1. "The dice are rigged" — rolls feel biased toward the AI or the leader
- **Sources:**
  - https://www.appbrain.com/app/catan-universe/com.usm.catanuniverse — "Most unrealistic rolls I've ever experienced in a game... the rolls are not random and will just favor one player every game" (1★, Aug 16, 2026)
  - https://android.chrome-stats.com/d/com.exozet.android.catan/reviews — "it rather seems to rig the dice with more 7 against you and less luck on rolling the numbers you need"
  - https://blog.colonist.io/designing-balanced-dice/ — "The 'broken' dice algorithm is a highly debated topic." (Colonist's own engineering blog)
- **Frequency/severity:** High — the single most repeated complaint family across all three digital Catan products, spanning 2017–2026. Destroys trust in the core loop.
- **Category:** luck
- **Emberisle today?** Partly. Dice are genuinely fair — server-rolled with a rejection-sampled CSPRNG (`src/lib/game/rules.ts:7-15`, `crypto.getRandomValues`), broadcast identically to every seat — but the seed/rng is deliberately hidden and there is no player-visible fairness proof, so a suspicious player has nothing to check except trust.
- **What Emberisle should do:** Keep the crypto dice; add the perception fix: a per-table roll-history tally in the log panel and an expected-vs-actual roll summary on the win screen. Suspicion thrives in a black box — make the fairness auditable in-client. Never let difficulty touch the RNG.

### 2. Bots stall the table: infinite turn timers, frozen seats nobody can skip
- **Sources:**
  - https://steamcommunity.com/app/544730/negativereviews/?p=1&browsefilter=toprated — "Bots remain extremely buggy, with infinite turn timers that often crash games" (top negative review)
  - https://steamcommunity.com/app/544730/negativereviews/?p=1&browsefilter=toprated — "It never moved... No clock. No mercy. No escape" (106 found helpful, 2025)
  - https://www.appbrain.com/app/catan-universe/com.usm.catanuniverse — "Where players clocks usually expire, a computer's clock goes on forever" (Aug 9, 2026)
- **Frequency/severity:** High — the dominant 1-star theme on Steam's negative page; still reported in 2026.
- **Category:** tech
- **Emberisle today?** No. `TURN_MS` defaults to 120 s (`server/host.mjs:54`); on expiry the host's bot executes one legal move for the idle seat and the seat stays human — a table can never freeze this way.
- **What Emberisle should do:** Accept, by design — but surface the per-seat countdown in the HUD so the table *sees* the stalled seat will be moved, which is the visible proof CATAN Universe lacks. Add a hard bot-turn contract: max one trade ask per bot turn, never re-offer a rejected ask, the whole bot turn resolves inside TURN_MS, and the log always shows "bot plays for {seat}".

### 3. The AI gangs up on the human: targets the player, never the bots
- **Sources:**
  - https://worldsapps.com/reviews-catan-universe — "AI gets an abnormal amount of 7's rolled then will only target the human player. They stole every single one of my resources even though I wasn't winning."
  - https://game-solver.com/catan-universe/ — "it feels like all of the ai are working together... then 4th place comes in and throws the game for the 1st Bot"
  - https://android.chrome-stats.com/d/com.exozet.android.catan/reviews — "The difficulty settings don't actually make the AI more intelligent, it rather seems to rig the dice with more 7 against you"
- **Frequency/severity:** High — repeated across stores; poisons practice/single-player mode, which is the onboarding funnel.
- **Category:** social
- **Emberisle today?** Partly (inferred). Hosted-game bots use one shared seat-blind chooser, and opponent hands plus the seed are stripped from bot views — so bots cannot literally collude — but practice-mode wayfarer/knight targeting could still *read* as targeting the human.
- **What Emberisle should do:** Make bot hostility VP-driven, never identity-driven: the wayfarer/knight targets the seat with the most victory points, and the log says so ("bot moves the wayfarer toward the leader"). Name practice difficulties by behavior ("Calm / Sharp / Ruthless"), never touch the RNG for difficulty. Perceived targeting is a fairness bug.

### 4. Reconnect is broken: rejoin loops with no cancel, or state rolled back
- **Sources:**
  - https://steamcommunity.com/app/544730/negativereviews/?p=1&browsefilter=toprated — "New connectivity issues cause players to be stuck in endless rejoin loops with no option to cancel"
  - https://game-solver.com/catan-universe/ — "Would love if you fixed the app freezing and then stalling on rejoin. Its still trying get us to rejoin an old game after 3 days."
  - https://worldsapps.com/reviews-colonist-io — "When the app crashes it usually lets you rejoin your current game, but sometimes that doesn't work either."
- **Frequency/severity:** High — pairs with #2/#5 as the core reliability cluster; phones are the venue and Emberisle is phone-first.
- **Category:** tech
- **Emberisle today?** No. Reconnect is by saved secret; rooms persist to disk; a dropped seat is held (90 s lobby, 10 min in-game — `server/host.mjs:49-51`), then a bot subs in without deleting the seat.
- **What Emberisle should do:** Accept, by design — and make it visible: the join page auto-retries with the saved secret and shows "reconnecting… / back at the table" states plus a visible connection indicator, so a network blip never looks like a dead game. Keep the rejoin/persist prove scripts green as the top reliability gate.

### 5. Crashes and freezes mid-game, getting worse over time
- **Sources:**
  - https://www.appbrain.com/app/catan-universe/com.usm.catanuniverse — "Freezes and messes up every single day we play." (1★, Aug 12, 2026)
  - https://worldsapps.com/reviews-catan-universe — "Lots of crashes this month. Seems there are more bugs now than ever before."
  - https://victoryconditions.com/settlers-of-catan-online-for-free-https-colonist-io/ — "I have had some random disconnect issues and other players claimed the same."
- **Frequency/severity:** High — a standing theme on every surface, with 2026 reports of regression; 44% of recent classic-app ratings are 1-star.
- **Category:** tech
- **Emberisle today?** No (partly inferred). The prove suite runs 200 all-bot games and full 3- and 4-seat client games — but no field crash data exists yet.
- **What Emberisle should do:** Keep the prove-every-seat-count discipline green through 4-seat games; add a client error boundary that renders the 4-char room code plus a "rejoin" button on any render crash instead of a dead screen.

### 6. Core play paywalled and rate-limited: scrolls, one game per 12 hours, one free map
- **Sources:**
  - https://www.appbrain.com/app/catan-universe/com.usm.catanuniverse — "Only lets you play once every 12 hours. If you close the app and reopen mid-game you're just done for the day." (1★, Aug 6, 2026)
  - https://worldsapps.com/reviews-catan-universe — "0 scrolls. How do I get scrolls? Stuck with 0 scrolls. Can't play without buying ??"
  - https://steamcommunity.com/app/544730/negativereviews/?p=1&browsefilter=toprated — "[Plot twist, it's not free] 1- its not actually 'free' you can play twice a day... the multiplier mode has only one 'map' unless you pay" (101 found helpful)
- **Frequency/severity:** High — fresh 2026 evidence on top of the 2023–24 paywall research in `docs/research/competing-games.md`.
- **Category:** monetisation
- **Emberisle today?** No. No accounts, no payments, no ads, no rate limits, no forced maps — host on a PC, join with a 4-char code, play unlimited.
- **What Emberisle should do:** Accept, by design — treat "no friction that isn't there today" as a permanent constraint; any future feature proposal that smells like a limit gets rejected at the spec stage. Every future variant (new island layouts, new fortune types) ships in the same free build.

### 7. Mobile UI breaks: tiny cards, misaligned text, misclicks with no undo
- **Sources:**
  - https://game-solver.com/colonistio/ — "The new UI is awful! The cards in your hand are so tiny you can barely click them. This went from our most played game to least in one week."
  - https://www.pixelatedcardboard.com/catan-universe-review/ — "The drag-and-drop is very touchy and it's incredibly easy to miss the mark... there not being an undo button to take back an accidental move."
  - https://techcrunch.com/2009/10/28/catan-comes-to-iphone/ — "the game board is downright tiny on the iPhone's screen"
- **Frequency/severity:** High/Med — spans the 2009 iPhone launch to 2026 reviews; the no-undo misclick is the sharpest sub-complaint, and one bad update cost Colonist subscriptions.
- **Category:** UI
- **Emberisle today?** Partly. Phones-first is the north star ("Offsuit × Catan", `docs/design/polish.md`); phone sizes are in the prove suite at 390×844 and targets are 44 px — but placement undo and small-screen seat-readability aren't closed out.
- **What Emberisle should do:** Gate every release on the existing headless phone-size proves *plus* an orientation-change pass (rotate 390×844 ↔ 844×390 with chat, trade panel, and the wayfarer prompt open; zero console errors, no clipped primary buttons). Add one-step undo for outpost/stronghold/path placement before confirm. Never encode seat identity by colour alone — always pair seat colours with names/marks.

### 8. The replacement bot loops trades forever; the timer restarts; everyone must quit
- **Sources:**
  - https://game-solver.com/catan-universe/ — "when a bot takes over for an absent player, the timer glitches and keeps starting over forcing everyone playing to quit as the bot endlessly asks for the same trade."
  - https://steamcommunity.com/app/544730/discussions/0/1319962173912172742/ — "When he was FINALLY replaced with an AI, it offered me one trade then didn't do anything for the next 10+ minutes."
  - https://android.chrome-stats.com/d/com.exozet.android.catan/reviews — "When an AI should choose a Gold resource the game locks up. The AI code never takes a resource card and the indicator just spins forever."
- **Frequency/severity:** High/Med — multi-year recurrence (2017 Steam thread → 2026 reviews); one report notes it also burns the victims' karma on quit.
- **Category:** tech
- **Emberisle today?** Partly. Idle seats get a bot after 120 s (`server/host.mjs:54, 354-362`), and practice bots answer trades on a jittered timer — but there is no proven bound on *repeated* bot trade offers in one turn.
- **What Emberisle should do:** Hard rules in the bot contract (see #2): max one trade ask per bot turn, never re-offer a rejected ask, whole bot turn resolves inside TURN_MS, log always shows "bot plays for {seat}". Keep the takeover bot conservative permanently: it may roll, discard, and move the wayfarer, but never spends goods on pieces/fortunes and never accepts trades; badge every bot move in the log.

### 9. Legal builds blocked: the UI refuses placements the rules allow
- **Sources:**
  - https://worldsapps.com/reviews-catan-universe — "The game bugs out and won't let me build a road or a settlement on tiles where they are clearly allowed??!!??! Drives me nuts."
  - https://game-solver.com/catan-universe/ — "Cant build anything every option greyed out."
- **Frequency/severity:** Med/High — not the top theme, but uniquely enraging: the player *knows* the move is legal.
- **Category:** rules
- **Emberisle today?** No. Move legality is computed server-side from one implementation of the rules; `server/rules-prove.mjs` runs one check per Rule-set line.
- **What Emberisle should do:** Accept, by design — and when the client greys out an outpost/path/stronghold spot, show *why* in one line ("must touch one of your paths") so a legal-looking denial never reads as a bug.

### 10. Scoring bugs: bonus points not awarded, longest-path math wrong
- **Sources:**
  - https://worldsapps.com/reviews-catan-universe — "the game did not count points properly, failing to award bonus points when a player built a settlement on a new island"
  - https://steamcommunity.com/app/544730/discussions/0/3800524658151010692/ — "The longest road mechanic often is not calculated correctly"
  - https://android.chrome-stats.com/d/com.exozet.android.catan/reviews — "I lost to the computer who had 4 settlements, largest army, and apparently 4 victory points, which would be 10. problem is, I had one of the victory points already."
- **Frequency/severity:** Med — long-tail but devastating to trust when it hits (a stolen win).
- **Category:** rules
- **Emberisle today?** No. Invariants are proved across 200 all-bot games ("the cards, the piece stock and the win still add up"), and finish-to-win proves assert VP math end to end.
- **What Emberisle should do:** Accept, by design — plus a visible per-seat VP breakdown (outposts/strongholds/path/fortune points) so any player can audit the score live, and surface the breakdown on the win screen. CATAN Universe hides the math, which is why the bug stories spread.

### 11. Updates wipe progress and revoke already-purchased content
- **Sources:**
  - https://android.chrome-stats.com/d/com.exozet.android.catan/reviews — "once again, they update, and it resets my progress back to nothing, and maps I had been able to use... are now gone... it has a padlock like I just paid for nothing, 12 years, and you've fixed nothing"
  - https://android.chrome-stats.com/d/com.exozet.android.catan/reviews — "I did purchase 'The new scenarios'... Now I see that this expansion pack is not available for me again and I need to pay again!"
  - https://game-solver.com/catan-universe/ — "we purchased the full game and then when we left the app and came back it was gone. Just punted $5 into the air"
- **Frequency/severity:** Med/High — several independent reports across years; the most financially felt variant.
- **Category:** monetisation
- **Emberisle today?** No. There is nothing purchasable to revoke — no accounts, no payments — and table state persists to disk across host restarts.
- **What Emberisle should do:** Accept, by design. This is a standing reason to keep payments and accounts permanently out of scope.

### 12. Login and server friction: bad gateways, logouts, "servers full"
- **Sources:**
  - https://android.chrome-stats.com/d/com.exozet.android.catan/reviews — "this week i started getting 'bad gateway' when trying unsicessfully to play any online game. anyone else?"
  - https://game-solver.com/catan-universe/ — "the repetitive logging in every time you switch games is so annoying."
  - https://game-solver.com/catan-universe/ — "for the past few days we got logged out and cannot log back in. Continues to say that 'servers are at maximum capacity'."
- **Frequency/severity:** Med/High — login/server issues are a top-three con on the classic app and a constant refrain in Universe reviews; players report days-long lockouts.
- **Category:** tech
- **Emberisle today?** No. No accounts at all; join is a 4-character code with a saved seat secret, and the host is whoever's PC runs it.
- **What Emberisle should do:** Accept, by design. The code-join + secret shape is the proven anti-friction pattern; never add login, email, or password-reset machinery. Surface host reachability honestly (a small lobby/table indicator) so a stall reads as "connection", not "frozen game".

### 13. Abandonment: a decade without meaningful fixes, then removal from the store
- **Sources:**
  - https://android.chrome-stats.com/d/com.exozet.android.catan/reviews — "I own this app for 10 years and never have there been fixes or updates that made this game worthwhile or even a close simulation to the real board game. Developer doesn't seem to care."
  - https://www.pixelatedcardboard.com/catan-review/ — "There's a good chance Catan doesn't make the 64-bit jump in iOS, and Catan Universe becomes the only version available on the App Store once it is released."
  - https://www.catanstudio.com/2017/07/31/rivals-for-catan-for-ios-no-longer-available-on-the-app-store-new-app-in-development/ — "It is unfortunately not possible to update the game and its 32 bit architecture for iOS 11... will not be available on the App Store anymore"
- **Frequency/severity:** Med — the classic app was left to rot and superseded; buyers watched it die.
- **Category:** tech
- **Emberisle today?** No. A browser/PWA table has no store gatekeeper to be pulled from; a dead host restarts and tables persist. (Inferred residual risk: single-developer bus factor, which the prove-suite culture mitigates.)
- **What Emberisle should do:** Accept, by design. Keep the PWA shape; add nothing store- or account-dependent.

### 14. Forced bot fill: can't play without a third seat, and a dead bot means a dead table
- **Sources:**
  - https://steamcommunity.com/app/544730/negativereviews/?p=1&browsefilter=toprated — "the game demanded a third. An AI. We let it in. It never moved... No clock. No mercy. No escape."
  - https://steamcommunity.com/app/544730/reviews/ — "Now you cant even find a lobby for multiplayer. Leaves you forced to play against the Bots."
  - https://android.chrome-stats.com/d/com.exozet.android.catan/reviews — "each game requires a minimum of four players, so this won't be a quick play title."
- **Frequency/severity:** Med — the dead-table variant is rare but total (game over for everyone); the forced-bot variant is common as lobbies emptied.
- **Category:** pacing
- **Emberisle today?** Partly. The 3–4 seat minimum stands ("Need 3 or 4 at the table"), but there IS a clock: idle seats are bot-moved after 120 s (`server/host.mjs:54`), so a table can never freeze the way the complaint describes.
- **What Emberisle should do:** Accept the 3-seat minimum by design (the game genuinely needs it) — but make the clock visible ("bot moves in 0:12") and never let a human stare at a silent seat. Practice-vs-bots is the instant-play answer when humans are short.

### 15. Unlabeled, confusing UI: mystery buttons, broken lists, overlapping controls
- **Sources:**
  - https://pcmac.download/app/1220346113/catan-universe — "Unlabeled game mode buttons at the bottom" and "Unintuitive in-game interface and UX"
  - https://steamcommunity.com/app/544730/discussions/0/2570942216293831480/ — "when adding an IA player there's no option to cancel... the list collides with the Start Game button"
  - https://steamcommunity.com/app/544730/discussions/0/2570942216293831480/ — "a lot more flashy and useless animations... long pauses between actions and animations... you spend a lot of time waiting for nothing"
- **Frequency/severity:** Med — a steady drumbeat; the UI-overhaul complaint ("something no one asked for, while long-standing bugs remain unfixed") shows redesigns can make it worse.
- **Category:** UI
- **Emberisle today?** No. North star is "Offsuit × Catan": simple, elegant, board-first, minimal chrome (`docs/design/polish.md`); the surface is one table + 4-char code, not a menu tree. Animations are budgeted (nothing over 320 ms except the roll moment).
- **What Emberisle should do:** Keep every control text-labeled (never icon-only mystery buttons) and freeze the HUD layout once it ships — CATAN Universe's lesson is that a UI overhaul players didn't ask for reads as betrayal. Keep every animation under a beat and skippable; the dice lands and the gains post in the same moment.

### 16. The trade menu is confusing: bank trading hidden, docks opaque, no open-ended offers
- **Sources:**
  - https://github.com/colonistio/design/issues/297 — Colonist's own "Trade Screen Ideas" design doc quoting users verbatim: "I don't know about trading with the bank / it needs to be clearer that I can trade with the bank - I want to do a 'wild card' or open-ended trade, but I can't - I don't understand what ports do / how ports work - I don't know which ports I control"
  - https://worldsapps.com/reviews-colonist-io (indexed snippet) — trade-flow confusion recurring in reviews
- **Frequency/severity:** Med — "recurring" in the team's own words, from bounty submissions and FeatureUpvote.
- **Category:** UI
- **Emberisle today?** Partly. Trade panel and trade toasts exist and are proven, so the surface is built — but the *comprehension* risk is identical.
- **What Emberisle should do:** Design the trade panel against Colonist's four verbatim complaints: (a) bank trade always visible next to player trade with the live rate printed ("bank: 4 timber → 1 ore"); (b) the controlled dock's rate labeled on the board at the building that controls it ("your 2:1 timber dock"); (c) support an open ask ("give timber, want: anything"); (d) zero extra clicks for the common bank trade — one tap to execute at the shown rate.

### 17. Ads on the free game degrade the experience
- **Sources:**
  - https://blog.colonist.io/best-sites-to-play-catan-online/ — "Since it is a free game, Colonist relies on advertisements to fund its operations." (Colonist's own blog, listed under "Cons")
  - https://www.producthunt.com/products/colonist-io-new-ranked-games/reviews — "some users have criticized the dice mechanics and ad placements."
- **Frequency/severity:** Med — structural to the business model; Colonist itself lists it as a con.
- **Category:** monetisation
- **Emberisle today?** No. No accounts, no payments, no ads by design.
- **What Emberisle should do:** Accept by design — and keep it a stated differentiator. If hosting costs ever bite, the answer is the existing self-host model, never injecting ads into the table.

### 18. Expansion/DLC pricing feels like a rip-off next to the base game
- **Sources:**
  - https://game-solver.com/colonistio/ — "their prices for almost all dlc is too expensive."
  - https://apptail.io/app/colonistio-rkS/austria (indexed snippet) — "I get charging for your services but the pricing model to value ratio is wild. It's incredibly expensive for one game. You can get Xbox game pass for less and that has hundreds of video games."
  - https://blog.colonist.io/best-catan-expansions/ — "You can play Seafarers with a membership on Colonist." (membership-gated expansion)
- **Frequency/severity:** Med — recurring in App Store reviews; the Xbox Game Pass comparison shows how badly the value reads.
- **Category:** monetisation
- **Emberisle today?** No. No payments, no DLC, no membership tiers — one build for everyone.
- **What Emberisle should do:** Accept by design. The spec should forbid paywalled rules content outright so this complaint can never transfer.

### 19. Players vanish mid-game with no graceful handling
- **Sources:**
  - https://worldsapps.com/reviews-catan-universe — "This game is fun, but the live part is annoying. People keep disappearing and it is hard to play 45 minutes."
  - https://victoryconditions.com/settlers-of-catan-online-for-free-https-colonist-io/ — "it can be a bit annoying when a player starts the game and a bot takes over in the middle."
- **Frequency/severity:** Med — one crisp quote naming the exact social failure mode of live multiplayer; the bot-takeover variant is the sharper pain.
- **Category:** pacing
- **Emberisle today?** No. Every waited-on human seat gets 120 s, then the host's bot makes one legal move and play continues; the table hears "took too long; the table moved on." Dropped seats are held 10 min for reconnect (`server/host.mjs:49-51`).
- **What Emberisle should do:** Accept, by design — keep the visible countdown and the log line; CATAN Universe's failure is invisibility (a frozen seat with no clock), and Emberisle's timer is the fix. Badge every bot move in the log ("bot passed for Ash") so the table trusts the fill-in.

### 20. Tutorials that don't teach: onboarding gates the game without explaining it
- **Sources:**
  - https://worldsapps.com/reviews-catan-universe — "in the opening... the tutorials didn't work so I didn't rly know how to play"
  - https://www.pixelatedcardboard.com/catan-universe-review/ — "Arrival on Catan generally does a good job of explaining how the app is setup, but falls short on some important details"
  - https://pcmac.download/app/1220346113/catan-universe — forced tutorial gates "different versions of the regular mode" even after completion
- **Frequency/severity:** Med/Low — mostly a new-player complaint, but it *is* the funnel.
- **Category:** onboarding
- **Emberisle today?** Partly. The full rules live in the README "Rule set," and practice-vs-bots exists as a learning table — but there is no guided first game.
- **What Emberisle should do:** Make practice mode the tutorial: a first-game overlay that highlights what to tap in order (roll → collect → build a path → found an outpost), using Emberisle's names, then gets out of the way. Don't build a separate gated tutorial — the genre's onboarding winner is learning through the UI itself.

### 21. No offline play; forced login even for local games
- **Sources:**
  - https://game-solver.com/catan-universe/ — "The game logs you out all the time and requires internet to log back in even for a local game."
  - https://worldsapps.com/reviews-catan-universe — "Good except you have to be online to start a game" / "Flaw that you can't start a game offline"
- **Frequency/severity:** Med/Low — smaller theme, but a hard dealbreaker for tabletop-at-the-table use.
- **Category:** tech
- **Emberisle today?** No. The host runs on the player's own PC on the local network; there are no accounts and no login at all — and hotseat needs no network whatsoever.
- **What Emberisle should do:** Accept, by design — keep hotseat fully offline-capable and never introduce any auth gate in front of starting a table.

### 22. Long games (1–2 hours) with no save — an interruption destroys everything
- **Sources:**
  - https://game-solver.com/catan-universe/ — "every time we get to 13/15 points in a long running game, the game just resets to an early saved stage and everyone loses most of their points."
  - https://game-solver.com/catan-universe/ — "Would love if you fixed the app freezing and then stalling on rejoin. Its still trying get us to rejoin an old game after 3 days."
  - http://www.appspy.com/catan-classic/review/ — "each game requires a minimum of four players, so this won't be a quick play title."
- **Frequency/severity:** Med — the hour-long session is core to the genre; losing one near the win is the sharpest pain.
- **Category:** pacing
- **Emberisle today?** No. Rooms persist to disk; a host kill/restart restores every seat at the same sequence with chat intact, and a 25-hour-old room file is dropped.
- **What Emberisle should do:** Accept, by design — plus one cheap surface: on refresh/rejoin show "table saved — you're back in," so the persistence players can't see becomes a feature they notice.

### 23. Bots spam the same trade offer over and over
- **Sources:**
  - https://steamcommunity.com/app/544730/negativereviews/?p=1&browsefilter=toprated — "Bots repeatedly offer the same trade over and over"
  - https://www.appbrain.com/app/catan-universe/com.usm.catanuniverse — "if someone keeps counter trading them their clock resets, and they can waste lots of time"
- **Frequency/severity:** Low/Med — a sub-theme of bot complaints, but it makes trading feel broken rather than social.
- **Category:** social
- **Emberisle today?** Partly (inferred). Practice trade flow is already one-ask-per-turn with a 20 s window and the bot plays on after Yes/No — but no proven bound on repeated bot offers exists yet.
- **What Emberisle should do:** Keep the one-ask-per-turn rule as a hard protocol limit and never let a declined offer be re-sent unchanged — a repeat offer must change the goods or stay silent.

### 24. Suspicion that the free version is deliberately degraded to push paid
- **Sources:**
  - https://game-solver.com/colonistio/ — "They have changed the free version to make it difficult to see and less easy to play. We assume the are encouraging pay to play."
  - https://apptail.io/app/colonistio-rkS/austria (indexed snippet) — "only winning games consistently when you spend."
- **Frequency/severity:** Med — whether true or not, the *perception* is the complaint, and it corrodes trust in every other system (dice, ranked).
- **Category:** monetisation
- **Emberisle today?** No. There is no paid tier to upsell to, so the incentive structure that breeds this suspicion doesn't exist.
- **What Emberisle should do:** Accept by design. Keep a single build; if a hosting-related feature ever appears, never let it touch the in-game experience — no gameplay, visibility, or pacing advantage tied to anything paid.

### 25. Difficulty is fake — harder AI just gets better luck
- **Sources:**
  - https://android.chrome-stats.com/d/com.exozet.android.catan/reviews — "The difficulty settings don't actually make the AI more intelligent, it rather seems to rig the dice with more 7 against you"
  - https://apptail.io/app/colonistio-rkS/austria (indexed snippet) — "Difficulty levels are set by rigging dice roles so bots keep getting 7's. FAIL"
- **Frequency/severity:** Med — persistent minority complaint; high credibility cost when players catch it.
- **Category:** luck
- **Emberisle today?** Partly (inferred). Practice bots exist (`src/lib/game/ai.ts`); the RNG is never touched by difficulty today — but nothing *says* so.
- **What Emberisle should do:** State it and keep it: name practice difficulties by behavior, never touch the RNG for difficulty, and keep that invariant in the prove suite. Transparency is the whole fix.

### 26. The AI robs the weakest player instead of the leader
- **Sources:**
  - https://steamcommunity.com/app/544730/discussions/0/3112518479584293542/ — "AI player would rob at the player with the lowest score while the leading player is 1-2 points way from winning? what F* kind of AI play style is this?"
- **Frequency/severity:** Med/Low — one vivid thread, but it names a real design question every bot must answer.
- **Category:** rules
- **Emberisle today?** Partly (inferred). Bot wayfarer targeting logic exists; its target-selection rule isn't surfaced.
- **What Emberisle should do:** VP-driven targeting, always (see #3): the wayfarer goes at the leader, the log says why. A bot that robs the trailer reads as broken or cruel; a bot that robs the leader reads as playing the game.

### 27. Punished for quitting a bugged game: karma/ELO loss, kicks
- **Sources:**
  - https://worldsapps.com/reviews-catan-universe — "Then I have to quit because I literally can't do anything and it makes my karma go down."
  - https://steamcommunity.com/app/544730/discussions/0/2646360117215878890/ — "You were kicked from the last game... You get kicked, for no reasons, instantly"
- **Frequency/severity:** Low/Med — few quotes, but it compounds every other bug: the app breaks the game *and* blames the player.
- **Category:** rules
- **Emberisle today?** No. No accounts, no karma, no ELO; a dropped seat is bot-subbed and the seat is held for reconnect.
- **What Emberisle should do:** Accept, by design — never add reputation scores or quit penalties; the table always absorbs a departure gracefully, which is exactly what kick/karma systems fail to do.

### 28. Bots are dumb, too trade-happy, and weak play reads as betrayal
- **Sources:**
  - https://victoryconditions.com/settlers-of-catan-online-for-free-https-colonist-io/ — "They are a bit too eager to trade and they occasionally build roads and settlements in places that make no sense. An option for a harder AI level would be appreciated."
  - https://steamcommunity.com/app/544730/discussions/0/2570942216293831480/ — bots "ignore their own turn timer" (via `docs/research/competing-games.md`)
- **Frequency/severity:** Low/Med — persistent across years of reviews.
- **Category:** tech
- **Emberisle today?** Partly. Practice is vs 3 bots; the turn timer bounds them, but bot *quality* is unproven in the field.
- **What Emberisle should do:** Label practice bots as practice so weak play is expected, not a betrayal; keep the idle-takeover bot conservative (see #8). Bot smarts are a backlog item, bot *harmlessness* is the release gate.

### 29. Customer service ignores paid-currency problems
- **Sources:**
  - https://apps.apple.com/us/app/catan-universe/id1220346113 (via `docs/research/competing-games.md`) — a reviewer "paid for in-game currency that never arrived and got only automated replies for a week"
- **Frequency/severity:** Low/Med — few reports, but maximum resentment per report.
- **Category:** monetisation
- **Emberisle today?** No. There is no currency, no store, no support queue — nothing to go wrong.
- **What Emberisle should do:** Accept, by design. Another standing reason the no-payments constraint pays for itself.

### 30. The store is confusing about what a purchase actually unlocks
- **Sources:**
  - https://apps.apple.com/us/app/catan-universe/id1220346113 (via `docs/research/competing-games.md`) — reviewers describe the store as "confusing about what a purchase actually unlocks"
- **Frequency/severity:** Low/Med — compounds every monetisation complaint.
- **Category:** monetisation
- **Emberisle today?** No. There is no store.
- **What Emberisle should do:** Accept, by design — permanently.

### 31. Forced onto the beginner map ~75% of the time unless you pay
- **Sources:**
  - https://apps.apple.com/us/app/catan-universe/id1220346113 (via `docs/research/competing-games.md`) — reviewers report "being forced onto the same beginner map roughly 75% of the time unless they pay"
- **Frequency/severity:** Med — the concrete shape of the paywall: not just paying, but paying to escape boredom.
- **Category:** monetisation
- **Emberisle today?** No. Every table deals a fresh random island; there are no maps to gate.
- **What Emberisle should do:** Accept, by design. Never gate island variety — a fresh deal every game is the free replay engine.

### 32. Unplayable at 4 players: lag and freezes at the full table
- **Sources:**
  - https://steamcommunity.com/app/544730/negativereviews/?p=1&browsefilter=trendyear (via `docs/research/competing-games.md`) — multiple reports of the app being "completely bugged" at 4 players
- **Frequency/severity:** Med — and it strikes exactly the seat count Emberisle supports.
- **Category:** tech
- **Emberisle today?** No (inferred for the field; proven in the lab). The prove suite runs 3- and 4-seat client games (`tabs-prove`, `tabs-prove-4`).
- **What Emberisle should do:** Keep every prove green through 4-seat games, not just 3 — the 4-seat table is the reliability target, because it is where CATAN Universe dies.

### 33. Visual glitches: cards vanish, chat distorts the layout
- **Sources:**
  - https://game-solver.com/colonistio/ — "When playing on our iPhone the resource cards randomly disappear from the screen and we have to close the app and reopen."
  - https://game-solver.com/colonistio/ — "Game distorts when sending message on chat or editing trades."
- **Frequency/severity:** Low/Med — specific bug reports; "close the app and reopen" mid-game is severe when it hits.
- **Category:** tech
- **Emberisle today?** Partly. The prove suite gates on zero console errors (`chat-prove`, `watch-ui-prove`), and a minimized chat dock must cover no board target. The untested combination (inferred) is chat-open + trade-open + orientation change on a phone.
- **What Emberisle should do:** Add that exact combination to the touch-prove suite: open chat, open trade panel, rotate, assert no clipped buttons and no console errors. Re-derive the hand from state on every `state` message so a dropped frame can never permanently hide a player's goods.

### 34. No connection/host status indicator — a stall reads as a frozen game
- **Sources:**
  - https://worldsapps.com/reviews-colonist-io (indexed snippet) — "Bugs within the app often give freeze frames and muted audio."
  - https://apptail.io/app/colonistio-rkS/france (indexed snippet) — "Not a very fun game. The servers don't run well"
- **Frequency/severity:** Low/Med — fewer distinct reports than disconnects, but the same family: the app never says *what* is wrong.
- **Category:** tech
- **Emberisle today?** Partly. Different architecture helps — a friend hosts on their PC with auto-restart rather than central servers — but a struggling host PC or tunnel produces the same symptom, and nothing names it.
- **What Emberisle should do:** Surface host health honestly: a small lobby/table indicator for reachability and round-trip state, so a stall reads as "connection" rather than "frozen game". Keep room persistence so a host restart resumes the table instead of killing it.

### 35. Can't see opponents' points on small screens
- **Sources:**
  - https://game-solver.com/colonistio/ — "when you play with 5+ players you cant see the other players point status"
  - https://www.pixelatedcardboard.com/catan-universe-review/ — small click areas and cramped phone layout as a recurring review theme
- **Frequency/severity:** Low/Med — a phone-layout information-density failure.
- **Category:** UI
- **Emberisle today?** Partly. The seat rail/strip work is in flight (polish #443: one line per seat, points as the number); not yet proven on the smallest phones.
- **What Emberisle should do:** Every seat's points must be visible without opening anything, at 390×844 and 844×390 — one line per seat, points as the hero number. This is the phone release gate from #7, applied to information density.

### 36. Ranked ladder feels manipulated: spend → climb, stop → collapse
- **Sources:**
  - https://apptail.io/app/colonistio-rkS/austria (indexed snippet) — "I spent about 5$ just to see if my theory was correct and sure enough, within the week I shot up to 1600 rating... since I haven't spent money, I have lost 35/37 games I have played, right back to 1300 rating."
- **Frequency/severity:** Low (one vivid report) × High (trust damage) — poisons the whole ranked proposition.
- **Category:** social
- **Emberisle today?** No. No ranked mode, no ELO/MMR, no accounts — tables are friends-only via 4-char codes.
- **What Emberisle should do:** Accept by design. If a leaderboard is ever added, make it opt-in, per-friend-group, and fully transparent (show the formula); never a global ladder with monetisation anywhere near it.

### 37. Ranked matchmaking is too sweaty for casual kitchen-table players
- **Sources:**
  - https://www.tapsmart.com/games/colonist-review/ — "Playing online, what surprised me is how sharp the average opponent is. If you're used to casual kitchen-table sessions, expect to up your game."
- **Frequency/severity:** Low — a press observation; matters for casual acquisition.
- **Category:** social
- **Emberisle today?** No. There is no matchmaking at all — you only ever play people you invite with the code.
- **What Emberisle should do:** Accept by design — the friends-only model *is* the casual mode. Keep practice-vs-bots as the low-stakes on-ramp; never add stranger matchmaking without an explicit casual/ranked split.

### 38. Pass-and-play is a poor fit for hidden-information trading games
- **Sources:**
  - https://www.pixelatedcardboard.com/catan-review/ — "Catan also offers a pass-and-play option although the logistics of this get a little tricky when you need to have four people working on a trade offer."
  - https://n4g.com/news/426929/ign-catan-review — "My big gripe with Catan is the total lack of network play. Pass-the-phone doesn't cut it."
  - https://www.macworld.com/article/200819/catan_iphone.html — "Half the game in Catan is strategizing about the board while your opponents are taking their turns."
- **Frequency/severity:** Low — an old, honest structural complaint, not a bug.
- **Category:** social
- **Emberisle today?** No. Hotseat exists as a bonus, but the primary shape is one device per seat joined by code, so nobody ever sees another seat's hand or fortunes.
- **What Emberisle should do:** Accept, by design. Keep hotseat for the couch case; keep online code-join as the default.

### 39. Retaliatory teaming: "you rob me, I team up against you"
- **Sources:**
  - https://worldsapps.com/reviews-colonist-io (indexed snippet) — "It's okay tho because I just be teaming with someone else if someone puts robber on me and I know the dice aren't rolling true to the stats."
  - https://www.inverse.com/gaming/colonist-settlers-of-catan-online-free-game — "Trade. The person who collaborates with more players usually ends up at an advantage." (Colonist's creator, quoted in press)
- **Frequency/severity:** Low — one candid admission; culturally notable because the founder frames collaboration as *the* winning strategy.
- **Category:** social
- **Emberisle today?** Partly. Friends-only tables mean teaming is a social dynamic among people who know each other, not stranger matchmaking fraud — but a 2v1 pile-on against the leader still feels bad, and the wayfarer steal gives it a focal point.
- **What Emberisle should do:** Accept by design — no technical fix for friends ganging up; a friends-only game self-regulates socially. Do not add anti-teaming rules; they'd read as nannying in a living room.

### 40. Slow, flashy, unskippable animations between actions
- **Sources:**
  - https://steamcommunity.com/app/544730/discussions/0/2570942216293831480/ — "a lot more flashy and useless animations... long pauses between actions and animations... you spend a lot of time waiting for nothing"
- **Frequency/severity:** Low/Med — fewer quotes, but it directly contradicts the board-first north star.
- **Category:** pacing
- **Emberisle today?** No. Minimal chrome; animations are budgeted (nothing over 320 ms except the roll moment, `docs/design/polish.md`).
- **What Emberisle should do:** Keep every animation under a beat and skippable; the dice lands and the gains post in the same moment — never make the table watch a cinematic.

---

## Overlap: complaints that appear in both lists

These are the genre's load-bearing complaints — they survive the jump from cardboard to
screen, so fixing them is fixing the game, not the medium.

| # | Complaint | Tabletop | Digital |
|---|---|---|---|
| O1 | Dice feel rigged / luck decides games | T1 (luck streaks decide games) | D1 ("the dice are rigged") |
| O2 | Sevens cluster and punish | T11 (7-clusters cost half your hand) | D1/D25 (rigged 7s, fake difficulty) |
| O3 | Wayfarer/robber feels personal and mean | T4 (targeted theft sours tables) | D3 (AI gangs up), D26 (AI robs the weakest) |
| O4 | Kingmaking / teaming decides winners | T8 (trades decide others' games) | D39 (retaliatory teaming) |
| O5 | Trading stalls; leader frozen out | T10 (nobody trades with the leader) | D16 (trade menu hides the bank — the digital amplifier) |
| O6 | Fortune/dev-card swings | T12 (monopoly empties hands) | — (no digital-specific variant found; the mechanic complaint is medium-agnostic) |
| O7 | Hidden points, surprise endings | T13 (endings feel unearned) | D10 (scoring bugs — the digital evil twin: not hidden math, *wrong* math) |
| O8 | Downtime / pacing drag | T5, T6 (90+ min games, downtime) | D14 (dead tables), D19 (vanishing players), D40 (unskippable animations) |
| O9 | Setup decides the game / onboarding pits | T7, T17–T19 (placement leverage, teaching) | D20 (tutorials don't teach) |
| O10 | Player-count lock-in | T16, T22 (3–4 only, 5–6 drags) | D14 (forced bot fill — the digital version of "can't get enough humans") |
| O11 | Take-that splits groups | T15 (some tables can't play together) | D38 (pass-and-play poor fit — same root: the social contract around conflict) |
| O12 | Fiddly pieces / misclicks | T33 (tiles slide, pieces drift) | D7 (tiny targets, no undo — the digital version of knocking the board) |

The pattern: **luck-trust, conflict-sociality, and pacing** are the three complaints no
port has ever escaped. Everything else is medium-specific and already answered by
Emberisle's architecture (rules enforced by code kill T20/T21/T27/T34–T38; no
accounts kill the entire digital monetisation cluster D6/D11/D17/D18/D24/D29–D31).

## "Offsuit × Catan" selling points: complaints the north star turns into advantages

The brief's direction — simple, elegant, board-first, remove chrome — doesn't just
dodge these complaints; several become things to say out loud.

1. **"No accounts. No store. No ads. No karma."** — kills the entire digital
   monetisation complaint class (D6, D11, D17, D18, D24, D29, D30, D31) and the
   physical paywalled-expansion complaint (T29). This is the single biggest
   structural advantage over every digital competitor and should be a stated,
   permanent constraint, not just a current fact.
2. **"The table never freezes."** — the 120 s turn timer + bot substitution +
   visible countdown answers digital's most rage-inducing cluster (D2, D8, D14,
   D19, D32) and physical downtime (T6). CATAN Universe's failure is invisibility
   (a frozen seat with no clock); Emberisle's timer is the visible proof.
3. **"The dice are honest — and you can check."** — crypto server dice plus a
   visible roll history answers the #1 complaint on both lists (T1, D1). Nobody
   else ships the audit; the math alone never convinced anyone.
4. **"Rules are enforced, not argued."** — one server-side rules engine kills the
   physical argument class (T20, T21, T27, T34–T38) and the digital
   legal-move/scoring-bug class (D9, D10). "You can't misread the rules because
   there's nothing to misread" is a selling point against both cardboard and
   every buggy port.
5. **"One device per player, zero setup."** — answers physical setup chores and
   sliding tiles (T24, T33) and the pass-and-play problem (D38): no sorting, no
   knocking the board, no peeking at hands. The island is dealt in code.
6. **"Board first, chrome almost nothing."** — answers digital UI clutter and
   phone-breakage (D7, D15, D33, D35) and physical table sprawl. Fewer, better
   things is the Offsuit lesson; every control text-labeled, every animation
   under a beat.
7. **"Your friends, your table."** — friends-only via 4-char code answers ranked
   sweatiness and ladder manipulation (D36, D37), stranger teaming (D39), and
   login/server friction (D12): there is no lobby to be empty, no account to be
   locked, no server to be full.
8. **"The wayfarer has a gentle mode."** — the official toggle (T4, T18) turns
   the genre's most divisive mechanic into a table-level choice. No competitor
   ships this as a first-class option; house rules are the current state of the
   art.
9. **"Reconnect just works."** — saved-secret rejoin, held seats, disk-persisted
   rooms answer the digital reliability cluster (D4, D5, D22) that Colonist and
   Universe both fumble. "Close the app mid-game, come back, you're seated" is
   worth saying.
10. **"Bots that know their place."** — a conservative, badged, VP-driven
    takeover bot answers D2/D3/D8/D26/D28: the fill-in never spends your goods,
    never re-offers a dead trade, always says what it's doing. Practice bots are
    labeled practice; weak play is expected, never betrayal.

Accepted by design (not selling points, just honest): dice luck stays lucky
(T1–T3, D1), the wayfarer still steals by default (T4), the leader still gets
piled on by their friends (T9, T14, D39), games still run long (T5, D22), and
3–4 seats is still the game (T16). The north star doesn't remove the genre's
teeth — it removes everything *around* the teeth that isn't the game.
