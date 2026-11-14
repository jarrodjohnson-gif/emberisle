# Design: Game Replay (Watch It Back)

- date: 2026-11-13
- status: design stage only
- lane: hud, net (tier 1)
- issue: [#1450](https://github.com/jarrodjohnson-gif/emberisle/issues/1450) item 10

## 1. Overview
Game Replay lets players review finished games step by step.
It is ranked item 10 in the #1450 fun features research.
Players often ask how an opponent won or when the tide turned.
Replay allows learners, competitive players, and reviewers to inspect key turns.
The feature consists of server action logging and a client scrubber viewer.

## 2. Server Committed Action Log
Emberisle's rules engine is deterministic when provided initial setup and sequential actions.
Because dice rolls use cryptographic random values, rolls cannot be reconstructed from seeds.
The server records every committed action in sequence during live play.

### Action Entry Schema
Each recorded step stores:
- `seq`: Monotonically increasing sequence number.
- `turn`: Game turn counter.
- `pid`: Player ID who performed the action.
- `action`: The exact `Action` object applied to rules.
- `dice`: Generated dice values for roll actions.
- `revealed`: Hidden outcomes decided by host RNG, such as stolen goods or drawn fortunes.
- `timestamp`: Host timestamp in milliseconds.

### Storage Boundary
- The action log accumulates in room memory during active gameplay.
- On game completion (`phase === "over"`), the log commits to disk alongside room metadata.
- Storage uses `rooms/<code/uuid>.replay.json`.
- A 100-turn game averages approximately 20 kB to 40 kB of uncompressed JSON.

## 3. Hidden Information Reveal Timing
Strict information barriers protect active games from data leakage:

### During Active Play
- The server strips unrevealed data before sending state to clients.
- Opponent hands, unplayed fortunes, and deck order remain hidden.
- Spectators and players cannot inspect upcoming cards or steal outcomes.
- No replay endpoints serve data for an ongoing game.

### Post-Game Unlocking
- Replay data becomes downloadable only after `phase === "over"`.
- The terminal state exposes the full action log to all participants.
- Finished games reveal all player hands, drawn fortunes, and theft history.
- Replaying a completed game exposes an omniscient view of the board.

## 4. Client Replay Viewer UX
The replay viewer is accessed via a "Watch Replay" button on the win screen.
It can also be opened from profile game history.

### Controls and Scrubber Bar
- **Scrubber Slider:**
  A horizontal slider scrubs from turn 1 setup to the final victory point.
- **Step Controls:**
  Step Backward and Step Forward buttons allow single-action precision.
- **Play and Pause:**
  An automatic playback toggle plays through actions at 1x, 2x, or 4x speed.
- **Current Action Banner:**
  A readable line describes the current step (e.g., "Jarrod built an outpost").

### Perspective Options
- **Omniscient View (Default):**
  Inspect all player resource counts and fortunes simultaneously.
- **Player View:**
  Filter the display to see exactly what one player saw during that turn.
- **Fog of War Replay:**
  If fog of war was enabled, replay respects historical vision boundaries.

## 5. Architectural Touches

### 1. Rules Engine (`src/lib/game/rules.ts`)
- Pure state replayer applies actions sequentially from initial board state:
  `replayGame(initialState, actions) => GameState[]`.
- Snapshot caching saves state every 10 turns to enable fast backwards scrubbing.

### 2. Host Logging (`server/host.mjs`)
- Records committed actions in `room.actionLog`.
- Captures host RNG results alongside player actions.
- Persists log to `.replay.json` when `settle(room)` runs.
- Exposes `replayGet` endpoint authorized only for finished games.

### 3. Client Networking (`src/lib/net/table.ts`)
- Requests replay data after game reaches `phase === "over"`.
- Validates game identity before mounting the replay interface.

### 4. Lazy Chunking (`src/components/game/ReplayViewer.tsx`)
- The replay interface is packaged as an isolated lazy chunk.
- It loads on demand when the user clicks "Watch Replay".
- It reuses `IslandCanvas` without increasing initial bundle sizes.

## 6. Proof and Verification Strategy
Automated proofs will validate the replay subsystem:
- **`replay-log-prove.mjs`:**
  Verify that server records all turns, rolls, and fortunes accurately.
  Assert that unrevealed fields are omitted while game is active.
- **`replay-scrubber-prove.mjs`:**
  Verify that client scrubber reconstructs identical game states at every turn.
  Assert forward and backward scrubbing produce identical board geometry.
- **`replay-security-prove.mjs`:**
  Confirm that requests for active game replay logs are rejected with 403 Forbidden.
