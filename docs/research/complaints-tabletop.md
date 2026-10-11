# Complaints: the physical tabletop game → Emberisle

- step: 1 Research, Part C list 1 of the UX/backend research brief
- date: 2026-10-05
- method: six parallel researchers harvested sourced complaints from BoardGameGeek
  (forums/reviews), Reddit (r/Catan, r/boardgames), Amazon review aggregates, YouTube
  reviews, and review sites (Dicebreaker, GamesRadar, SUSD-adjacent blogs, AV Club,
  TheGamer). Every item below has real sources with verbatim short quotes; URLs are
  copied verbatim from tool output. Nothing is invented.
- caveats: Reddit direct access was blocked in this environment, so Reddit quotes
  come from indexed snippets and are labeled as such; BGG's forum listing pages
  403'd, so several items rest on a single readable BGG thread and are flagged
  **[single-thread]**; Amazon review *text* was not retrievable, so the Amazon
  channel contributed aggregate ratings (CATAN 6th Edition: 4.8/5, 39,050 ratings
  on Amazon.co.uk) plus review-site coverage. Anything inferred is marked
  **(inferred)**.

## How to read an item

- **Statement** — the complaint in one line.
- **Sources** — 2–3 real links, each with one short quoted phrase.
- **Frequency/severity** — High/Med/Low with the concrete signal.
- **Category** — luck, pacing, UI, social, tech, monetisation, rules, onboarding.
- **Emberisle today?** — Yes / No / Partly, with evidence from the repo
  (`README.md` "Rule set", `server/host.mjs`, `src/lib/game/rules.ts`,
  `docs/design/polish.md`). Line numbers verified 2026-10-05.
- **What Emberisle should do** — a concrete design/tech answer, or "accept, by
  design" with a reason. Emberisle's names are used throughout
  (outpost/stronghold/path/fortune/wayfarer; timber/clay/wool/grain/ore).

Ranked by frequency × severity, most severe first.

---

### 1. Dice-luck streaks decide games; careful strategy gets sidelined by bad rolls
- **Sources:**
  - https://boardgamegeek.com/thread/417160/catans-victory-points — "too often a 'cornering' or a series of lucky rolls would work so feverishly to one person's advantage that the consistent application of a strategy or long-term plan was for naught"
  - https://www.dicebreaker.com/games/catan-1/opinion/catan-terrible-introduction — "The randomness of the game makes it far too easy for players to suddenly find themselves out of the running"
  - http://wolfsgamingblog.com/2013/12/14/settlers-of-catan-board-game-review/ — "how pure luck can often seemingly trump any amount of strategic play"
- **Frequency/severity:** High — the single most repeated complaint across every source; a 36,000-game simulation thread exists on r/boardgames precisely to quantify it.
- **Category:** luck
- **Emberisle today?** Yes. Same core loop: "Roll two dice. The server rolls. Sums that match a token pay every building on that hex" (README.md "A turn").
- **What Emberisle should do:** Accept luck by design (it is the genre's texture), but make fairness legible: keep the server-side crypto dice (`src/lib/game/rules.ts:7-15`, rejection-sampled `crypto.getRandomValues`) and add a small visible roll-history tally in the HUD so a cold streak reads as randomness, not rigging. Never add luck-smoothing; it would break trust in the dice.

### 2. Stuck turns: nothing to build for turns on end because your numbers never roll
- **Sources:**
  - http://elusivemeeple.com/2017/05/20/catan-review/ — "forced to wait and wait and wait……… before you can take another turn"
  - https://www.gamesradar.com/tabletop-gaming/catan-review/ — "the majority of the game can feel futile if they get stuck"
  - https://www.dicebreaker.com/games/catan-1/opinion/catan-terrible-introduction (indexed snippet) — "at least one player feeling like they have absolutely nothing to do except to hope an opponent takes pity on them or to simply wait it out"
- **Frequency/severity:** High — described as the pace-killer in most long-form reviews.
- **Category:** luck (with pacing fallout)
- **Emberisle today?** Yes. Same production rules (README.md "A turn").
- **What Emberisle should do:** Emberisle already has two structural answers the physical game lacks: the 4:1 bank and 2:1/3:1 docks guarantee a trade outlet even when opponents refuse (README.md "Docks", "Bank"), and the host's 120 s turn timer with bot substitution means a stuck seat never stalls the table (`server/host.mjs:54`). Concrete add: make each seat's reachable dock rates visible in the HUD so a starved player sees a plan (a 2:1 dock route) instead of a wait.

### 3. Resource drought: locked out of one good for the whole game
- **Sources:**
  - https://boardgamegeek.com/thread/2740507/games-that-might-replace-my-family-addiction-to-ca **[single-thread]** — income agency is "the worst element of Catan"; players invent pity chits for resourceless rolls
  - https://scotscoop.com/board-game-reviews-the-settlers-of-catan (indexed snippet) — "the game can become not fun if you get cut off, robbed a lot, or the numbers your settlements and cities are next to don't get rolled"
  - https://www.dicebreaker.com/games/catan-1/opinion/catan-terrible-introduction (indexed snippet) — players "don't have any way of accessing a resource" end up "floundering in the water"
- **Frequency/severity:** High/Med — the drought variant of the luck complaint; distinct because it is about *which* good, not *how much*.
- **Category:** luck
- **Emberisle today?** Yes. Income is dice-driven; the only guaranteed floor is the 4:1 bank and dock rates (README.md "Docks", "Bank").
- **What Emberisle should do:** Accept, by design — but make the intended agency lever (docks) legible: every dock's rate visible on the coast at setup and on tap, so a player starved of ore can plan a 2:1 timber-dock route instead of feeling helpless. Never silently re-layout docks between games without showing the change.

### 4. The wayfarer feels personal: targeted theft that sours the table
- **Sources:**
  - https://scotscoop.com/board-game-reviews-the-settlers-of-catan — "the robber in Catan is one of the meanest villain characters in any board game"
  - https://boardgamegeek.com/thread/748707/fishermen-of-catan — "I've seen a lot of posts about people not liking the aggressive nature of the robber"
  - https://avclub.com (indexed snippet) — "the game forces you into regular conflict via its Robber mechanic"
- **Frequency/severity:** High — the most divisive single mechanic; groups bench it for beginners.
- **Category:** social
- **Emberisle today?** Yes. On a 7 the roller moves the wayfarer onto a different hex, blocks it, and "may steal one random card from a player who has a building there" (README.md "A seven").
- **What Emberisle should do:** Accept the mechanic (it is also the only catch-up valve), but depersonalize it in UI copy ("the wayfarer takes a card" — the piece acts, not the player), log every wayfarer move and steal verbosely so the hit never feels arbitrary, and add an official pre-game table toggle: gentle wayfarer (blocks the hex, no steal). Demand is proven by groups house-ruling the piece away; an official toggle beats a house rule.

### 5. Four-player games run 90+ minutes; length is why the box stays on the shelf
- **Sources:**
  - https://www.dicebreaker.com/games/catan-1/opinion/catan-terrible-introduction — "playthroughs featuring four players… going on for hours"
  - http://gamecabinet.com (indexed snippet) — "At around 90 minutes, sometimes a little less, it is paced a little slowly"
  - https://www.theodysseyonline.com/why-hate-board-games (indexed snippet) — "a monotony of rolling dice, waiting for your turn, and then rolling the dice again"
- **Frequency/severity:** High — length is the most common reason buyers say the game doesn't hit the table.
- **Category:** pacing
- **Emberisle today?** Partly. The rules are the same length, but the physical downtime cause is engineered out: every connected seat gets 120 s before the host's bot moves it (`server/host.mjs:54`), and trade offers auto-close after 20 s.
- **What Emberisle should do:** Keep the 120 s default and surface the countdown prominently in the HUD in 4-seat games. Do not shorten the 10 VP target by default; consider a lobby-selectable shorter target (e.g. 7 VP) as a future variant.

### 6. Downtime between turns kills momentum, especially at four players
- **Sources:**
  - https://www.theodysseyonline.com/why-hate-board-games (indexed snippet) — "a monotony of rolling dice, waiting for your turn, and then rolling the dice again"
  - https://www.neogaf.com ("The New Board Game Thread", p.190, indexed snippet) — "I played the longest game of vanilla Catan ever and it made me want to never play it again. The final score was 10, 9, 9, 9."
  - http://gamecabinet.com (indexed snippet) — pacing "compounded if you suffer excess downtime"
- **Frequency/severity:** High — "made me want to never play it again" is the strongest quit-signal in the corpus.
- **Category:** pacing
- **Emberisle today?** Partly. Physical downtime is gone and the 120 s timer plus bot-takeover caps analysis-paralysis stalls (`server/host.mjs:54, 387-396`), but a 4-seat game to 10 VP is still long by nature.
- **What Emberisle should do:** Keep the timer; surface the countdown prominently and keep the bot-takeover log line ("the table moved on") so slow seats never hold the table hostage. (Inferred: consider a shorter default for 3-seat tables.)

### 7. Where you place your first two outposts decides the whole game
- **Sources:**
  - https://www.dicebreaker.com/games/catan-1/opinion/catan-terrible-introduction — "Where players decide to place their first two settlements can decide the entire outcome of their game"
  - https://meepletrail.com/how-to-play-catan-board-game — "The biggest setup mistake is ignoring probability. Settling on a 4 and an 11 because they're geographically convenient is a trap."
  - https://medium.com ("How I Built the Best Catan Board", indexed snippet) — "This gives the first player a huge advantage"
- **Frequency/severity:** High — stated as outcome-deciding, not just influential.
- **Category:** rules (with luck fallout)
- **Emberisle today?** Partly. The snake draft and roll-off for placement order already remove dealer's-choice seating bias (README.md "Setup": highest roll places first, ties roll again; rematch winner places first). The island is 19 hexes with rotatable dock positions (README.md "Land", "Docks").
- **What Emberisle should do:** Keep the roll-off. Make number-token probability legible the way the physical dots do — tokens are already required to be "rimmed and legible" — so the 4-and-11 trap is visible *before* placement, and let the placement UI glow only legal corners so the distance rule is taught by affordance.

### 8. Kingmaking: trades and gifts let two players decide the third's game
- **Sources:**
  - https://boardgamegeek.com/thread/748707/fishermen-of-catan **[single-thread]** — "one player can simply choose to make any other player win that he wants to, making the entire game a pointless enterprise"; "The three games of Catan I played with inter-player trading were all miserable experiences"
  - https://www.neogaf.com ("The New Board Game Thread", p.191, indexed snippet) — "Someone once gave me a win, just because they were tired of playing. This really pissed off the person who was in second"
- **Frequency/severity:** High/Med — "game-killer" severity where it happens; acute in competitive groups, invisible in friendly ones.
- **Category:** social
- **Emberisle today?** Yes. Table trading with accept/decline exists; trade asks hard-expire after 20 s and close when the asker's turn ends, so spite can't hold the table hostage indefinitely.
- **What Emberisle should do:** Keep open trading (it is the social core), but make every deal public and logged: offers and accepts announced in the shared game log with both sides named, so kingmaking is at least transparent instead of whispered. Never allow secret/whisper trades. Practice-vs-bots stays the collusion-free mode.

### 9. Runaway leader: the outcome feels decided long before the 10th point
- **Sources:**
  - https://bluedragonboardgames.com/catan-board-game/ — "Runaway leader can be hard to stop late game"
  - https://scotscoop.com/board-game-reviews-the-settlers-of-catan — "some games are landslides"
  - https://www.neogaf.com ("The New Board Game Thread", p.191, indexed snippet) — "you have to gang up on leader in most cases in order to prevent runaway leader"
- **Frequency/severity:** High/Med — cited in most critical reviews, though defenders call targeting-the-leader a feature.
- **Category:** social
- **Emberisle today?** Yes. First to 10 VP with the same positive-feedback shape, plus the same 2-VP swing awards (README.md "Points").
- **What Emberisle should do:** Accept, by design — the intended catch-up is social (wayfarer targeting, refusing the leader trades) plus the 5 hidden-point fortunes (README.md "Pieces") that keep the visible score uncertain. Do not add rubber-banding; it would corrupt the 10-VP race. Emberisle's edge over physical: the 120 s clock caps how long a decided endgame can drag, and hidden hands mean the leader's true score is never as readable as fanned cards on a table.

### 10. Trading stalls: nobody trades with the leader, and the 4:1 bank feels awful
- **Sources:**
  - https://www.dicebreaker.com/games/catan-1/opinion/catan-terrible-introduction (indexed snippet) — "players can simply decline any trade offer they don't want, leaving other players who don't have any way of accessing a resource floundering in the water"
  - https://avclub.com (indexed snippet) — "if other players think that's more likely to help you than them, they can decline and force you to trade in your resources to the bank at a terrible rate of four to one"
  - http://wolfsgamingblog.com/2013/12/14/settlers-of-catan-board-game-review/ — the 4:1 bank "will leave you high and dry"
- **Frequency/severity:** Med — a structural complaint; "terrible rate of four to one" is the memorable phrasing.
- **Category:** social
- **Emberisle today?** Yes. Bank is 4:1, docks 2:1/3:1 (README.md "Docks", "Bank"); human trade refusal is legal and expected.
- **What Emberisle should do:** Accept, by design. Keep bot trade logic self-interested but fair (practice bots take/ask only when it helps them), so practice games never teach players that the table must bail them out. Keep the bank trade one tap at the printed rate — the escape hatch must never feel hidden.

### 11. Sevens come in clusters, and each one costs half your hand
- **Sources:**
  - https://meepletrail.com/how-to-play-catan-board-game — "If you're holding 8+ cards when a 7 hits, you lose half. This changes how aggressively you should hoard."
  - http://gamecabinet.com (indexed snippet) — "It's particularly aggravating if you yourself roll the 7 that causes you to lose the commodity cards that would have enabled you to build"
  - https://manuals.plus/m/54255510454f6f64910e92332f317a4c4f88f47eb83e738a1fa366f8e0456b4d.pdf (New Yorker profile) — "every time a seven is rolled players with too many resources have to give some back"
- **Frequency/severity:** Med/High — a persistent "feels bad" rule; the self-rolled-7 variant is the sharpest.
- **Category:** rules
- **Emberisle today?** Yes. "Anyone with more than 7 cards discards half, rounded down" (README.md "A seven"); idle discards are halved by the bot.
- **What Emberisle should do:** Accept the rule; fix the *surprise*. Add a pre-roll warning in the hand UI when a seat holds 8+ goods ("a 7 costs you half") — cheap, and fits the "board-first, minimal chrome" north star (`docs/design/polish.md`) because it only appears at the decision point. (Inferred: not currently in the repo.)

### 12. Fortune swings: monopoly empties hands, a lucky draw ends it out of nowhere
- **Sources:**
  - https://www.gamesradar.com/tabletop-gaming/catan-review/ — "stealing peoples entire hand of cards, it can get pretty rough"
  - https://news.ycombinator.com/item?id=7249801 (indexed snippet) — "Trade away all of a scarce resource you have, then use the monopoly card to get them back" / "I don't negotiate with terrorists."
  - https://www.brainpickle.app/api/pdf/a%2Fcatan — monopoly "lets you take all of one resource from every other player"
- **Frequency/severity:** Med — the monopoly double-cross is a famous table story.
- **Category:** luck
- **Emberisle today?** Yes. Same 25-fortune deck: 14 knights, 2 path-building, 2 plenty, 2 monopoly, 5 hidden points; a fortune bought this turn cannot be played this turn (README.md "Pieces").
- **What Emberisle should do:** Accept, by design — the "not the turn bought" rule is already the anti-swing guardrail. Add the remaining deck count to the fortune tray so players can reason about monopoly/plenty odds instead of feeling ambushed. (Inferred: not currently in the repo.)

### 13. Hidden points and award steals: surprise endings feel unearned
- **Sources:**
  - https://boardgamegeek.com/thread/417160/catans-victory-points **[single-thread]** — "we were all caught by surprise, because 7 points seems a long ways from 10"; "won by scoring three points in his last turn (a settlement or city and stealing the Longest Road or Largest Army)"
  - https://thegamer.com ("Popular Board Games That I Actually Dislike", indexed snippet) — "with hidden victory points, you don't even know if you have a chance of catching up. It feels like you're playing a game without a scoreboard"
- **Frequency/severity:** Med — the 2-VP award swing ("simply devastating" per the same BGG thread) plus hidden points makes losses feel unearned.
- **Category:** rules
- **Emberisle today?** Yes. Five hidden-point fortunes in the 25-card deck; longest path and largest army each worth 2 VP and transferable (README.md "Pieces", "Points").
- **What Emberisle should do:** Accept the tension (it is the point), but make soft totals legible: HUD shows visible VP with a persistent "hidden fortunes exist" hint, and any longest-path/largest-army change gets a prominent log + banner announcement, never a silent flip. Always reveal *which* fortune was played in the log (knight vs. monopoly matters for table reads) while keeping point fortunes hidden until the end.

### 14. Pile-ons: the table gangs up on whoever takes the lead
- **Sources:**
  - http://fairplaygames.com/raves.asp?NameFilter=Ian+Lai — "It's very easy to get ganged up by other players, making you feel extremely helpless"
  - https://scotscoop.com/board-game-reviews-the-settlers-of-catan — "with mean player interaction, including the robber, being the only major issue"
  - https://www.gamesradar.com/tabletop-gaming/catan-review/ — "take-that actions can cause tensions to run high"
- **Frequency/severity:** Med — acute in competitive groups, invisible in friendly ones.
- **Category:** social
- **Emberisle today?** Partly. Wayfarer targeting and trade refusal are core; trade asks expire after 20 s so a pile-on can't freeze the table, and bots never collude.
- **What Emberisle should do:** Accept residual pile-ons as by-design social play in a friends-only game. Log wayfarer/steal targets in the game log so patterns are visible rather than whispered. Optionally, the win screen's per-seat stats (goods lost to steals) give the table a shared, lighthearted record of who got dogpiled — which defuses more than it inflames.

### 15. Take-that intensity splits groups; some tables can't play together
- **Sources:**
  - https://scotscoop.com/board-game-reviews-the-settlers-of-catan — "with mean player interaction, including the robber, being the only major issue" (in a 6.5/10 review)
  - https://avclub.com (indexed snippet) — "(Monopoly might be mean, but it never forces players into attacking each other.)"
  - https://www.neogaf.com ("The New Board Game Thread", p.191, indexed snippet) — "there are trading decisions and robber decisions which ALWAYS piss people off"
- **Frequency/severity:** Med — the reason some groups shelf the game permanently.
- **Category:** social
- **Emberisle today?** Yes — same take-that core. Mitigations exist: practice-vs-bots is a spite-free mode, and the gentle-wayfarer toggle (see #4) gives sensitive tables an official dial.
- **What Emberisle should do:** Ship the gentle-wayfarer toggle and keep practice mode as the low-stakes on-ramp. Never add anti-teaming rules; in a friends-only game they'd read as nannying.

### 16. Locked to 3–4 players; 3-player games feel thin
- **Sources:**
  - https://bluedragonboardgames.com/catan-board-game/ — "Requires exactly 3–4 players (5–6 needs expansion)"
  - https://scotscoop.com/board-game-reviews-the-settlers-of-catan — "I usually pick Ticket to Ride because it plays 2-5 players, and Catan only allows for 3-4 players"
  - https://www.reddit.com/r/Catan/comments/43dq0b/three_player_catan_help/ (2016; via familygamerguide.com's indexed citation — Reddit page itself blocked) — a dedicated "Three player Catan help" thread
- **Frequency/severity:** Med — a purchase-regret complaint more than an in-game one.
- **Category:** rules
- **Emberisle today?** Yes. "Three or four players" (README.md "Rule set"). The paid-expansion half doesn't exist: no accounts, no payments.
- **What Emberisle should do:** Accept 3–4 as the design (the island geometry is tuned for it). The physical complaint is really "I can't get 3–4 humans together" — and Emberisle already answers it: practice-vs-bots and hotseat fill seats instantly, and spectators can watch (up to the cap) so a 5th friend isn't excluded, just not seated.

### 17. Slow to teach; newcomers fall into pits they can't climb out of
- **Sources:**
  - https://www.beaconjournal.com (indexed snippet) — "the only downside is that it takes too long to learn"
  - https://www.dicebreaker.com/games/catan-1/opinion/catan-terrible-introduction — "Too many 'beginner' board games make the mistake of leaving potholes for players to fall into and have almost no way of getting out of"
  - https://static1.squarespace.com/static/6684b89f4dfc4f4372d1d77c/t/692a7da7d81cc236b39794a5/1764392359257/Catan+Writeup.pdf (design-research writeup) — "The names of components are ambiguous — e.g. pasture vs. wool vs. sheep"
- **Frequency/severity:** Med — a first-game tax, but it is the gateway-game complaint that matters for onboarding.
- **Category:** onboarding
- **Emberisle today?** Partly. The Names rule already fixes the vocabulary half: "Say timber, clay, wool, grain, ore, outpost, stronghold, path, fortune, and wayfarer" (README.md "Names") — no pasture/wool/sheep ambiguity. A How-to-play sheet exists, and practice-vs-bots is the learning table.
- **What Emberisle should do:** Keep the distinct names (they are the fix). Make practice mode the tutorial: a first-game overlay that highlights what to tap in order (roll → collect → build a path → found an outpost), then gets out of the way. Don't gate the real game behind a tutorial — the north star is minimal chrome.

### 18. The wayfarer punishes new players; experienced groups bench it for beginners
- **Sources:**
  - https://boardgamegeek.com/thread/417160/catans-victory-points **[single-thread]** — "The robber starts off… (or off the board, if we have newbies)"
  - https://www.dicebreaker.com/games/catan-1/opinion/catan-terrible-introduction — beginners left with "almost no way of getting out" of early mistakes
  - https://thegamer.com ("These Board Games Are Great, But Have One Annoying Rule", indexed snippet) — "one player can end up feeling incredibly punished by the end of the game"
- **Frequency/severity:** Med — newbie-hostile enough that experienced groups pre-nerf the piece.
- **Category:** onboarding
- **Emberisle today?** Yes. The wayfarer is fully live from turn one (README.md "A seven"); a new player's first 7 can mean discarding half a hand *and* losing a hex *and* being stolen from.
- **What Emberisle should do:** Default practice tables to gentle wayfarer (block-only, no steal) until the human's first win — teaches the piece's blocking role before its teeth. (Inferred proposal.)

### 19. Beginner setup mistakes decide their game before it starts
- **Sources:**
  - https://meepletrail.com/how-to-play-catan-board-game — "The biggest setup mistake is ignoring probability. Settling on a 4 and an 11 because they're geographically convenient is a trap."
  - https://www.dicebreaker.com/games/catan-1/opinion/catan-terrible-introduction — "Where players decide to place their first two settlements can decide the entire outcome of their game"
  - http://elusivemeeple.com/2017/05/20/catan-review/ — games turn on "the probability of each resource" plus forced low-probability picks
- **Frequency/severity:** Med — the dominant *strategic* complaint (distinct from pure luck: it's about setup leverage).
- **Category:** onboarding
- **Emberisle today?** Partly. Same snake draft, but the roll-off removes seating bias (README.md "Setup") and number tokens are already required to be rimmed and legible.
- **What Emberisle should do:** Ensure the probability pips are as prominent as the digits so the 4-and-11 trap is visible *before* placement. A 60-second interactive setup coach in practice mode (place your two outposts with live pip hints) teaches this once, then never appears again.

### 20. The distance rule trips up placements and sparks arguments
- **Sources:**
  - https://meepletrail.com/how-to-play-catan-board-game — "Rules mistakes that actually change the game: ... Violating the distance rule"
  - https://static1.squarespace.com/static/6684b89f4dfc4f4372d1d77c/t/692a7da7d81cc236b39794a5/1764392359257/Catan+Writeup.pdf (design-research writeup) — component/rule ambiguity as a recurring new-player failure
- **Frequency/severity:** Med — evergreen rules-argument fuel.
- **Category:** rules
- **Emberisle today?** No. "An outpost must not touch another building, including your own" (README.md "Setup") is enforced by code, and the placement flow already glows only legal corners.
- **What Emberisle should do:** Nothing — already solved by digital enforcement. Keep the one-rule-one-check prove discipline (`server/rules-prove.mjs`) so it stays solved.

### 21. Commonly misplayed rules cause mid-game arguments
- **Sources:**
  - https://officialgamerules.org (indexed snippet) — commonly misplayed: "You can trade before moving the robber after a 7", "Resources can be gifted or traded on credit", "You can win as soon as you reach 10 points" (actual rule: only on your own turn)
  - https://thegamer.com (indexed snippet) — "they place two settlements and then take starting resources from tiles adjacent to each settlement… Technically, you're only supposed to take starting resources from your second settlement placement"
- **Frequency/severity:** Med — rules-argument threads are evergreen.
- **Category:** rules
- **Emberisle today?** No. Every Rule-set line has a proof (`server/rules-prove.mjs`); the server is the only rules engine and clients can't reinterpret.
- **What Emberisle should do:** Nothing — already solved. Keep the proofs running so it stays solved.

### 22. Five-to-six-player games drag unbearably
- **Sources:**
  - https://www.neogaf.com ("The New Board Game Thread", p.190, indexed snippet) — "my group outlawed Catan 5-6 player expansions for this reason. most of the time it drags the game on way too long and makes it miserable"
  - https://thatsagoodgame.com (indexed snippet) — "when you stretch to 5 or 6 players… the downtime between 5 and 6 players is just a bit much for me"
- **Frequency/severity:** Med — groups "outlaw" the expansion over it.
- **Category:** pacing
- **Emberisle today?** No. Emberisle is 3–4 players only (README.md "Rule set").
- **What Emberisle should do:** Accept, by design — the player-count cap already resolves it. Do not add 5–6 seats.

### 23. Endgame drags after the winner is effectively decided
- **Sources:**
  - https://boardgamegeek.com/thread/417160/catans-victory-points **[single-thread]** — "Some games are already too long playing to 10 VP, so at 12, it'll drag on even further. Possibly another hour."
  - https://www.neogaf.com ("The New Board Game Thread", p.190, indexed snippet) — "I played the longest game of vanilla Catan ever and it made me want to never play it again. The final score was 10, 9, 9, 9."
- **Frequency/severity:** Med — quantified as +1 hour per 2 VP in the BGG thread.
- **Category:** pacing
- **Emberisle today?** Partly. Fixed 10 VP target (README.md "Rule set"), but the 120 s turn timer caps how long a decided endgame can drag (`server/host.mjs:54`).
- **What Emberisle should do:** Keep the timer as the pacing backstop. Consider a lobby-selectable shorter VP target (e.g. 7 VP) as a future variant for weeknights — not a default change.

### 24. Setup is a chore: sorting 19 hexes, tokens, cards, and docks
- **Sources:**
  - https://www.gamesradar.com/tabletop-gaming/catan-review/ — "fitting together the board pieces can be a headache"
  - http://notmyreallife.qualitycloudsystems.com/2021/09/catan-3d-review.html — "these pieces still slide, shift, and move when someone's finger accidentally touches them"
- **Frequency/severity:** Low/Med — a constant low-grade annoyance, rarely the reason for a 1-star rating.
- **Category:** pacing
- **Emberisle today?** No. The island is dealt by code (`src/lib/game/board.ts`); there is no setup chore and no shuffle to mistrust.
- **What Emberisle should do:** Nothing — already solved. Protect it: keep setup instant (no "dealing" animation that reintroduces the wait).

### 25. Veterans burn out and go looking for a replacement
- **Sources:**
  - https://boardgamegeek.com/thread/2740507/games-that-might-replace-my-family-addiction-to-ca — "I cant handle it anymore!" / "it completely killed any affection I had for it"
  - https://boardgamegeek.com/thread/2319426/which-famous-game-do-you-really-dislike/page/4 **[single-thread]** — "it's a design that has aged really poorly (for me)"
- **Frequency/severity:** Med — a whole thread of veterans seeking a replacement; burnout takes years of play.
- **Category:** social
- **Emberisle today?** Partly. Fresh game now, but it's the same 10-VP race loop; the rematch rule (last winner places first, others roll off — README.md "Setup") is the built-in variety lever.
- **What Emberisle should do:** Accept, by design. Don't over-rotate on a complaint that manifests after hundreds of plays; the randomized island + roll-off rematches are the correct long-term answers. Revisit only if session data shows drop-off.

### 26. The wayfarer camps: the piece sits on your best hex all game
- **Sources:**
  - https://thegamer.com ("These Board Games Are Great, But Have One Annoying Rule", indexed snippet) — the robber "gets stuck on one space for too long" and "one player can end up feeling incredibly punished by the end of the game"
  - https://avclub.com (indexed snippet) — the piece "tends to be a way to mess with whoever's in the lead"
- **Frequency/severity:** Low/Med — a sub-facet of the wayfarer complaint; acute when it happens.
- **Category:** social
- **Emberisle today?** Yes. Nothing forces the wayfarer to move except a new 7 (README.md "A seven": "moves the wayfarer onto a different hex" — only on a 7).
- **What Emberisle should do:** Accept the blocking (it's the point), but the gentle-wayfarer toggle (see #4) gives tables an official release valve. When the host's bot moves an idle seat's wayfarer, it should move it rather than let spite sit — already the bot's idle behavior.

### 27. Trade-before-build ordering mistakes
- **Sources:**
  - https://meepletrail.com/how-to-play-catan-board-game — "Trading after building. Can't do it. Trade first, build second."
- **Frequency/severity:** Low/Med — a classic new-player error.
- **Category:** rules
- **Emberisle today?** No — Emberisle's turn structure ("Then you may trade, build, buy fortunes" — README.md "A turn") is enforced by the server's phase logic, and in practice the digital game is more permissive than the physical rule anyway.
- **What Emberisle should do:** Nothing — the server decides legality. If the trade panel ever gates building, disable Build actions until the trade closes so the ordering can't be violated in the UI either.

### 28. Dock setup is confusing; the official layout even contradicts the rulebook
- **Sources:**
  - https://boardgamegeek.com/thread/873900/whats-up-with-the-weird-port-layout-of-the-5-6-pla **[single-thread]** — "Which seems crazy to me, leaving 1 vertex between some ports and 3 between others"; "Apparently, Mayfair says it's a misprint"
- **Frequency/severity:** Low/Med — severe enough to spawn third-party replacement frames.
- **Category:** rules
- **Emberisle today?** Partly. The rule set fixes 9 docks (5× 2:1, 4× 3:1) with rotation of which type sits where (README.md "Docks") — "may rotate" is exactly where the physical game went wrong.
- **What Emberisle should do:** Render dock type and rate unambiguously on the coast (icon + "2:1 timber" on tap, ≥44 px targets), and generate the layout from one code path so the board can never contradict the rules. Never silently re-layout between games without showing the change.

### 29. Five-to-six players needs a paid expansion
- **Sources:**
  - https://bluedragonboardgames.com/catan-board-game/ — "Requires exactly 3–4 players (5–6 needs expansion)"
  - https://wilsonsmedia.com/want-to-finally-add-catan-to-your-board-game-collection-these-are-the-versions-and-expansions-i-recommend/ — "the game can have an awkward number of players at exactly three or four"
- **Frequency/severity:** Low/Med — purchase-regret flavored.
- **Category:** monetisation
- **Emberisle today?** No. No accounts, no payments, no expansions to buy — the player-count cap is a design choice, not a paywall.
- **What Emberisle should do:** Accept, by design. Keep all rules content in the single free build so this complaint class can never transfer.

### 30. First-player setup-order advantage
- **Sources:**
  - https://medium.com ("How I Built the Best Catan Board", indexed snippet) — "This gives the first player a huge advantage"
  - https://www.dicebreaker.com/games/catan-1/opinion/catan-terrible-introduction — placement order "can decide the entire outcome of their game"
- **Frequency/severity:** Low/Med — folded into the setup complaint by most reviewers.
- **Category:** rules
- **Emberisle today?** Partly. Physical Catan seats by agreement; Emberisle runs a server-rolled roll-off (highest places first, ties roll again; rematch winner places first — README.md "Setup").
- **What Emberisle should do:** Keep the roll-off — it is already the fix. Show the roll-off dice prominently so the order reads as earned, not dealt.

### 31. Solved and repetitive after a few plays
- **Sources:**
  - https://thegamer.com (indexed snippet) — "by the third time, you're just staring at a board full of hexes, praying to the dice gods"
  - https://discussion.tekeli.li (indexed snippet) — "Turns out after 200 plays of a game… you get kinda bored."
  - https://www.dicebreaker.com/games/catan-1/opinion/catan-terrible-introduction — "Once you've played it the first couple of times, you've pretty much seen everything the core experience has to offer."
- **Frequency/severity:** Low/Med — real, but mostly from veterans; gateway players don't hit it.
- **Category:** pacing
- **Emberisle today?** Partly. Faithful clone by north-star design ("Offsuit × Catan", `docs/design/polish.md`); every island is randomly dealt, which is the entire variety engine.
- **What Emberisle should do:** Accept, by design. (Inferred: if replay-depth work ever happens, variant island layouts — not new mechanics — fit the north star best.)

### 32. Component names confuse: pasture vs. wool vs. sheep
- **Sources:**
  - https://static1.squarespace.com/static/6684b89f4dfc4f4372d1d77c/t/692a7da7d81cc236b39794a5/1764392359257/Catan+Writeup.pdf (design-research writeup) — "The names of components are ambiguous — e.g. pasture vs. wool vs. sheep"
- **Frequency/severity:** Low — a first-game tax, but a telling one.
- **Category:** onboarding
- **Emberisle today?** No. The Names rule fixes it outright: "Say timber, clay, wool, grain, ore, outpost, stronghold, path, fortune, and wayfarer" (README.md "Names").
- **What Emberisle should do:** Nothing — already solved. Guard the Names rule in review: every new UI string uses exactly these words.

### 33. Tiles slide and pieces drift when the table gets bumped
- **Sources:**
  - https://static1.squarespace.com/static/6684b89f4dfc4f4372d1d77c/t/692a7da7d81cc236b39794a5/1764392359257/Catan+Writeup.pdf (design-research writeup) — "Tiles slide around on the table"; "Roads, cities, settlements, and number tokens slide around on the board"
  - https://www.punstoppable.com (indexed snippet, r/Catan mirror, 141 upvotes) — players 3D-printing interlocking and magnetic-locking tile sets to fix loose hexes
- **Frequency/severity:** Low — a nuisance; the 3D-print fix threads show real demand but it's cosmetic.
- **Category:** UI
- **Emberisle today?** No. Digital board: pieces land with a snap and settle exactly at rest, and tokens can't wander within 0.39 of a hex centre.
- **What Emberisle should do:** Nothing — already solved by being digital. Keep piece placement forgiving on touch.

### 34. Starting-goods mistakes (only the second outpost pays)
- **Sources:**
  - https://thegamer.com (indexed snippet) — "they place two settlements and then take starting resources from tiles adjacent to each settlement… Technically, you're only supposed to take starting resources from your second settlement placement"
- **Frequency/severity:** Low — a setup-night error.
- **Category:** rules
- **Emberisle today?** No. "Only the second outpost pays starting goods: one card for each hex it touches" (README.md "Setup") is dealt by code.
- **What Emberisle should do:** Nothing — already solved. The setup flow should still *show* the starting goods landing so new players learn the rule by seeing it.

### 35. Component counts don't match the box and rules
- **Sources:**
  - https://boardgamegeek.com/thread/1892470/number-of-roads **[single-thread]** — "even though the back of the box AND the rules state 15 roads"; "the back of the box also states 27 Dev cards, but like standard Catan, there's only 25"
- **Frequency/severity:** Low — narrow (a licensed edition), but it's a trust complaint: the game contradicts its own documentation.
- **Category:** UI
- **Emberisle today?** No — digital, no physical counts to mismatch. The analog risk is client/server disagreement on piece stock (15 paths, 5 outposts, 4 strongholds — README.md "Pieces") or fortune-deck counts.
- **What Emberisle should do:** Already covered structurally: the all-bot proves assert "the cards, the piece stock and the win still add up" after every action. Keep one source of truth for stock (`src/lib/game/rules.ts`) and never hardcode counts in the client.

### 36. Win-timing rule misplayed (the win only counts on your own turn)
- **Sources:**
  - https://officialgamerules.org (indexed snippet) — commonly misplayed: "You can win as soon as you reach 10 points" (actual rule: only on your own turn)
- **Frequency/severity:** Low — a rules-nerd argument.
- **Category:** rules
- **Emberisle today?** No. The server decides the winner; a client can't declare early.
- **What Emberisle should do:** Nothing — already solved. The win screen should still name *how* the 10th point landed (which piece, which fortune) so the table learns the timing.

### 37. Gifting resources / trading on credit causes arguments
- **Sources:**
  - https://officialgamerules.org (indexed snippet) — commonly misplayed: "Resources can be gifted or traded on credit"
- **Frequency/severity:** Low — a house-rule argument starter.
- **Category:** rules
- **Emberisle today?** No. Trades are explicit give/want bags validated by the server ("Bad trade", "You lack those goods"); there's no mechanism for gifts or credit.
- **What Emberisle should do:** Nothing — already solved. Keep gifts impossible by construction; it removes a whole argument class.

### 38. The robber-before-trade ordering after a 7
- **Sources:**
  - https://officialgamerules.org (indexed snippet) — commonly misplayed: "You can trade before moving the robber after a 7"
- **Frequency/severity:** Low — sequencing pedantry, but it changes outcomes.
- **Category:** rules
- **Emberisle today?** No. The 7 sequence (discard → wayfarer move → steal) is server-driven; the client can't reorder it.
- **What Emberisle should do:** Nothing — already solved. The discard bar → wayfarer band → steal picker flow should visually teach the order.

### 39. Analysis paralysis on the opening placement
- **Sources:**
  - https://www.dicebreaker.com/games/catan-1/opinion/catan-terrible-introduction — setup as the game's most outcome-deciding moment, with new players "left with almost no way of getting out" of early mistakes (indexed snippet)
  - https://medium.com ("How I Built the Best Catan Board", indexed snippet) — first-placement advantage analysis driving over-deliberation
- **Frequency/severity:** Low — folded into pacing complaints by most reviewers; called out separately here because the fix is UI, not rules.
- **Category:** pacing
- **Emberisle today?** Partly. The 120 s turn timer covers setup placements too, and legal-corner glow narrows the choice set — but the timer is the only backstop.
- **What Emberisle should do:** Keep the timer. During setup, show each legal corner's adjacent token pips on hover/tap so the "probability read" that takes veterans minutes is instant for everyone. (Inferred: not currently in the repo.)

### 40. House-rule proliferation is itself the signal: players rewrite the game at three pressure points
- **Sources:**
  - https://boardgamegeek.com/thread/2740507/games-that-might-replace-my-family-addiction-to-ca — pity chits for resourceless rolls
  - https://boardgamegeek.com/thread/417160/catans-victory-points — 12-VP games to blunt lucky "cornering"
  - https://boardgamegeek.com/thread/873900/whats-up-with-the-weird-port-layout-of-the-5-6-pla — players redesigning the official dock layout
- **Frequency/severity:** Low severity per instance, but high frequency: 3 of 6 readable BGG threads show players rewriting rules (luck pity, game length, setup).
- **Category:** rules
- **Emberisle today?** Partly. Fixed digital rules prevent table variants — which removes the safety valve, not the pressure.
- **What Emberisle should do:** Ship a small set of *official* table options instead of one rigid ruleset: VP target, gentle/standard wayfarer, turn-timer length. Keep defaults pure (Offsuit restraint — `docs/design/polish.md` north star), but give groups the dials they're currently building out of cardboard and arguments.

---

## Researcher caveats (kept from the field notes)

- BGG: only 6 distinct complaint threads were locatable (search-index discovery; BGG's own forum/review/search pages returned 403, several candidate threads were individually walled). Items 8, 13, 18, 25, 28, 30, 35, 40 rest on a single thread each — flagged **[single-thread]** above. A live-browser pass over BGG's Catan Rules forum could backfill longest-road, 7-discard, and setup-time threads.
- Reddit: direct access blocked; quotes come from indexed snippets (labeled). A live-browser pass over r/Catan, r/boardgames, and r/tabletop should backfill per-thread sources and upvote counts.
- YouTube: no complaint-focused essay with quotable timestamped points was verifiable; the slot could not be filled with real evidence.
- Amazon: review *text* was not retrievable via the allowed fetch; Amazon contributed aggregate ratings only.
