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
- **Emberisle today:** Bot seats do not answer “Ask the table,” and bots do not make offers. In an online game, that leaves asks unanswered when a bot has taken a disconnected player's seat; in practice, players have no bot trading.

## Options

1. **No bot trades.** Keep the existing behavior and document it. Easiest to reason about, but leaves online asks unanswered and practice without player trades.
2. **Bots answer player asks.** Bots accept only deals that help their game plan and otherwise decline. This fixes the unanswered-seat problem but makes bots passive.
3. **Bots answer and make occasional offers.** Evaluate incoming asks and let a bot propose a useful trade on its turn, with rate and turn limits. This gives players active trade partners while bounding interruptions.

## Recommendation

Keep Jarrod's recorded decision: bots both answer asks and make their own offers. Use one shared trade-evaluation policy for both paths so the bot does not accept trades it would not propose. Require the deal to improve the bot's resources or advance a current build goal; decline offers that do not help, and avoid helping the current leader late in the game. Limit each bot to one outgoing ask per turn, pause its turn while that offer is open, and delay incoming responses briefly so a human can answer first.

The work is already split into evaluation (#404), online host wiring (#414), and practice-mode wiring (#445). Hotseat has no bots, so it needs no bot-trade behavior.

## What I am not sure about

- Colonist's patch notes describe outcomes but not enough detail to reproduce its current bot scoring or late-game threshold. Emberisle should treat those as product signals, not a formula to copy.
- How long an offer should remain open and the exact definition of “late game” are implementation choices for the child issues; the recorded decision specifies the feature split, but not every tuning value.

## Prove output

(research gate — no command)

## Handoff

```
done: compared human-only CATAN trading with Colonist's bot-trading behavior; recommended bots answer and initiate offers under one shared, bounded evaluation policy
left: implementation is tracked in #404, #414, and #445
broke: nothing
next agent: continue the evaluation child #404, then host and practice wiring as dependencies allow
```
