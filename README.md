# Emberisle

A private island settler game for Jarrod and friends. One person hosts a table on their PC, and the others join with a four-character code. It is 3 or 4 players, first to 10 points, on one island of 19 hexes. The full rules are in [Rule set](#rule-set) below.

**Any AI or person can pick this project up from this file alone.** Read it top to bottom once, run the commands in [Run it](#run-it), and then follow [How work is done](#how-work-is-done).

---

## Contents

1. [Where the project is today](#where-the-project-is-today)
2. [Run it](#run-it)
3. [How work is done (the framework)](#how-work-is-done)
4. [Levels](#levels)
5. [What an AI can and cannot do here](#what-an-ai-can-and-cannot-do-here)
6. [Architecture](#architecture)
7. [Repo map](#repo-map)
8. [Messages between client and host](#messages-between-client-and-host)
9. [Tests and proofs](#tests-and-proofs)
10. [Done: what 100% means](#done-what-100-means)
11. [Rule set](#rule-set)
12. [Names and words](#names)
13. [Do not](#do-not)

---

## Where the project is today

| Piece | State | Where |
|---|---|---|
| Rules engine (setup, dice, production, 7s, wayfarer, trades, fortunes, longest path, largest army, win) | Works. Proven by scripts. | `src/lib/game/` |
| Rules host: one Node process holding the tables, codes, seats, and pictures, speaking WebSocket | Works. Proven by a 3-socket table test. | `server/host.mjs` |
| Browser client: Three.js island, HUD, bots, practice vs the isle, hotseat | Works from a fresh clone. Proven in headless Chromium. | `src/`, `index.html` |
| Browser client playing **online** through the host | Not yet. This is level **L14 (#70)**. | |
| Friends joining over the internet | Not yet. This is **L16 (#72)**, and the tunnel runs on Jarrod's PC. | |
| Unreal client, the "photoreal" version from the 3.6 GB art pack | Blocked on the gaming PC (#32). Designs are ready in `docs/design/`. | `docs/BUILD_BIBLE.md` |

There are two clients on purpose:

- **Browser client (this repo, runs anywhere).** This is what friends can play first. Any AI can build it.
- **Unreal client (Jarrod's gaming PC).** This is the pretty version. It speaks the same messages to the same host, so nothing in the rules is written twice.

---

## Run it

You need Node **22.18 or newer**. Check with `node --version`.

```bash
git clone https://github.com/jarrodjohnson-gif/emberisle.git
cd emberisle

# 1. Browser client (practice vs 3 bots, or 4 seats hotseat)
npm install
npm run dev              # open http://localhost:8080

# 2. Rules host (tables with room codes)
npm --prefix server install
npm run host             # WebSocket on ws://localhost:8787 (set PORT to change)

# 3. Checks: run all of these before you push
npm run typecheck        # TypeScript, no errors
npm run build            # production client in dist/
npm test                 # rules proofs, sounds, 3-socket table + 20 rolls
npm run client-prove     # headless Chromium plays setup + a roll, zero console errors
```

`client-prove` uses the Chromium that ships with cloud sessions (`/opt/pw-browsers/chromium`). On your own PC, run `npx playwright install chromium` once first. It saves a screenshot to `test-results/client-prove.png`.

If any command here fails on a fresh clone, that is a bug. Open it as a sub-issue (see the framework) before doing anything else.

---

## How work is done

Full text: **[docs/FRAMEWORK.md](docs/FRAMEWORK.md)**. Label and comment protocol: **[docs/TRACKING.md](docs/TRACKING.md)**.

```
Project → Level → 4 steps, in order → unlimited subtasks
          [L13]   1 Research → 2 Code → 3 Implementation → 4 Debug
                                                             └── every error = a sub-issue (bug), which can have sub-issues too
```

| Step | Does | Proves it with | GitHub label |
|---|---|---|---|
| 1 Research | Finds out what is true: reads code and sources, runs commands | `docs/research/<level>.md` with commands and output | `research` |
| 2 Code | Writes the code (or the spec, for a design level) on its own | a proof script or typecheck that passes alone | `design` |
| 3 Implementation | Wires it into the real app, and updates this README if a command changed | the level's "Done when" can be tried from the README | `implementation` |
| 4 Debug | Runs the level's test. Every failure becomes a sub-issue until none are open. | pasted output, with 0 open sub-issues | `test` |

(GitHub labels `code` and `debug` do not exist and cannot be made by the connector, so `design` = Code and `test` = Debug. The step name is always in the title.)

**Every session:**

1. Read this README. Run [Run it](#run-it).
2. Check locks: open issues labelled `status:claimed`, `status:in-progress`, or `status:paused`. Do not take those.
3. Take the lowest open level you are able to do (see the next two sections), and in it the first open step.
4. Claim it with a comment and the label (TRACKING.md). Do it, prove it, close it, and set the next step to `status:todo`.
5. Stuck on something only Jarrod can do? Comment exactly what he must do, add `needs:jarrod` or `needs:gaming-pc` to the title or body, and **move to another level**. Never stop just because one level is blocked.
6. Leave one line for Jarrod: `Continue Emberisle. Next open issue: #<n>.`

---

## Levels

Snapshot. GitHub is the truth, and the last agent keeps this table current.

| Level | Goal | Who | State |
|---|---|---|---|
| 1–4 | Documents, rules on GitHub, rules host, room codes | any AI | done |
| 5 | Open the art pack in Unreal (#32 to #35) | gaming PC | paused on #32 |
| 6 | Unreal start menu (#36 to #39) | gaming PC | design #37 in review |
| 7 | Unreal connects to the host (#40 to #43) | gaming PC | design #41 in review, host side done |
| 8 | Unreal placement glow (#44 to #47) | gaming PC | design #45 in review, host sends `legal` |
| 9 | Unreal dice (#48 to #51) | gaming PC | design #49 in review, host sends `rolled` |
| 10 | Table sounds (#52 to #55) | any AI | done |
| 11 | Trades, discards, steals (#56 to #59) | any AI | done |
| 12 | Package and ship to a friend (#60 to #65) | Jarrod plus the gaming PC | #60 and #61 wait on Jarrod |
| **L13** | Browser client runs from a fresh clone (#69) | any AI | done: Debug passed, bug #89 fixed |
| **L14** | Browser client plays a table through the host (#70) | any AI | **next** |
| **L15** | The rules engine matches this README 100% (#71) | any AI | open |
| **L16** | Friends play the browser version over the internet (#72) | any AI, then Jarrod's tunnel | open |

---

## What an AI can and cannot do here

| Can (cloud session, or any machine with Node) | Cannot (needs Jarrod) |
|---|---|
| All of `src/`, `server/`, and `docs/` | Open the 3.6 GB `CATAN_PACKED.zip` (Drive), run Unreal, or cook a Windows `.exe` |
| Run the client in headless Chromium and take screenshots | Run the Cloudflare tunnel on his PC |
| Open, label, and close issues and sub-issues, and open PRs | Decide #60 (hostname) and #61 (Mac build) |
| Create labels? **No.** The GitHub connector can only use labels that already exist. | Create milestones or new labels. Ask Jarrod, or use `[L<n>]` titles. |

---

## Architecture

```
 ┌──────────────── browser client (src/) ────────────────┐      ┌──── Unreal client (gaming PC) ────┐
 │ React HUD + Three.js island (isle-renderer.ts)        │      │ art pack island, UMG menus        │
 │ zustand store (store.ts)                              │      │ follows docs/design/*.md          │
 │   practice / hotseat: calls rules.ts directly + ai.ts │      └──────────────┬────────────────────┘
 │   online (L14): sends intents over WebSocket ─────────┼──┐                 │ same JSON
 └───────────────────────────────────────────────────────┘  │                 │
                                                             ▼                 ▼
                                      ┌──────── rules host (server/host.mjs, port 8787) ────────┐
                                      │ rooms by 4-char code · seats · ready · start           │
                                      │ applyAction() from src/lib/game/rules.ts (the only rules)│
                                      │ per-seat state + legal ids · rolled · log · avatars     │
                                      └──────────────────────────────────────────────────────────┘
```

- The rules exist once, in `src/lib/game/rules.ts` (`applyAction(state, playerId, action)` → `{ state, error? }`). It is pure and deterministic except for the dice. The host and the browser both import it.
- The server rolls the dice (`crypto`). Clients only animate the numbers they are given.
- The host sends each seat only what it may see. Other players' fortunes and the deck order stay hidden.

---

## Repo map

| Path | What it is |
|---|---|
| `README.md` | This file, the front door |
| `docs/FRAMEWORK.md` | The Research → Code → Implementation → Debug framework |
| `docs/TRACKING.md` | Status labels and the claim, pause, and review comment formats |
| `docs/BUILD_BIBLE.md` | Full product spec for the Unreal client: UX, sounds, messages, and the rules it must not re-decide |
| `docs/design/` | Step-2 specs: hex-id map, menus, connection, placement, dice, install |
| `docs/research/` | Step-1 notes, one per level (`_TEMPLATE.md`) |
| `docs/VISION.md`, `docs/HARBORS.md`, `docs/IDEAS.md` | The look, the dock layout, and unscheduled ideas |
| `docs/HANDOFF.md` | Old background from the Grok sandbox. History only. |
| `src/lib/game/types.ts` | Resources, pieces, costs, phases, `GameState`, `Action` |
| `src/lib/game/hex.ts` | Axial coordinates and hex, vertex, and edge ids |
| `src/lib/game/board.ts` | `createGame()`: the 19-hex deal, tokens, docks, and players |
| `src/lib/game/rules.ts` | `applyAction()` and the `legal*` helpers: **all the rules** |
| `src/lib/game/ai.ts` | Bots for practice |
| `src/lib/game/random.ts` | Seeded RNG for the board deal (not the dice) |
| `src/lib/game/store.ts` | The zustand store the UI uses |
| `src/lib/scene/isle-renderer.ts` | The Three.js island: slabs, trees, sheep, boats, and painted textures |
| `src/components/game/` | `EmberisleApp.tsx` (title and modes) and `Hud.tsx` (in-game bar) |
| `src/components/ui/button.tsx` | Button with 8 px corners that press to 0.97 |
| `src/assets/textures/` | Drop terrain photos here (optional) |
| `server/host.mjs` | The rules host |
| `server/*-prove.mjs` | Proof scripts (see Tests) |
| `server/audio/` | CC0 Kenney sounds, mapped in `server/cue.mjs` |
| `scripts/client-prove.mjs` | Headless browser test of the client |

---

## Messages between client and host

WebSocket JSON. The client sends intents. The server answers with `state` or `error`. Full detail: [docs/design/connection.md](docs/design/connection.md) and [BUILD_BIBLE §10](docs/BUILD_BIBLE.md).

| Client → host | Meaning |
|---|---|
| `{type:"hello", name, color, avatarId}` | Open a table. Reply: `welcome {code, you, host:true}` |
| `{type:"hello", code, name, color, avatarId}` | Sit down at a table |
| `{type:"ready", value}` / `{type:"start"}` | Lobby. Only the host can start, with 3 or 4 seated and everyone ready. |
| `{type:"place", kind:"outpost"\|"path"\|"stronghold", id}` | Build or place during setup |
| `{type:"roll"}` `{type:"pass"}` `{type:"buy"}` | Turn actions |
| `{type:"play", card:"knight", hexId, stealFrom}` (and `road`/`ids`, `plenty`/`resources`, `monopoly`/`resource`) | Fortunes |
| `{type:"rob", hexId, stealFrom}` `{type:"discard", cards}` | After a 7 |
| `{type:"tradeBank", give, take}` `{type:"tradeAsk", give, want}` `{type:"tradeAnswer", tradeId, yes}` | Trades |

| Host → client | Meaning |
|---|---|
| `seats {code, seats[]}` | Lobby seat list |
| `state {you, game, legal}` | The full game for you, plus `legal` = the ids you may click and the actions you may take |
| `rolled {dice:[a,b], sum, gains[]}` | The server's dice and who got what |
| `log {text}` / `error {message}` | One line to show |
| `tradeOffer` / `tradeClosed` | Ask-the-table trades (20 s) |

---

## Tests and proofs

| Command | Proves |
|---|---|
| `node --import ./server/register.mjs server/prove.mjs` | Short bank pays nobody, dice histogram, setup goods, illegal placement rejected |
| `node --import ./server/register.mjs server/trade-prove.mjs` | Bank 4:1, discards, steals |
| `node server/sound-prove.mjs` | A missing sound does not crash |
| `node --import ./server/register.mjs server/table-prove.mjs` | 3 sockets: codes, color taken, ready, start, setup glow and neighbor rule, 20 rolls match the host |
| `npm run client-prove` | The browser client plays setup and a roll with zero console errors |

`npm test` runs the first four.

---

## Done: what 100% means

1. Two computers. One hosts. The other joins with a code over the internet.
2. They finish a game to 10. The points match the Rule set below.
3. The dice faces match the log. A 7 forces discards, then a wayfarer move.
4. Pictures show in the lobby. Path, outpost, and dice each make a sound.
5. First with the browser client (L16), then with the Unreal client (milestone 12).

---

## Rule set

Three or four players. First to 10 points wins. One island of 19 hexes.

### Land

Each hex is forest, clay hills, pasture, fields, mountains, or the wastes. A token from 2 to 12 sits on every hex except the wastes. There is no 7 token. The wastes produce nothing.

### Pieces

| Piece | Cost | You start with |
|---|---|---|
| Path | 1 timber, 1 clay | 15 |
| Outpost | 1 timber, 1 clay, 1 wool, 1 grain | 5 |
| Stronghold | 2 ore, 3 grain, on an outpost you own | 4 |
| Fortune | 1 wool, 1 grain, 1 ore | a shared deck of 25 |

The deck is 14 knights, 2 path-building, 2 plenty, 2 monopoly, and 5 hidden points. A fortune bought this turn cannot be played this turn. A knight may be played before the roll.

### Points

An outpost is 1. A stronghold is 2. The longest path is 2, and it takes at least 5 segments to hold it. The largest army is 2, and it takes at least 3 knights to hold it. A tie does not take either award away. Hidden points stay hidden until the end.

### Setup

Seat order, then the reverse. Each turn in setup is one outpost and one path from it. Only the second outpost pays starting goods: one card for each hex it touches.

An outpost must not touch another building, including your own. After setup, a new outpost must also touch one of your paths. A path must touch your own path or building.

### A turn

Roll two dice. The server rolls. Sums that match a token pay every building on that hex, unless the wayfarer is standing there. An outpost takes 1. A stronghold takes 2. If the bank cannot pay everyone for a resource, nobody gets that resource.

Then you may trade, build, buy fortunes, and play fortunes bought on an earlier turn. Pass ends the turn.

### A seven

Anyone with more than 7 cards discards half, rounded down. Then the roller moves the wayfarer onto a different hex and may steal one random card from a player who has a building there.

### Docks

There are 9 docks, on the coast, spaced around the island. You do not get one for sitting down.

- 5 are 2-for-1, one for each resource: timber, clay, wool, grain, ore.
- 4 are 3-for-1, and those take any resource.

You get a dock's rate only when a building of yours sits on one of that dock's two corners. Otherwise the bank is 4 of one resource for 1 of another. A specific dock beats a 3-for-1, and a 3-for-1 beats the bank. The bank pays only if it still has the card.

The picture in [docs/harbors-example.png](docs/harbors-example.png) is one legal coast. A new game uses the same nine docks and may rotate which type sits where. It does not add docks, and it does not give a player their own 2-for-1.

### Bank

The bank starts with 19 of each resource.

## Names

<a id="names"></a>

Say timber, clay, wool, grain, ore, outpost, stronghold, path, fortune, and wayfarer. The window title is Emberisle.

## Do not

- Do not put the board-game trademark anywhere in the UI. It is **Emberisle**.
- Do not write a second rules engine (in Blueprints, the client, or anywhere else). Call `rules.ts` or the host.
- Do not let a client decide the dice, the steal, or the winner.
- Do not download the 3.6 GB art pack into a cloud session.
- Do not rip sounds from commercial games. Use CC0 only.
- Do not add a 5th seat to the 19-hex island.
