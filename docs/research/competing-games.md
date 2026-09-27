# Research: why online hex-settler ports succeed or fail (issue #144)

- step: 1 Research, standalone node #144
- date: 2026-09-27
- agent: Claude

## What I read

Web search results (no local code) on: the official Catan Universe app's reception and shutdown history,
Colonist.io's growth and feature set, App Store / Steam / forum complaints about Catan Universe, and general
writing on why digital board game adaptations succeed or fail. Sources are listed at the bottom of each
section below.

## What is true

### Catan Universe (the official app) — what drives players away

- **Paywalls on core play, not cosmetics.** Reviewers report being forced onto the same beginner map
  roughly 75% of the time unless they pay, and being rate-limited to one game per 12 hours as a free
  player. The store is also described as confusing about what a purchase actually unlocks.
- **Reliability.** Multiple reports of the app being "completely bugged" at 4 players, plus lag, freezes,
  and bots that ignore their own turn timer.
- **Customer service.** At least one reviewer paid for in-game currency that never arrived and got only
  automated replies for a week.
- A related but separate product, *Catan: World Explorers* (an MMO spin-off, not Universe), shut down
  entirely in November 2021. The stated reason was that the design never found a way to translate Catan
  into an MMO — a caution about stretching a game's core loop into a genre it wasn't built for, not a
  caution about anything Emberisle is doing.

Sources: [Catan Universe App Store listing](https://apps.apple.com/us/app/catan-universe/id1220346113),
[Steam Community negative reviews](https://steamcommunity.com/app/544730/negativereviews/?p=1&browsefilter=trendyear),
[Catan: World Explorers (Wikipedia)](https://en.wikipedia.org/wiki/Catan:_World_Explorers)

### Colonist.io — what drives players to it and keeps them

- **Zero friction.** Runs in the browser, no download, no account, no payment to play. Click a link,
  you're in.
- **It rode a real growth curve.** Reported active users went from ~53,000 (Jan 2020) to ~700,000
  (Jan 2021), with 13M+ games played, coinciding with pandemic demand for online tabletop.
- **A shareable room code for private games with friends** — the same shape as Emberisle's own 4-character
  code, not a coincidence worth re-deriving: it's the low-friction pattern that already won this genre once.
- **Shipped constantly.** New features and graphics on close to a weekly cadence, which reviewers credit
  for keeping the platform feeling alive rather than abandoned.
- **A social layer:** built-in chat, emotes, and a friends list. This is exactly the shape of Emberisle's
  own planned table chat and emoji reactions (#117-#121).
- **Replay variety without pay-to-win:** custom maps/map editor, classic expansions (seafarers, barbarians),
  speed modes, seasonal events, ranked play for players who want competition on top of casual games.

Sources: [Inverse: how Colonist built an online empire during quarantine](https://www.inverse.com/gaming/colonist-settlers-of-catan-online-free-game),
[Colonist.io](https://colonist.io/), [OnlineParty.Games: Colonist.io](https://onlineparty.games/games/board-games/colonist-io)

### General lessons for digital adaptations (BGG design discussion)

- Automate the tedious bookkeeping (dealing, counting, setup math) but keep the small tactile moments —
  placing a piece, watching a rolled die, drawing a card — that make it still feel like the board game.
  Automating those away is what makes a digital port feel hollow even when it is technically correct.
- Onboarding is the real barrier for anyone new to this genre. The strongest digital versions teach through
  the UI itself (highlighting what you can click, why) instead of requiring an experienced friend at the
  table to explain the rules first.

Sources: [BGG: the minefield of digital board game adaptations](https://boardgamegeek.com/thread/3248621/the-minefield-of-digital-board-game-adaptations),
[BGG: what makes or breaks a digital adaptation](https://boardgamegeek.com/thread/2853118/general-review-of-digital-board-games-what-makes-o),
[cjleo.com: what Root and others gain and lose in digital format](https://cjleo.com/blog/what-root-and-other-board-games-gain-and-lose-in-digital-format/)

### What this means for Emberisle specifically

- **The architecture already matches the winner, not the loser.** Browser-based, a 4-character code, no
  account, no payment, host on a PC and friends click a link (`npm run night`, #87) — that is Colonist's
  winning shape, not Catan Universe's losing one. Nothing here argues for changing that.
- **Never add friction that isn't there today.** No rate limits, no forced maps, no paywall — none of this
  is currently planned, and this research is a reason to keep it that way, not a reason to add a "Do not"
  line for a temptation nobody has raised.
- **Reliability is the one failure mode that transfers directly.** Catan Universe's "unplayable at 4
  players" complaints are exactly the seat count Emberisle supports. The existing test discipline
  (`table-prove.mjs` at 3 and 4 seats, `tabs-prove.mjs`, `client-prove.mjs`) is the right defense as new
  features (chat, the color picker in #142, camera modes from #128) land — keep every one of them green
  through 4-seat games, not just 3.
- **The social layer already on the roadmap is the right bet.** #117-#121 (table chat and emoji reactions)
  is precisely the feature Colonist's own players credit for stickiness. No change to that plan, just a
  confirmation it is worth finishing.
- **The two feature requests filed alongside this research are both validated by a competitor already
  shipping them:** a color picker (#142) is table stakes in every version of this genre, and Colonist's
  "extensive game settings" (map, rules, expansions) is the same shape of request as a first-player roll-off
  (#143).

## What I am not sure about

- Whether Catan Universe's current (2026) state still matches these reports, since most of the review
  evidence is from 2023-2024 discussions; the underlying pattern (paywall + reliability + support) is
  consistent across enough sources to trust the shape of it, not necessarily today's exact numbers.
- I could not find Reddit threads specifically about a first-player dice roll-off or turn timers for
  Catan-likes; the "extensive game settings" and "house rules" pattern comes from Colonist's own feature
  list and general digital-adaptation writing, not a direct quote calling out a roll-off by name.

## Prove output

N/A — this is a web research note, no repo code changed and no command to run.

## Handoff

```
done: surveyed why Catan Universe loses players (paywall, bugs, support) and why Colonist.io won them
      (zero friction, shareable code, social layer, constant shipping); wrote docs/research/competing-games.md
left: nothing further scoped from this note beyond what it already validates (#142, #143, #117-121).
      Two speculative, low-priority ideas that came out of the "onboarding" and "replay variety" reading
      went to docs/IDEAS.md instead of the tracker, per FRAMEWORK.md §8 — they are not something Jarrod
      asked for, just something this research noticed.
broke: nothing
next agent: none required. If Jarrod wants either IDEAS.md line built, follow §8 to turn it into a node.
```
