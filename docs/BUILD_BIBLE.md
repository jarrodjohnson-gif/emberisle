# Emberisle build bible

Hand this file to the Unreal (or any 3D) AI. It is the product, the UX, the
sounds, the join flow, and the rules the heavy client must not invent.

Grok in the web sandbox **does not cook Unreal**. Grok owns this spec and the
lightweight rules host. The other AI owns the pretty island and the packaged
`.exe` / `.app`.

Private friends game. Not for a store. Window title: **Emberisle**. Do not put
the board-game trademark in the UI.

Visual north star: `public/refs/hex-north-star.jpg` (white stone hex slabs,
sheep, wheat, mine smoke, dark water). Art source:
Google Drive folder `3D Catan`, file `CATAN_PACKED.zip` (~3.8 GB). Unzip that
on the gaming PC and open it in UE5. Do not load it in a browser.

---

## 0. Who does what

| Job | Owner |
|---|---|
| Dice, turns, "is this legal", bank, win check | Rules host (Node). Already sketched in `src/lib/game/rules.ts` |
| Start menu, lobby, HUD, sounds, icon upload | Unreal UI, following this doc |
| Island, sheep, smoke, Lumen, piece meshes | Unreal + the zip |
| Package Windows (and Mac if a Mac exists) | Unreal on Jarrod's PC |
| Cloudflare tunnel so friends reach the host | `cloudflared` on the host PC |
| Player pictures | Host disk, served over that tunnel |

The 4 GB stays on each friend's computer. The server only sends JSON.

---

## 1. What the game is

A 3 or 4 player table. First to **10 points** wins. One island of 19 hexes.

Resources (say these words, not the trademark set):

| Id | Label | Color chip | Comes from |
|---|---|---|---|
| `timber` | Timber | `#2f6b3a` | Forest |
| `clay` | Clay | `#b5522a` | Clay hills |
| `wool` | Wool | `#d7d2c4` | Pasture |
| `grain` | Grain | `#e0b13a` | Fields |
| `ore` | Ore | `#6e7580` | Mountains |
| `waste` | Wastes | `#c4a574` | Produces nothing. Wayfarer starts here |

Pieces:

| Id | Label | Cost | Stock per player |
|---|---|---|---|
| `path` | Path | 1 timber + 1 clay | 15 |
| `outpost` | Outpost | 1 timber + 1 clay + 1 wool + 1 grain | 5 |
| `stronghold` | Stronghold | 2 ore + 3 grain (upgrade an outpost) | 4 |
| `card` | Fortune | 1 wool + 1 grain + 1 ore | deck of 25 |

Fortunes: 14 knight, 2 path-building, 2 plenty, 2 monopoly, 5 hidden points.
A bought fortune cannot be played the same turn. A knight may be played
**before** the roll.

Points: outpost 1, stronghold 2, longest path 2 (need 5+ segments),
largest army 2 (need 3+ knights), hidden fortune points.

**Not in v1:** a 5th or 6th player. The 19-hex island is a 4-seat table.
Do not cram a fifth seat onto it. Say so in the menu: "3 or 4."

---

## 2. Download (friends night)

Goal: a friend downloads once, double-clicks, types a **4-character code**,
and is in the lobby. They never see a URL if we do this right.

### 2.1 What Jarrod sends

One private Google Drive folder, two files when both exist:

- `Emberisle-Windows.zip`
- `Emberisle-Mac.zip` (only if cooked on a Mac)

Plus one line in the Drive doc: "Unzip. Run Emberisle. Code is in the group chat."

No installer required for v1. Zip → folder → `Emberisle.exe`.

### 2.2 Stable server address (do this once)

Quick Cloudflare URLs **change every restart**. Do not bake those into the game.
Make a **named** tunnel so the address never changes.

On the host PC:

1. Free Cloudflare account. Add any domain he already has, or a free
   `trycloudflare` is only for testing — named tunnel needs a zone he controls.
   If he has no domain: use a free `*.cfargotunnel.com` hostname from
   `cloudflared tunnel route dns`.
2. Install cloudflared.
3. `cloudflared tunnel login`
4. `cloudflared tunnel create emberisle`
5. Config `~/.cloudflared/config.yml`:

```yaml
tunnel: emberisle
credentials-file: C:\Users\Jarrod\.cloudflared\<TUNNEL-ID>.json
ingress:
  - hostname: play.example.com
    service: http://127.0.0.1:8787
  - service: http_status:404
```

6. `cloudflared tunnel route dns emberisle play.example.com`
7. Run the rules host on port **8787**, then `cloudflared tunnel run emberisle`.

Bake `https://play.example.com` into the Unreal build as `ServerUrl`.
Friends only type the room code. If the hostname is not ready yet, the
start screen has a hidden field (gear icon) where they can paste a URL once.
Save it in `Saved/Config/host.txt`.

### 2.3 Room code

- 4 characters, alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I).
- Host creates the room. Code is shown huge on the lobby.
- Join sends `{ type: "join", code, name, color, avatarId }`.
- Wrong code: one line, "No table with that code", sound `ui_error`. Do not
  dump a stack trace.

### 2.4 Host PC must be on

If Jarrod's PC is off, the table is off. That is correct for v1. Do not add AWS.

---

## 3. Start menu

Full screen. Island in the background, slow orbit, living (sheep, water, smoke)
even before a game. No HUD clutter.

```
EMBERISLE
[ Host a table ]
[ Join with a code ]
[ Practice vs the isle ]     <- optional, 3 bots, no network
gear icon (server URL)
```

### 3.1 Host

1. Name (default "Ember"). 16 letters max.
2. Color: four swatches, not a picker.
   `#c45c3e` Ember, `#2a8f8a` Tide, `#e4c9a0` Dune, `#3d6b4f` Pine.
   Taken colors are dimmed.
3. Picture: circle, 96 px. "Use a picture" opens a file dialog.
   PNG or JPG, under 256 KB. If they skip it, circle is the color + first letter.
4. Seats: **3** or **4**.
5. Button: **Open table**.
6. Next screen is the lobby. Code is 4 characters, copy button, "Waiting".

### 3.2 Join

1. Four big boxes for the code. Auto-advance. Paste works.
2. Name, color, picture (same as host).
3. **Sit down**.
4. Errors only: bad code, table full, color taken, game already started.

### 3.3 Lobby

Row of seats. Each seat: circle picture, name, color bar, "Ready" check.
Empty seat says "Empty".

Host sees **Start** only when every filled seat is Ready and there are
3 or 4 humans (practice mode can fill with bots named Tide, Dune, Pine).

No chat required for v1. A one-line log is enough: "Tide sat down."

### 3.4 Feel

- Buttons: 8 px corner radius, stone color `#efeae0`, text `#1c1915`.
- Press: scale to 0.97 for 80 ms, play `ui_click`.
- Hover: lighten 6%, play `ui_hover` at low volume (don't retrigger if already hovered).
- Back / Esc: `ui_back`, return to the previous screen. Never exit the app on one Esc.

---

## 4. In-game screen

Camera: high three-quarter, close enough to read a hex, orbit with right-drag,
zoom with wheel, pan with middle-drag. Do not start in first person.

### 4.1 Layout

```
top-left     whose turn + phase sentence
top-right    gear (leave table)
bottom       your chips as five colored counts, then action buttons
left edge    other players as a vertical stack of circles
center       the island (never cover the middle with a panel)
```

Phase sentence, one line, plain language:

| Phase | Sentence |
|---|---|
| `setupSettle` | "Place an outpost." |
| `setupRoad` | "Lay a path from it." |
| `roll` | "Roll." |
| `discard` | "Someone has too many cards. Discard down to 7." |
| `robber` | "Move the wayfarer." |
| `main` | "Build, trade, or pass." |
| `over` | "Tide wins." |

### 4.2 Your bar

Five pills. Each pill: **color block + number**. No tiny icons required.
Optional tiny word under the number (Timber, Clay, Wool, Grain, Ore) at 11 px.

Buttons, only if they are legal. Illegal = hidden, not greyed-out-and-confusing.
Exception: show the cost on a disabled button only during `main` so people
learn the price. Tooltip: "Path · 1 timber, 1 clay".

| Button | When |
|---|---|
| Roll | phase `roll` and it is you |
| Path | you can afford it and it is your main phase or setup road |
| Outpost | same |
| Stronghold | same |
| Fortune | main phase, you can afford it, deck not empty |
| Trade | main phase |
| Pass | main phase |

Clicking Path / Outpost / Stronghold does **not** build immediately.
It arms placement. Legal spots glow. Click the spot. Esc cancels the arm.

### 4.3 Other players

Circle (their picture), name, color, **public** points only
(no hidden fortune points), number of cards as a count (not the cards),
knights played, path length. If it is their turn, a soft pulse on the circle.

### 4.4 Trade (keep it small)

One panel:

- "I give" : five steppers, start at 0
- "I want" : five steppers
- Buttons: **Ask the table**, **Bank 4:1**, and if they are on a harbor
  **Harbor 3:1** or **Harbor 2:1** (only the rate they actually have)

Ask the table: each other human gets a toast "Ember offers 2 wool for 1 ore"
with **Yes** / **No**. First Yes wins. 20 seconds then it dies.
Bank: 4 of one for 1 of another, if the bank has it.
Do not build a chat.

### 4.5 Discard

If you have more than 7 cards when a 7 is rolled, a modal:
"Drop N cards." Click chips to mark them. Confirm. You cannot close it
without dropping the right number. N = floor(hand / 2).

### 4.6 Wayfarer

After a 7 (or a knight), legal hexes glow. Wastes and the current hex are
illegal if a hex is current — you must move him. Click a hex. If an opponent
has a building on it, you steal one random card. If several opponents, a
small row of their circles: "Take from whom?" If they have 0 cards, no steal,
say "Empty hands."

### 4.7 End

Full island stays visible. One line: "Tide · 10". Buttons: **Look around**,
**Back to menu**. No fireworks that hide the board. A short sting is enough.

---

## 5. Pictures on the server

Players upload their own face or any image. Stored on the **host PC**,
reachable through the tunnel. No second cloud.

Rules for the other AI and the host:

1. Client scales the image to **256×256** JPEG quality 0.8 before upload.
   Reject if the result is over **256 KB**.
2. `POST /avatars` with header `x-player-id` and body = the jpeg bytes.
3. Server writes `data/avatars/<playerId>.jpg`.
4. Response `{ avatarId, url }` where url is
   `https://play.example.com/avatars/<playerId>.jpg`.
5. Lobby and HUD load that URL into the circle. If it 404s, color + letter.
6. Delete the folder when the room closes. Do not keep a face library.

Unreal: `Http` module, then `ImageWrapper` decode to a texture, circle mask
in the UI material (round alpha).

---

## 6. Dice (do not get this wrong)

The **server** rolls. The client only animates the numbers it was given.

```text
function rollDice():
  a = randomInt(1, 6)   # inclusive, uniform
  b = randomInt(1, 6)
  return { a, b, sum: a + b }
```

Use `crypto.randomInt(1, 7)` in Node (max is exclusive). Do not use
`Math.random()`. Do not use Unreal's client RNG for the real result.
Two dice are independent. 7 is the most common sum (6/36). That is correct.
Do not "fix" streaks.

On `roll`:

1. Server commits the roll, applies production or the 7, then sends one message
   with `dice: [a, b]` and the resource deltas.
2. Client plays `dice_shake` for 700 ms, tumbling two physical dice.
3. Dice land showing **exactly** `a` and `b`. If the mesh lands wrong, snap it.
   The number on the die is the rule, the animation is decoration.
4. Then play `dice_land`.
5. Hexes whose token equals the sum flash once. Chips fly from those hexes
   to the player circles (section 8).
6. A small log line: "8 · Ember +1 grain · Tide +1 timber".
7. Last 8 rolls stay in a slim list (top-left, under the phase line) so
   nobody thinks it is rigged. Show the two dice, not only the sum.

Production: every building on a hex with that token, if the wayfarer is not
on it. Outpost +1, stronghold +2. Wastes never pay. If the **bank** cannot
pay everyone for that resource, **nobody** gets that resource (classic rule).

---

## 7. Sounds

Feel reference: short, dry, woody UI clicks like an old RTS. Not trailer
impacts, not music stingers on every button.

**Do not rip files out of Age of Empires** (or any other commercial game)
into the build, even for a friends zip. Use CC0 packs and name them as below.
Download once into `Content/Audio/`.

Sources that match the feel:

- Kenney Interface Sounds (CC0) — clicks, error
- Kenney RPG Audio (CC0) — cloth, chop, coin
- Kenney Casino Audio (CC0) — dice
- Freesound CC0 search: "wood place", "sheep", "wind loop", "wave loop"

| File | When | Length |
|---|---|---|
| `ui_hover.wav` | pointer enters a button | < 150 ms, quiet |
| `ui_click.wav` | button press | < 120 ms |
| `ui_back.wav` | Esc / back | < 200 ms |
| `ui_confirm.wav` | ready, start, trade yes | < 300 ms |
| `ui_error.wav` | illegal, bad code | < 250 ms, low, not harsh |
| `dice_shake.wav` | roll starts | ~700 ms |
| `dice_land.wav` | dice snap to result | < 200 ms |
| `path_place.wav` | path appears | woody knock, < 300 ms |
| `outpost_place.wav` | outpost | heavier knock |
| `stronghold_place.wav` | upgrade | two knocks |
| `card_buy.wav` | fortune bought | paper slide |
| `card_play.wav` | knight / other fortune | paper + soft thud |
| `chip_gain.wav` | resources arrive | light tick, quiet |
| `trade_yes.wav` | trade accepted | `ui_confirm` is fine if you don't want two files |
| `trade_no.wav` | trade declined | soft negative |
| `win.wav` | someone hits 10 | 1.5 s, one chord, not a song |
| `amb_wind.wav` | loop, island | very quiet |
| `amb_sea.wav` | loop, coast | very quiet |

Mix:

- UI at -6 dB relative to pieces.
- Ambient at -18 dB, never duck the dice.
- One-shot cap: if three hexes pay at once, play `chip_gain` **once**, not three.

No background music in v1.

---

## 8. Lightweight animation

The island is already animated by the art (sheep, smoke, water). Gameplay
animation stays short so the table feels like a board, not a cutscene.

| Event | Motion | Time |
|---|---|---|
| Legal spot | soft pulse on the vertex or edge, color = your color at 40% | loop |
| Path placed | mesh scales from 0.2 to 1 along the edge | 220 ms |
| Outpost | drops 20 cm and settles, tiny dust | 280 ms |
| Stronghold | outpost swaps, scale 1.05 bounce | 320 ms |
| Wayfarer | walks hex-to-hex along the island, does not teleport | 600–900 ms |
| Dice | physical tumble, then freeze on the server faces | 700 ms |
| Chips | 4–8 colored dots fly from the hex to the player circle | 400 ms |
| Your button | scale 1 → 0.97 → 1 | 80 ms |
| Turn change | that player's circle brightens, previous one stops | 200 ms |
| Win | camera eases back 15%, no shake | 800 ms |

Sheep already graze. Do not add a second sheep system.

Cancel: Esc during placement plays `ui_back` and clears glows in one frame.

---

## 9. Rules the 3D AI must not re-decide

Server is right. If the picture disagrees, snap the picture.

Setup (snake):

1. Seats in order. Each places 1 outpost + 1 path, around the table.
2. Then reverse order: each places a second outpost + path.
3. The **second** outpost pays its starting goods (one card per adjacent hex).
   The first outpost does not.

Placement:

- Outpost only on a vertex with no building, and no building on a neighbor vertex.
- Path only on an edge touching your path or your building.
- After setup, a new outpost must touch one of **your** paths.
- You cannot build on the wayfarer's hex for production, but you can build
  next to him.

Turn, in order, on your main phase after the roll resolves:

- You may trade (players, then or instead bank/harbor).
- You may build any number of things you can afford.
- You may buy one or more fortunes.
- You may play fortunes bought on an earlier turn.
- Pass ends the turn.

Seven:

- If anyone has more than 7 cards, they discard floor(n/2) first.
- Then the roller moves the wayfarer and steals.

Longest path: longest continuous chain of your paths. An opponent's building
breaks the chain. Ties do not steal the award; you need to strictly exceed.

Largest army: most knights played. Need at least 3. Ties do not steal it.

Hidden points stay hidden until the end.

Bank starts at 19 of each resource. Deck as in section 1.

---

## 10. Messages (wire this, don't freestyle)

WebSocket JSON. Server → clients is the only state that matters.
Client → server is an **intent**. Server answers `state` or `error`.

Client intents:

```json
{ "type": "hello", "code": "K7QP", "name": "Jarrod", "color": "#c45c3e", "avatarId": "p1" }
{ "type": "ready", "value": true }
{ "type": "start" }
{ "type": "roll" }
{ "type": "place", "kind": "outpost", "id": "v:1,0,0" }
{ "type": "place", "kind": "path", "id": "e:..." }
{ "type": "place", "kind": "stronghold", "id": "v:..." }
{ "type": "buy" }
{ "type": "play", "card": "knight" }
{ "type": "rob", "hexId": "h:0,0", "stealFrom": "p2" }
{ "type": "discard", "cards": { "wool": 2, "ore": 1 } }
{ "type": "tradeBank", "give": "wool", "take": "ore" }
{ "type": "tradeAsk", "give": { "wool": 2 }, "want": { "ore": 1 } }
{ "type": "tradeAnswer", "tradeId": "t1", "yes": true }
{ "type": "pass" }
```

Server events:

```json
{ "type": "state", "you": "p1", "game": { } }
{ "type": "error", "message": "Too close to another outpost." }
{ "type": "rolled", "dice": [3, 5], "sum": 8 }
{ "type": "log", "text": "Tide laid a path." }
```

`game` is the same shape as `GameState` in `src/lib/game/types.ts`.
Send the full state after every accepted intent (v1). Do not invent a diff
protocol until something is slow. Four players will not notice.

Illegal intent: `{ "type": "error", "message": "..." }` and do not change state.
The UI shows the message for 2 seconds and plays `ui_error`.

Ids: use the ids the rules engine already generates (`hex.ts`). The Unreal
level must map mesh sockets to those ids, not the other way around.

---

## 11. Build order for the other AI

Do these in order. Do not start at step 8.

1. Unzip `CATAN_PACKED.zip` on the gaming PC. Open the `.uproject` in UE5.
   Confirm the island matches `hex-north-star.jpg`. If the project is a
   different layout, stop and say so. Do not rebuild the island from primitives.
2. Name every hex, vertex, and edge with the ids from a fixed seed so they
   match `generateGame` in `src/lib/game/board.ts`. One debug key (`H`) draws
   the ids. Screenshot it.
3. Run the existing rules in Node on port 8787 (or port the reducer).
   A test client can roll and place with no art.
4. Unreal connects, receives `state`, places the wayfarer on the wastes.
5. Lobby UI exactly as section 3. No island clicks yet.
6. Placement glows + the three build buttons.
7. Dice animation driven by server numbers. Check 50 rolls: counts look like
   a real 2d6 (about 1/6 are 7).
8. Sounds from section 7. Wire every row. Missing file = silent, not a crash.
9. Avatar upload.
10. Trade panel.
11. Package Windows zip. Jarrod and one friend play a full game to 10.
12. Only then cook Mac.

### Done when

- Two computers. One hosts. The other joins with a code over the tunnel.
- They finish a game. Points match the rules in section 9.
- Dice faces match the log.
- A 7 forces discard, then a wayfarer move.
- Pictures show in the lobby.
- Path / outpost / dice each make a sound.
- The island still looks like the still, not like greybox.

---

## 12. Do not

- Do not put the trademark in the window title, splash, or Drive folder name.
  Call it Emberisle.
- Do not extract audio from Age of Empires or any other shipped game.
- Do not let the client decide the dice, the steal, or the winner.
- Do not add a 5th player on the 19-hex board.
- Do not download the 3.8 GB zip into the web sandbox.
- Do not build a second rules engine in Blueprints. Call the host.

---

## 13. Where the logic already lives

Sandbox (source of truth until it is copied to GitHub):

- `src/lib/game/types.ts` — names, costs, phases
- `src/lib/game/hex.ts` — ids and coordinates
- `src/lib/game/board.ts` — 19-hex deal
- `src/lib/game/rules.ts` — `applyAction`
- `src/lib/game/ai.ts` — bots for practice
- `docs/VISION.md` — how the island should look
- `docs/HANDOFF.md` — older pause note

Reference only (do not fork their whole app):

- https://github.com/bergbros/settlers-of-open-source — `soos-gamelogic` is a
  second opinion on rules. If it disagrees with `rules.ts`, stop and ask.
- https://github.com/rpjohnst/catan — older, ports missing. Ignore the canvas.

Ports / harbors **are** in our rules (4:1 default, 3:1 and 2:1 on vertices).
Do not drop them.
