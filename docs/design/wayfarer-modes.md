# Wayfarer setup

Choose On, Gentle or Off in the title's Wayfarer disclosure before creating a table. Practice, online and hotseat have separate choices. Online/hotseat default On. Practice defaults Gentle until a human wins practice on this browser, then On. A choice overrides the next creation; a practice bot's win does not count.

| Rule | On | Gentle | Off |
| --- | --- | --- | --- |
| Seven with more than seven goods | Discard half, rounded down | Same | Same |
| After all discards | Move wayfarer | Move wayfarer | Continue main phase |
| Movement / blocking | Yes | Yes | No |
| Take a card | Classic adjacent victim | Never | Never |
| Wayfarer fortune | Move/block/take | Move/block | Targetless **Muster** |
| Army | Each played Wayfarer counts | Same | Muster counts |

Muster consumes one old Wayfarer, adds one to the army, uses the one-fortune-per-turn allowance and preserves the roll/main phase. Largest army remains minimum three, worth two points. Bought-this-turn cards still wait. A supplied land/victim is refused in Off; Gentle refuses a victim rather than silently taking a card.

The host saves the immutable creation rule in table metadata and game state. Guests can read it in the lobby. Rejoin, reload, host restart and rematch preserve it. Changing the rule requires a new table. Legacy saves without the field use On. Off starts with no blocked hex and ignores any stale blocked flag during production.

Scene ownership remains with Claude: this change does not alter rendering. In Off, the existing ornamental wayfarer remains parked on waste with no movement, blocking or theft; its logical home id stays valid. Scene code may hide that idle piece by reading `game.wayfarerMode === "off"`.

Proofs: `wayfarer-modes-prove` exercises rules and complete bot games in every mode; `wayfarer-setup-prove` exercises real creation controls and hosted persistence. Existing contrast and safe-area proofs remain required.
