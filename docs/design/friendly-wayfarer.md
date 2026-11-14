# Design: Friendly Wayfarer Table Option

- date: 2026-11-13
- status: design stage only
- lane: hud, rules (tier 1)
- issue: [#1450](https://github.com/jarrodjohnson-gif/emberisle/issues/1450) item 3
- source: Traders & Barbarians Friendly Robber variant

## 1. Overview
Friendly Wayfarer adds a third table option: On, Friendly, and Off.
It is based on the official Traders & Barbarians Friendly Robber rule.
New players frequently get targeted by the wayfarer early in the game.
Friendly mode prevents early targeting so players can establish their settlements.
It protects players who have two or fewer visible points.

## 2. Rule Specification
The Friendly Wayfarer rule introduces specific protection rules:

### Protection Threshold
- The Wayfarer cannot stop on any hex adjacent to a protected player.
- A player is protected if their visible score is two or fewer points.
- Visible points are calculated using `publicVP(state, playerId)`.
- Hidden victory fortunes remain hidden and do not affect protection.
- All players begin the game with two points from starting outposts.

### Hex Placement Rules
- When moving the Wayfarer, players must choose an eligible hex.
- A hex is ineligible if any adjacent building belongs to a protected player.
- The waste hex is always eligible because no buildings touch it.
- If all resource hexes are protected, the Wayfarer must move to waste.

### Stealing Rules
- A player cannot steal from any player with two or fewer visible points.
- `stealTargets()` excludes protected players automatically.
- Sevens still force players holding more than seven cards to discard half.

### Loss of Protection
- As soon as a player earns three visible points, protection ends.
- Points can come from an outpost, stronghold, longest road, or largest army.
- Once a player reaches three points, their adjacent hexes become valid targets.

## 3. Comparison of Modes

| Rule | On (Default) | Friendly | Off |
| :--- | :--- | :--- | :--- |
| Discard on seven (> 7 cards) | Discard half | Discard half | Discard half |
| Wayfarer movement | Any different hex | Non-protected hexes only | Never moves |
| Hex blocking | Any resource hex | Hexes of players with 3+ VP | Never blocks |
| Steal card | Classic adjacent victim | Adjacent victims with 3+ VP | Never steals |
| Wayfarer fortunes | Move, block, and steal | Move, block, steal (3+ VP) | Targetless Muster |
| Largest army | Played fortunes count | Played fortunes count | Played fortunes count |

## 4. Required Code Touches

### 1. Types (`src/lib/game/types.ts`)
Update `WayfarerMode` to include the `"friendly"` string literal:
```ts
export type WayfarerMode = "on" | "friendly" | "off";
```

### 2. Rules Engine (`src/lib/game/rules.ts`)
- **`stealTargets(state, hexId, pid)`:**
  Add a condition checking `publicVP(state, pl.id) > 2` when mode is `"friendly"`.
- **`legalRobberHexes(state, pid)`:**
  Filter out hexes touching any building belonging to a player with `publicVP <= 2`.
- **`applyRobber(state, pid, hexId, stealFrom)`:**
  Enforce friendly placement constraints and refuse illegal placements.

### 3. AI Strategy (`src/lib/game/ai.ts`)
- **`chooseRobberHex()`:**
  Bots filter out hexes touching protected players.
  Bots prioritize blocking leaders with the most visible points.
- **`chooseStealTarget()`:**
  Bots select victims only from the filtered eligible targets.

### 4. UI Dropdown (`src/components/game/WayfarerOptions.tsx`)
- Add `<option value="friendly">Friendly</option>` to the select element.
- Update help text to explain protection for players with two points.
- Ensure the dropdown retains 44 px touch height.

### 5. Table Creation and Host (`server/host.mjs`)
- Validate table options at creation time.
- Persist `wayfarerMode` in room metadata and state snapshots.
- Ensure guests can inspect the mode in the lobby.

### 6. Documentation (`README.md`)
- Update Table Options section in `README.md`.
- Document On, Friendly, and Off settings.

## 5. Security and Privacy Boundaries
- **No Hidden Point Leaks:**
  Protection checks strictly use `publicVP()`.
  Hidden victory point cards never count toward the threshold.
  Opponents cannot deduce whether a player holds a hidden point fortune.
- **Immutable Table Setting:**
  The mode is chosen before table creation.
  Settings cannot be changed mid-game.

## 6. Proof and Verification
The implementation will require dedicated automated proofs:
- **`wayfarer-modes-prove.mjs`:**
  Extend the test suite to verify Friendly mode rules.
  Assert that early players with two points cannot be blocked or robbed.
  Assert that reaching three points enables targeting.
  Verify that bot games complete legally without stalls.
- **`wayfarer-setup-prove.mjs`:**
  Verify dropdown rendering, selection state, and host synchronization.
