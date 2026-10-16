# Wayfarer setup

Choose On or Off in the title's Wayfarer disclosure before creating a table. Practice, online and hotseat have separate choices, all defaulting to On. A choice sticks for every game made without returning to the title menu (rematch, play again, a new practice or hotseat game); going back to the title menu resets all three to On.

| Rule | On | Off |
| --- | --- | --- |
| Seven with more than seven goods | Discard half, rounded down | Same |
| After all discards | Move wayfarer | Continue main phase |
| Movement / blocking | Yes | No |
| Take a card | Classic adjacent victim | Never |
| Wayfarer fortune | Move/block/take | Targetless **Muster** |
| Army | Each played Wayfarer counts | Muster counts |

Muster consumes one old Wayfarer, adds one to the army, uses the one-fortune-per-turn allowance and preserves the roll/main phase. Largest army remains minimum three, worth two points. Bought-this-turn cards still wait. A supplied land/victim is refused in Off.

The host saves the immutable creation rule in table metadata and game state. Guests can read it in the lobby. Rejoin, reload, host restart and rematch preserve it. Changing the rule requires a new table. Legacy saves without the field use On. Off starts with no blocked hex and ignores any stale blocked flag during production.

Scene ownership remains with Claude: this change does not alter rendering. In Off, the existing ornamental wayfarer remains parked on waste with no movement, blocking or theft; its logical home id stays valid. Scene code may hide that idle piece by reading `game.wayfarerMode === "off"`.

Proofs: `wayfarer-modes-prove` exercises rules and complete bot games in both modes; `wayfarer-setup-prove` exercises real creation controls and hosted persistence. Existing contrast and safe-area proofs remain required.
