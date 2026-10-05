# Research: whether bots trade with players (issue #363)

- step: 1 Research, decision #363
- date: 2026-10-05
- agent: ChatGPT

## What I read

- Jarrod's decision and child-issue comments on [#363](https://github.com/jarrodjohnson-gif/emberisle/issues/363).
- CATAN's [2025 rulebook](https://www.catan.com/sites/default/files/2025-03/CN3081%20CATAN%E2%80%93The%20Game%20Rulebook%20secure%20%281%29.pdf), player-trading section.
- Colonist's [trade-system overview](https://blog.colonist.io/improving-the-colonist-trade-system/) and [patch notes](https://colonist.io/patch-notes), including v175 (2023).

## What is true

- **CATAN:** During their turn, a player may trade with other players; those players can accept, reject, or make a counteroffer. The tabletop rules describe human-to-human offers and do not define how an automated player should value or answer a trade.
- **Colonist:** Its trading interface supports offers, responses, and counteroffers. Its published patch notes describe bots making and accepting offers, declining bad trades, avoiding deals that help the leader late in a game, and delaying acceptance while a disconnected player's offer is pending. This establishes that bots trade, though the notes do not expose a complete current evaluation formula.
- **Emberisle today:** bot trading is shipped in online and practice games (#404, #414, #445; practice wiring merged in #450). Bots answer human offers and can make one ask per turn. Hotseat has no bot seats.

## Options

1. **No bot trades.** Keep the existing behavior and document it. Easiest to reason about, but leaves online asks unanswered and practice without player trades.
2. **Bots answer player asks.** Bots accept only deals that help their game plan and otherwise decline. This fixes the unanswered-seat problem but makes bots passive.
3. **Bots answer and make occasional offers.** Evaluate incoming asks and let a bot propose a useful trade on its turn, with rate and turn limits. This gives players active trade partners while bounding interruptions.

## Recommendation

Keep Jarrod's recorded decision; both kinds of bot trading are already implemented. The shipped policy is:

- **Answering an offer:** `shouldAcceptTrade` rejects offers the bot cannot pay, offers that give it fewer cards than it gives, and offers from a player tied for the highest public VP when that player is ahead of the bot. It accepts only if the trade reduces how many resource cards the bot is missing for its current next-build goal.
- **Making an offer:** `chooseTradeAsk` runs only for the current bot during the main phase, with no other offer open. It asks only when exactly one resource is missing for its next build, offering one card of its largest surplus resource for one card of the missing resource.
- **Limits and timing:** a bot makes at most one ask per turn and waits for its own offer to close before continuing. Offers close after 20 seconds. Other bots answer after a randomized one-to-two-second delay, leaving people a chance to respond first. The same decision helpers are used in online host and practice mode.

The decision helpers live in `src/lib/game/ai.ts`; the online host calls them from `server/host.mjs`, and practice mode uses the same helpers in `src/lib/game/store.ts`. This is the behavior to review against play, not a feature that still needs implementation.

## What I am not sure about

- Colonist's patch notes describe outcomes but not enough detail to reproduce its current bot scoring or late-game threshold. Emberisle should treat those as product signals, not a formula to copy.
- Whether the 20-second offer window, one-to-two-second response delay, and current build-goal scoring need tuning is open to future playtesting. Any scoring change should be a new product decision; this brief describes the shipped rule.

## Prove output

(research gate — no command)

## Handoff

```
done: compared human-only CATAN trading with Colonist's bot-trading behavior; documented shipped online and practice bot offers, answer rules, and limits
left: review scoring and timing only if playtesting raises a new decision
broke: nothing
next agent: no implementation follow-up required for #363
```
