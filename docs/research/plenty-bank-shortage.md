# Research: Year of Plenty when the bank is short (issue #360)

- step: 1 Research, decision #360
- date: 2026-10-05
- agent: ChatGPT

## What I read

- The options and Jarrod's decision on [#360](https://github.com/jarrodjohnson-gif/emberisle/issues/360).
- CATAN's [2025 rulebook](https://www.catan.com/sites/default/files/2025-03/CN3081%20CATAN%E2%80%93The%20Game%20Rulebook%20secure%20%281%29.pdf), especially “Invention” (the renamed Year of Plenty) on p. 9.
- CATAN's [base-game FAQ](https://www.catan.com/faq/basegame) on resource shortages during production.
- Colonist's [rules](https://colonist.io/catan-rules) and [patch notes](https://colonist.io/patch-notes) (v65 and v93 entries about unavailable resources and Year of Plenty).

## What is true

- **CATAN:** Invention lets the player take any two resource cards from the supply; they may be the same or different. The shortage FAQ describes what happens when production cannot pay all players, but does not specify a separate partial-payment rule for Invention.
- **Colonist:** Its published patch notes record fixes for consuming Year of Plenty when the bank could not supply a request (v65, 2020) and for requests involving an unavailable resource (v93, 2020). Those entries show that unavailable requests need validation, but do not establish the exact current UI behavior in every shortage case.
- **Emberisle today:** the #410 fix is shipped. The HUD disables resource choices with zero bank stock, and `playPlenty` validates the full pair in the rules. If the bank cannot pay either named resource (including two of a resource when only one remains), the action is rejected, the error explains the shortage, and the Year of Plenty card stays in hand.

## Options

1. **Refuse an unpayable selection.** Keep the card, explain the shortage, and allow the player to choose another legal pair.
2. **Partially pay.** Spend the card, grant whatever is available, and report the shortfall. This is surprising when the player selected a specific pair.
3. **Prevent empty-stock choices in the HUD and validate in the rules.** Grey out resources with no stock and reject any pair the bank cannot pay in full as a backstop.

## Recommendation

Keep the shipped option 3 behavior selected in Jarrod's decision comment. Treat the two cards as an exact request: grey out zero-stock resources, then have the rules reject any unaffordable pair and leave the fortune card unspent. The rules also reject a repeated resource if the bank has only one copy; the UI does not need to predict every pair because the rules are authoritative. This follows CATAN's two-card instruction and avoids silently turning the card into a partial payment.

The UI makes empty stock understandable before the player commits; the rules layer covers repeated resources and mixed pairs. `server/rules-prove.mjs` checks both a zero-stock ore request and asking for two grain when only one remains, including that the card stays in hand. `scripts/hotseat-prove.mjs` checks the empty-stock choice is disabled in the HUD.

## What I am not sure about

- Colonist's current interface and exact handling when the total bank has fewer than two cards; its notes confirm fixes, but not the current edge-case policy.
- CATAN's rulebook does not spell out what happens if the supply has fewer than two cards total when Invention is played. The recommendation applies the card's “take two” instruction strictly and keeps it unspent if that cannot be satisfied.

## Prove output

(research gate — no command)

## Handoff

```
done: compared exact refusal, partial payment, and constrained selection; documented the shipped #410 HUD guard and rules validation, retaining the card on invalid or impossible requests
left: none for the selected #360 behavior
broke: nothing
next agent: no implementation follow-up required for #360
```
