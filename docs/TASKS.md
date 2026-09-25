# Task line

Rules for this file: `docs/FRAMEWORK.md`. How to claim: `docs/AGENT_START.md`.
What to build: `docs/BUILD_BIBLE.md`. The active row: `docs/CURRENT.md`.

Status is only `blocked`, `ready`, `doing`, or `done`.
Gate is only `research`, `build`, `wire`, `prove`, or `done`.

Phases run in order. Phase 3 may start while Phase 1 runs, because it happens
on Jarrod's PC, not in the web sandbox. Nothing else runs early.

---

## Phase 0 — A stranger can find the code

### T0.1 — Inventory sandbox vs GitHub

- status: ready
- gate: research
- blocked_by: none
- where: this sandbox

Research: List files under `src/lib/game/`, `src/lib/scene/`, `src/components/game/`, `src/components/scene/`. Then open GitHub `jarrodjohnson-gif/emberisle` and list what is actually on `main`. Write `docs/research/T0.1.md` with two lists: "only in sandbox" and "already on GitHub". Do not upload yet.

Build: no code.

Wire: none.

Prove: the note contains both lists and a file count. If GitHub has no `src/lib/game/rules.ts`, say that in the first line.

### T0.2 — Put the rules source on GitHub

- status: blocked
- gate: research
- blocked_by: T0.1

Research: From the T0.1 note, list the exact paths to add. Skip `node_modules`, `.env`, and the 4 GB zip.

Build: Copy those paths onto `main`. Minimum set: `src/lib/game/*.ts`, `src/lib/scene/isle-renderer.ts`, `src/components/game/*.tsx`, `src/components/scene/IslandCanvas.tsx`, `docs/`.

Wire: `README.md` links `docs/AGENT_START.md`, `docs/CURRENT.md`, `docs/TASKS.md`, `docs/BUILD_BIBLE.md`.

Prove: A fresh `gh repo clone jarrodjohnson-gif/emberisle` shows `src/lib/game/rules.ts`. Paste `ls` into `docs/research/T0.2.md`.

### T0.3 — README is the front door

- status: blocked
- gate: research
- blocked_by: T0.2

Research: Read the README. List what a new AI would not know (port, name Emberisle, do not cook Unreal here).

Build: Rewrite the top of `README.md` to 15 lines: what it is, link to `docs/AGENT_START.md`, link to `docs/BUILD_BIBLE.md`, "do not start a task that is not `ready`".

Wire: First line of `docs/HANDOFF.md` points at `docs/AGENT_START.md`.

Prove: Someone who only opens the README can name the next task id (`T0.1` is already done by then; the next id must match `docs/CURRENT.md`).

---

## Phase 1 — Rules host on port 8787

The pretty island is not in this phase. A terminal client is enough.

### T1.1 — List every action the reducer accepts

- status: blocked
- gate: research
- blocked_by: T0.2

Research: Read `src/lib/game/types.ts` and `applyAction` in `src/lib/game/rules.ts`. Write `docs/research/T1.1.md` as a table: action name, who may send it, phase, what it changes, error string if illegal. Include `harborRate`, `legalSettle`, `legalRoads`, `legalCities`, `stealTargets`.

Build / wire: none.

Prove: Every action in `BUILD_BIBLE.md` section 10 is either in the table or marked "not implemented yet" with the function that should grow. Do not implement the gaps in this task.

### T1.2 — Stand up a WebSocket on 8787

- status: blocked
- gate: research
- blocked_by: T1.1

Research: Pick `ws` (Node) unless the repo already has a websocket library. Write the choice and why in one paragraph. Port is **8787** (bible section 2.2). Do not use 8080 (that is the web preview).

Build: `server/host.mjs` that listens on 8787, accepts one socket, and replies `{ type: "error", message: "not ready" }` to any JSON.

Wire: `package.json` script `"host": "node server/host.mjs"`.

Prove: `npm run host` in one terminal. In another, a 10-line Node client connects and prints the error JSON. Paste both outputs.

### T1.3 — One room, full state after each intent

- status: blocked
- gate: research
- blocked_by: T1.2

Research: Map bible section 10 intents onto `applyAction`. Where the names differ, write the mapping. Do not invent a second rules engine.

Build: On `start`, call `generateGame` for 3 players (human + two bots) or 4 humans if the hello messages said so. Keep the `GameState` in memory.

Wire: Each accepted intent calls `applyAction` and broadcasts `{ type: "state", you, game }`. Rejected intent broadcasts `{ type: "error", message }` and does not change state.

Prove: A script sends an outpost on a legal vertex during setup, then the same vertex again. First response has a building. Second is an error and the building count is unchanged. Paste both JSON messages.

### T1.4 — Dice belong to the server

- status: blocked
- gate: research
- blocked_by: T1.3

Research: Read bible section 6. Confirm the reducer uses the roll it is given, or rolls inside `applyAction`. Write which one is true. If it uses `Math.random`, the build gate switches that roll to `crypto.randomInt(1, 7)` twice.

Build: `roll` intent returns `{ type: "rolled", dice: [a, b], sum }` and then a `state`.

Wire: The client never sends the numbers. If a payload includes `dice`, ignore them.

Prove: Script 600 rolls. Print counts for sums 2 through 12. Sum 7 is the mode and lands between 80 and 120. Paste the histogram into `docs/research/T1.4.md`. If it falls outside, stop and say so. Do not "fix" the histogram.

### T1.5 — Snake setup pays on the second outpost only

- status: blocked
- gate: research
- blocked_by: T1.3

Research: In `rules.ts`, find where setup order reverses and where starting goods are granted. Quote the line numbers in the note.

Build: Only if the quote shows first-outpost goods or no reverse. Otherwise this gate is "already true" and you skip to prove.

Wire: none.

Prove: Script a 3-player setup. After all six outposts, each player has resources equal only to the hexes around their **second** outpost. Paste the three resource bags.

### T1.6 — A seven discards, then the wayfarer moves

- status: blocked
- gate: research
- blocked_by: T1.4

Research: Quote how discard amount is computed (must be `floor(count / 2)` when count > 7).

Build: Only if that quote is wrong.

Wire: `discard` intent, then `rob` intent, matching bible section 10.

Prove: Force a hand of 8 wool. Roll or inject a 7. Legal discard is exactly 4. Discarding 3 returns an error and leaves 8. After a legal discard, a move onto an opponent hex steals one card. Paste the messages.

---

## Phase 2 — Code, lobby, pictures

### T2.1 — Room code rules

- status: blocked
- gate: research
- blocked_by: T1.3

Research: Bible section 2.3 is the spec. Write the alphabet and the collision rule (if the code exists, make another). No extra characters.

Build: `createRoom()` returns a 4-char code. `join(code)` fails with `"No table with that code"`.

Wire: `hello` intent carries `code`, `name`, `color`, `avatarId`.

Prove: Two clients with the same code see the same seat list. A third code typo gets that exact error string.

### T2.2 — Ready and start

- status: blocked
- gate: research
- blocked_by: T2.1

Research: Bible section 3.3. Start is legal only when every seated human is ready and the count is 3 or 4.

Build: `ready` and `start` intents.

Wire: Broadcast a one-line `{ type: "log", text: "Tide sat down." }` on join.

Prove: Start with two readies and one not-ready returns an error. Start with three readies returns a `state` whose phase is `setupSettle`.

### T2.3 — Avatar upload

- status: blocked
- gate: research
- blocked_by: T2.1

Research: Bible section 5. Limits: 256×256, 256 KB, jpeg, deleted when the room closes.

Build: `POST /avatars` on the same port, header `x-player-id`, body bytes, file `data/avatars/<id>.jpg`. `GET /avatars/<id>.jpg` returns it.

Wire: `hello.avatarId` is that id. The `state` includes a url path `/avatars/<id>.jpg`.

Prove: Post a tiny jpeg, GET it back, status 200, then close the room and GET returns 404. Paste the status codes.

---

## Phase 3 — Unreal on Jarrod's PC (side track)

This phase is `ready` only after T0.2, so the PC agent can read the repo.
Do not download the zip into the web sandbox.

### T3.1 — What is inside the zip

- status: blocked
- gate: research
- blocked_by: T0.2
- where: Jarrod's PC, not the sandbox

Research: Unzip `CATAN_PACKED.zip` from the Drive folder `3D Catan`. Find every `.uproject`. Write engine version, project path, and whether Play opens an island that looks like `public/refs/hex-north-star.jpg`. If there is no `.uproject`, stop the phase and say what the zip actually is (Blender only, etc.).

Build / wire / prove: the note is the prove. Attach no more than 2 screenshots.

### T3.2 — One hex id on one mesh

- status: blocked
- gate: research
- blocked_by: T3.1 and T1.1

Research: Read `generateGame` / hex ids in `src/lib/game/hex.ts` and `board.ts`.

Build: In the level, name one forest hex actor with the id the server uses for that axial coordinate.

Wire: Key `H` prints the id on screen.

Prove: Screenshot of the id. The note says which axial coord it is.

---

## Phase 4 — Start menu

Blocked until T3.1 is done (we know the project opens) and T2.2 is done (the server has lobby messages).

### T4.1 — Menu widgets, no network

- status: blocked
- gate: research
- blocked_by: T3.1

Research: Bible section 3. Choose UMG. Write the widget names: `W_Main`, `W_Host`, `W_Join`, `W_Lobby`.

Build: Those four widgets. Buttons do not connect yet. Colors and copy match section 3. Stone `#efeae0`, text `#1c1915`.

Wire: Esc on `W_Host` returns to `W_Main` and does not quit the game.

Prove: Screenshot of `W_Main`. Press Esc on the host screen and land on main. Write that in the note.

### T4.2 — Buttons feel like buttons

- status: blocked
- gate: research
- blocked_by: T4.1

Research: Bible section 3.4. Scale 0.97 for 80 ms.

Build: Press animation on every button in those widgets.

Wire: Call a sound function `UIClick`. If the wav is missing, the function returns. It must not crash.

Prove: Note says the scale values and that a missing wav did not throw. Screenshot optional.

---

## Phase 5 — Unreal talks to the host

### T5.1 — Socket from the Host button

- status: blocked
- gate: research
- blocked_by: T4.1 and T2.2

Research: How this UE version opens a WebSocket. Write the plugin or module name.

Build: Host button sends `hello` then waits.

Wire: `ServerUrl` from `Saved/Config/host.txt`, default the bible hostname. Gear icon edits it.

Prove: Server log shows `hello`. Unreal shows the code from the server on `W_Lobby`. Paste both.

### T5.2 — Second machine joins

- status: blocked
- gate: research
- blocked_by: T5.1

Research: none beyond the prove plan. Write the two-client steps first.

Build: Join screen sends `hello` with the code.

Wire: Both lobbies show both names.

Prove: Two PIE instances or one packaged exe plus one Node client. Both see both names. Paste the seat list JSON.

---

## Phase 6 — Place pieces

### T6.1 — Legal spots glow

- status: blocked
- gate: research
- blocked_by: T5.2 and T3.2

Research: Server must already send legal vertex ids (add them to `state` if T1.3 did not). Read `legalSettle` / `legalRoads`.

Build: A glow on those ids only. Color is the player's color at 40%.

Wire: Click sends `{ type: "place", kind, id }`. Esc clears the arm and does not send.

Prove: Click an illegal dark spot. Server error, no mesh. Click a glow. Mesh appears. Paste both.

### T6.2 — Distance rule is visible

- status: blocked
- gate: research
- blocked_by: T6.1

Research: Quote `legalSettle` neighbor rule.

Build: none if T6.1 already uses that list.

Wire: none.

Prove: After one outpost, the two neighboring vertices are not glowing. Screenshot.

---

## Phase 7 — Dice you can see

### T7.1 — Faces match the server

- status: blocked
- gate: research
- blocked_by: T1.4 and T5.1

Research: Find dice meshes in the Unreal project. If there are none, say so and use two text widgets as the fallback. Do not block the game on a mesh hunt.

Build: 700 ms tumble, then show `rolled.dice`.

Wire: Play `dice_shake` then `dice_land`. Missing files stay silent.

Prove: 20 rolls. A column in the note: server sum, what the screen showed. They match 20/20.

---

## Phase 8 — Sound

### T8.1 — Drop in the free wavs

- status: blocked
- gate: research
- blocked_by: T4.2

Research: Bible section 7. Download Kenney Interface, RPG, and Casino CC0 packs. Do not take files from Age of Empires or any commercial game.

Build: `Content/Audio/` with the filenames in that table. A missing row is listed in the note, not invented.

Wire: One data map from event name to file. `chip_gain` plays once even if three hexes pay.

Prove: Delete `ui_click.wav` temporarily, press a button, game still runs, put the file back. Write that sentence in the note.

---

## Phase 9 — Trade, discard, wayfarer

### T9.1 — Bank trade

- status: blocked
- gate: research
- blocked_by: T1.6 and T6.1

Research: `harborRate` in `rules.ts` and bible section 4.4.

Build: Trade panel with five "give" steppers and five "want" steppers.

Wire: Button `Bank 4:1` sends `tradeBank`. Harbor buttons show only the rate `harborRate` returns.

Prove: 4 wool becomes 1 ore when the bank has ore. 3 wool returns an error at 4:1. Paste both.

### T9.2 — Ask the table

- status: blocked
- gate: research
- blocked_by: T9.1 and T2.2

Research: Bible: first Yes wins, 20 seconds then it dies. No chat.

Build: `tradeAsk` / `tradeAnswer`.

Wire: A toast on the other clients with Yes / No.

Prove: Two humans. One asks. The other says yes. Resources move once. A late second yes does nothing. Paste states.

### T9.3 — Discard modal and steal picker

- status: blocked
- gate: research
- blocked_by: T1.6 and T5.2

Research: Bible sections 4.5 and 4.6.

Build: Modal that cannot close until exactly `floor(n/2)` cards are chosen.

Wire: If `stealTargets` has 2+ ids, show their circles. If zero, log `Empty hands`.

Prove: Hand of 9. Modal demands 4. Wayfarer move offers the right circles. Paste the screenshot note.

---

## Phase 10 — Friends can download

### T10.1 — Named tunnel

- status: blocked
- gate: research
- blocked_by: T1.2

Research: Bible section 2.2. Write whether Jarrod has a domain. If not, the prove is a quick tunnel and the note says the URL will change. Do not pretend a quick tunnel is stable.

Build: `cloudflared` config pointed at `127.0.0.1:8787`.

Wire: The URL the clients should use, written in `docs/research/T10.1.md`. Do not commit tunnel credentials.

Prove: From a phone on cellular, `curl` the `/health` or open a socket. Paste the status. Credentials stay on the PC.

### T10.2 — Windows zip

- status: blocked
- gate: research
- blocked_by: T7.1 and T5.2 and T10.1

Research: Unreal package steps for this engine version. Shipping, not Development.

Build: Package Win64.

Wire: `Saved/Config/host.txt` can override the server. Default is the T10.1 URL.

Prove: A second PC unzips, joins a code, places one outpost. Note the zip size and the machine names. That is v1.

---

## Done means

Phase 10 prove passed, and `docs/CURRENT.md` says `id: none`.
