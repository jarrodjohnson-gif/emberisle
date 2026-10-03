# Emberisle

A private island settler game for Jarrod and friends. One person hosts a table on their PC, and the others join with a four-character code. It is 3 or 4 players, first to 10 points, on one island of 19 hexes. The full rules are in [Rule set](#rule-set) below.

**The task list is the [GitHub issues and milestones](https://github.com/jarrodjohnson-gif/emberisle/milestones), not this repo.** This file says what the game is and how the code works. How work is organized, and how any AI picks up the next step, is in **[docs/FRAMEWORK.md](docs/FRAMEWORK.md)** (the Fractal Build).

---

## Contents

1. [Rule set](#rule-set)
2. [What exists](#what-exists)
3. [Run it](#run-it)
4. [How work is done](#how-work-is-done)
5. [What an AI can and cannot do here](#what-an-ai-can-and-cannot-do-here)
6. [Architecture](#architecture)
7. [Repo map](#repo-map)
8. [Messages between client and host](#messages-between-client-and-host)
9. [Tests and proofs](#tests-and-proofs)
10. [Done: what 100% means](#done-what-100-means)
11. [Names and words](#names)
12. [Do not](#do-not)

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

An outpost is 1. A stronghold is 2. The longest path is 2, and it takes at least 5 segments in one unbroken line to hold it. If two players tie for it and nobody holds it yet, nobody gets it until one is strictly longer. The largest army is 2, and it takes at least 3 knights to hold it. A tie does not take either award away. Hidden points stay hidden until the end.

### Setup

Seat order, then the reverse. Each turn in setup is one outpost and one path from it. Only the second outpost pays starting goods: one card for each hex it touches.

An outpost must not touch another building, including your own. After setup, a new outpost must also touch one of your paths. A path must touch your own path or building. A path cannot continue past a corner where an opponent has a building.

### A turn

Roll two dice. The server rolls. Sums that match a token pay every building on that hex, unless the wayfarer is standing there. An outpost takes 1. A stronghold takes 2. If the bank cannot pay everyone for a resource, nobody gets that resource, unless only one player is owed it: then they take whatever is left.

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

---

## What exists

| Piece | State | Where |
|---|---|---|
| Rules engine (setup, dice, production, 7s, wayfarer, trades, fortunes, longest path, largest army, win) | Works. Proven by scripts. | `src/lib/game/` |
| Rules host: one Node process holding the tables, codes, seats, and pictures, speaking WebSocket | Works. Proven by a 3-socket table test. | `server/host.mjs` |
| Browser client: Three.js island, HUD, bots, practice vs the isle, hotseat | Works from a fresh clone. Proven in headless Chromium. | `src/`, `index.html` |
| Browser client playing online through the host: host or join with a code, lobby, chat and reactions, a full game | Works. Proven by 3 headless tabs against the host, from Vite and from the host's own `dist/`. | `src/lib/net/table.ts`, `scripts/tabs-prove.mjs`, `scripts/chat-prove.mjs` |
| Reconnect and rejoin: a dropped player gets the same seat back, by backoff or on reload | Works. Proven against a fake socket and against the host. | `server/rejoin-prove.mjs`, `server/reconnect-prove.mjs` |
| Room persistence: tables are saved to disk and reloaded when the host restarts | Works. Proven by killing and restarting the host mid-game. | `server/persist-prove.mjs` |
| Keepalive: the host pings every socket and cuts one that stops answering | Works. Proven in the rejoin proof. | `server/rejoin-prove.mjs` |
| Friends joining over the internet: `npm run night` builds, starts the host, and prints the join line for a Cloudflare tunnel | Works. The host serves the page and the socket on one address, so one tunnel carries both. The tunnel itself is Jarrod's step. | `scripts/night.mjs`, `server/serve-prove.mjs`, `npm run served-prove` |
| Unreal client, the "photoreal" version from the 3.6 GB art pack | Specs only. Needs the gaming PC. | `docs/BUILD_BIBLE.md`, `docs/design/` |

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
npm run host             # socket, avatars and the built client (dist/) on http://localhost:8787 (set PORT to change)
                         # tables are saved in server/rooms/ and survive a restart

# 3. Checks: run all of these before you push
npm run typecheck        # TypeScript, no errors
npm run build            # production client in dist/
npm test                 # every server/*-prove.mjs: rules, bots, sounds, sockets, chat, rejoin, restart (see Tests and proofs)
npm run client-prove     # headless Chromium plays setup + a roll, zero console errors
npm run hotseat-prove    # headless Chromium: a 7 in hotseat shows the discard bar for the seat that owes cards
npm run tabs-prove       # 3 headless tabs host, join, play setup + 5 rolls on the rules host, boards match
npm run trade-prove      # 3 headless tabs: one asks the table through the trade panel, one says No, one says Yes, goods move; a second ask times out
npm run served-prove     # same 3 tabs, but the page comes from the rules host itself with no ?host= (after build)
npm run chat-prove       # 3 headless tabs chat in the lobby and the game: presets, reactions, unread badge, minimized dock covers no target
```

CI runs `npm ci` in the root and in `server/`, then these checks in this order, and installs Chromium with `npx playwright install --with-deps chromium`. `client-prove` uses the Chromium that ships with cloud sessions (`/opt/pw-browsers/chromium`). On your own PC, run `npx playwright install chromium` once first. It saves a screenshot to `test-results/client-prove.png`.

### Game night

On the PC that hosts, after the two installs above:

```bash
npm run night
```

That builds the client, starts the host, and prints the join line:

- **On this PC** — open it, then Host a table. Post the 4-character code.
- **On your network** — same Wi-Fi. No tunnel.
- **Friends on the internet** — the script does not start the tunnel. In a second terminal, run the `cloudflared tunnel --url ...` command it printed. Leave both open. cloudflared prints an `https://….trycloudflare.com` link; paste that in the chat. Friends open the link and Join with the code. They never type a port.

Ctrl-C in the night terminal stops the host. Install cloudflared once if it is not already there (`winget install --id Cloudflare.cloudflared` on Windows). A quick tunnel needs no account. If it refuses to start because `~/.cloudflared/config.yml` exists, move that file aside for the night, or use the named tunnel in the build bible.

Host limits to know about: `ROOM_MAX` (default 64) counts every open lobby room, and each open socket can hold one, so a client that opens 64 sockets (about 13 s at the pre-seat rate) can fill the host. Per-IP limits are out of scope because the tunnel hides addresses. A finished game whose players stay connected keeps its slot. The per-seat non-chat limit (`ACT_CAP` 20, `ACT_RATE` 4 a second) is read from env like `HOLD_MS` and `GRACE_MS`; the table and net proofs raise it, `harden-prove` keeps the defaults.

If any command here fails on a fresh clone, that is a bug. File it (label `bug`) before doing anything else.

---

## How work is done

Full rules: **[docs/FRAMEWORK.md](docs/FRAMEWORK.md)**. In short:

- **Fractal Build.** Every piece of work runs **1 Research → 2 Design → 3 Implementation → 4 Testing**. Research files the child pieces it finds, and each child runs the same four steps, down to pieces small enough for one session and one PR.
- **The tracker is the task list.** Milestones are stages (`1. Documents`, `2. ...`). Issues are the steps, with sub-issues for children. Status: Backlog → Todo → In Progress → In Review → Done.
- **Any AI, any budget.** Each issue has a size (`XS` or `S`). With little limit left, do one step and leave a pause comment. With no limit, loop through Todo in the earliest milestone.
- **Every change is a pull request.** CI runs the checks below. The Builder never merges its own PR. The next session reviews it and merges it if CI is green (see FRAMEWORK.md, Builder and Reviewer).
- **Ideas** go in [docs/IDEAS.md](docs/IDEAS.md) until Jarrod decides to build them.

---

## What an AI can and cannot do here

| Can (cloud session, or any machine with Node) | Cannot (needs Jarrod) |
|---|---|
| All of `src/`, `server/`, and `docs/` | Open the 3.6 GB `CATAN_PACKED.zip` (Drive), run Unreal, or cook a Windows `.exe` |
| Run the client in headless Chromium and take screenshots | Run the Cloudflare tunnel on his PC |
| Write specs for Unreal work | Decide open `Decide:` issues |
| Create, edit, and close issues and sub-issues; open PRs | Create milestones, labels, or the Project board (the cloud connector cannot; Jarrod or an agent with `gh` can) |

---

## Architecture

```
 ┌──────────────── browser client (src/) ────────────────┐      ┌──── Unreal client (gaming PC) ────┐
 │ React HUD + Three.js island (isle-renderer.ts)        │      │ art pack island, UMG menus        │
 │ zustand store (store.ts)                              │      │ follows docs/design/*.md          │
 │   practice / hotseat: calls rules.ts directly + ai.ts │      └──────────────┬────────────────────┘
 │   online: sends intents over WebSocket (net/table.ts) ┼──┐                 │ same JSON
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
| `docs/FRAMEWORK.md` | The Fractal Build: how work is organized and picked up |
| `docs/BUILD_BIBLE.md` | Full product spec for the Unreal client: UX, sounds, messages, and the rules it must not re-decide |
| `docs/design/` | Step-2 specs: hex-id map, menus, connection, placement, dice, install |
| `.github/workflows/ci.yml` | CI: runs the Run-it checks on every PR |
| `docs/research/` | Step-1 notes, one per topic (`_TEMPLATE.md`) |
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
| `{type:"hello", code, name, color, avatarId}` | Sit down at a table. The host cleans `name` (control characters stripped, 16 characters, a duplicate becomes "Ember 2") and takes only a palette `color`, else the first free swatch. |
| `{type:"hello", code, secret}` | Sit back down in your own seat after a drop. Errors: "Seat is taken." (that seat's socket is still open), "Seat is gone." |
| `{type:"ready", value}` / `{type:"start"}` | Lobby. Only the host can start, with 3 or 4 seated and everyone ready. |
| `{type:"place", kind:"outpost"\|"path"\|"stronghold", id}` | Build or place during setup |
| `{type:"roll"}` `{type:"pass"}` `{type:"buy"}` | Turn actions |
| `{type:"play", card:"knight", hexId, stealFrom}` (and `road`/`ids`, `plenty`/`resources`, `monopoly`/`resource`) | Fortunes |
| `{type:"rob", hexId, stealFrom}` `{type:"discard", cards}` | After a 7 |
| `{type:"tradeBank", give, take}` `{type:"tradeAsk", give, want}` `{type:"tradeAnswer", tradeId, yes}` | Trades. A `tradeAsk` is refused to the asker alone, with "Bad trade." (`give` or `want` is not a bag of known resources), "You lack those goods." or "Offer something." (both bags empty). A new ask closes the open one with `tradeClosed`. |
| `{type:"chat", text}` | One chat line, lobby or game (200 chars, rate-limited) |
| `{type:"react", emote, to}` | A reaction image, `to` a seat or player id or omitted |

| Host → client | Meaning |
|---|---|
| `seats {code, seats[]}` | Seat list. `away: true` marks a dropped player whose seat is held. |
| `welcome {code, you, host, chat[], secret}` | `chat` is the room's last 50 lines. `secret` reclaims this seat with `hello {code, secret}`. |
| `state {you, game, legal}` | The full game for you, plus `legal` = the ids you may click and the actions you may take |
| `rolled {dice:[a,b], sum, gains[]}` | The server's dice and who got what |
| `chat {id, seat, player, name, color, text, at}` | A chat line, sent to every seat, sender included |
| `react {seat, player, emote, to, at}` | A reaction, sent to every seat, sender included |
| `log {text}` / `error {message}` | One line to show. Two come from the host's limits: "The host is full." (a `hello` that would open a table past `ROOM_MAX`, default 64) and "Slow down." (a seat sent more than about 20 non-chat messages in a burst, refilled 4 a second; the message is dropped) |
| `tradeOffer {tradeId, from, give, want, seconds}` | An ask-the-table trade, open 20 s |
| `tradeDeclined {tradeId, by, name}` | One seat said no, sent to every seat with a `log` line "<Name> declines." The offer stays open for seats that have not answered. |
| `tradeClosed {tradeId, taker?}` | The offer is over, sent to every seat: taken (`taker`), every other human seat declined, the 20 s ran out, or the asker's turn moved on (pass, or any action that ends it). A late `tradeAnswer` gets "Offer is gone." |

---

## Tests and proofs

| Command | Proves |
|---|---|
| `node --import ./server/register.mjs server/prove.mjs` | Short bank pays nobody, dice histogram, setup goods, illegal placement rejected |
| `node --import ./server/register.mjs server/trade-prove.mjs` | Bank 4:1, discards, steals |
| `node server/sound-prove.mjs` | A missing sound does not crash |
| `node --import ./server/register.mjs server/table-prove.mjs` | 3 sockets: codes, color taken, peek before sitting, ready, start, setup glow and neighbor rule, 20 rolls match the host, and the table's error strings (full, host-only start, 3 or 4, already started, not your turn) |
| `node --import ./server/register.mjs server/trade-table-prove.mjs` | 3 sockets: a table trade's decline reaches every seat, a yes swaps both hands, a pass closes the offer and a late yes errors |
| `node --import ./server/register.mjs server/harden-prove.mjs` | Untrusted input: bad messages, card-minting discards, oversized pictures, a peek or hello flood, and a player who leaves mid-game |
| `node --import ./server/register.mjs server/net-prove.mjs` | 3 `src/lib/net/table.ts` clients play setup through the host using the host's legal lists; two robberies pick the second of two targets; no state sent before the game ends carries the seed or rng |
| `node --import ./server/register.mjs server/rules-prove.mjs` | Longest path as a real trail, ties, cuts, fortune timing, paths past an outpost, then one check per Rule set line |
| `node --import ./server/register.mjs server/bots-prove.mjs` | 200 all-bot games: after every action the cards, the piece stock and the win still add up |
| `node --import ./server/register.mjs server/serve-prove.mjs` | The host serves the built client, the socket and the avatars from one address, and the client dials the page's own origin |
| `node --import ./server/register.mjs server/chat-prove.mjs` | `cleanText`/`allow`/`remember`/`loadEmotes` units, the host fills in the sender, rate limit, reactions, chat history for a late joiner, an over-limit frame closes only that socket |
| `node --import ./server/register.mjs server/rejoin-prove.mjs` | A dropped seat is held: the table waits through the grace, `hello {code, secret}` returns the same seat, a second socket gets "Seat is taken.", the bot plays the seat after the grace and hands it back on return, the room survives every socket closing, the seat is let go after the hold, a socket that stops answering pings is cut within two intervals and can rejoin |
| `node --import ./server/register.mjs server/reconnect-prove.mjs` | The client's reconnect edge cases against a fake socket: a second tab keeps the saved seat, a failed first dial sends one hello, a half-open old socket keeps it backing off, actions queued while down are dropped |
| `node --import ./server/register.mjs server/persist-prove.mjs` | Three seats set up and roll three times. The host is killed and restarted on the same port. All three rejoin with their secrets and see the same `seq` and the chat. A 25-hour-old room file is dropped, and a broken one and one with a null seat are skipped. |
| `npm run client-prove` | The browser client plays setup and a roll with zero console errors; a peek during a pending rejoin is quiet, and opens its own connection after a stale one |
| `npm run hotseat-prove` | In hotseat, a 7 where another seat owes a discard shows that seat's discard bar and charges the discard to that seat; zero console errors |
| `npm run chat-prove` | 3 browser tabs at 1280x720: lobby chat and presets, a reaction floats over the sender's rail card for 2 s, the unread badge, the remembered dock state, the minimized dock covers no board target, zero console errors |
| `npm run tabs-prove` | 3 browser tabs host, join, ready, start, play setup and 5 rolls through the rules host; dice and board match on every tab; then plays on until a gain has flashed green +N and a loss red -N on the hand, each gone within 2 s; a taken color dims before Join; zero console errors |
| `npm run trade-prove` | 3 browser tabs on the rules host: the Trade panel asks the table, the toast's No reaches every tab and leaves the offer open, Yes moves the goods (own hands exact, others' `goods` counts), a second ask runs out its 20 s with nothing moved and every toast closed, zero console errors |
| `npm run served-prove` | The same 3 tabs, but the host serves the built `dist/` and the tabs open it with no `?host=`, so they find the socket at the page's own address (the tunnel case) |
| `npm run wayfarer-prove` | In the browser, the wayfarer stands on the token and hops rather than slides, and the target hexes wear a band (docs/design/wayfarer.md); zero console errors |
| `npm run tokens-prove` | In the browser, number tokens are rimmed and legible, and nothing is placed or wanders within 0.39 of a hex centre (docs/design/tokens.md) |
| `npm run pieces-prove` | Pieces read in every seat colour: the five checks in docs/design/pieces.md, no browser |
| `npm run touch-place-prove` | The phone camera fit and touch picking, checked on the pure math in `src/lib/scene/mobile-fit.ts`, no browser |
| `npm run orphan-check` | Not in CI. Starts two proofs, kills each mid-run, and counts the host processes left behind. Expect 0. |

`npm test` runs the fourteen `server/*-prove.mjs` scripts: `prove`, `trade-prove`, `sound-prove`, `table-prove`, `trade-table-prove`, `harden-prove`, `net-prove`, `rules-prove`, `bots-prove`, `serve-prove`, `chat-prove`, `rejoin-prove`, `reconnect-prove`, and `persist-prove`. CI also runs `client-prove`, `hotseat-prove`, `tabs-prove`, `trade-prove`, `served-prove`, the browser `chat-prove`, `wayfarer-prove`, `tokens-prove`, `pieces-prove`, and `touch-place-prove`.

---

## Done: what 100% means

1. Two computers. One hosts. The other joins with a code over the internet.
2. They finish a game to 10. The points match the Rule set below.
3. The dice faces match the log. A 7 forces discards, then a wayfarer move.
4. Pictures show in the lobby. Path, outpost, and dice each make a sound.
5. First with the browser client, then with the Unreal client.

---

## Do not

- Do not put the board-game trademark anywhere in the UI. It is **Emberisle**.
- Do not write a second rules engine (in Blueprints, the client, or anywhere else). Call `rules.ts` or the host.
- Do not let a client decide the dice, the steal, or the winner.
- Do not download the 3.6 GB art pack into a cloud session.
- Do not rip sounds from commercial games. Use CC0 only.
- Do not add a 5th seat to the 19-hex island.
