# Research: the browser client on the rules host (issue #77)

- step: 1 Research, node #70 (Play a browser table through the rules host)
- date: 2026-09-27
- agent: Claude

## What I read

`src/lib/game/store.ts` (all of it), `src/components/game/Hud.tsx` (every `dispatch` and `useGame` call),
`src/components/scene/IslandCanvas.tsx`, `src/components/game/EmberisleApp.tsx` (`Title`),
`server/host.mjs`, `docs/design/connection.md`.

```
grep -n "useGame((s) => s\.\|getState()\.\|dispatch(" src/components/game/*.tsx src/components/scene/*.tsx
```

## What is true

**One choke point.** Every game move in the UI goes through `useGame().dispatch(action)` with a rules
`Action` (types.ts). The canvas clicks (`pickHex`, `pickVertex`, `pickEdge`) and the HUD buttons both call
`dispatch`. In online mode, `dispatch` only has to turn the `Action` into a host intent and send it.
The state comes back from the host. Nothing else in the UI needs to know it is online.

### Store action → host intent

| Store call (who calls it) | Rules `Action` | Host intent (build bible §10) |
|---|---|---|
| `pickVertex` in `setupSettle` (canvas) | `setupSettle {vertexId}` | `place {kind:"outpost", id}` |
| `pickEdge` in `setupRoad` (canvas) | `setupRoad {edgeId}` | `place {kind:"path", id}` |
| `pickVertex`, buildMode `outpost` | `buildOutpost {vertexId}` | `place {kind:"outpost", id}` |
| `pickVertex`, buildMode `stronghold` | `buildStronghold {vertexId}` | `place {kind:"stronghold", id}` |
| `pickEdge`, buildMode `path` | `buildPath {edgeId}` | `place {kind:"path", id}` |
| `pickHex` in `robber` | `moveRobber {hexId, stealFrom:null}` | `rob {hexId, stealFrom}` |
| `pickHex`, buildMode `knight` | `playKnight {hexId, stealFrom:null}` | `play {card:"knight", hexId, stealFrom}` |
| Hud Roll (Hud.tsx:176) | `roll` | `roll` |
| Hud Fortune (Hud.tsx:156) | `buyCard` | `buy` |
| Hud Pass (Hud.tsx:169) | `endTurn` | `pass` |
| Hud discard modal (Hud.tsx:243) | `discard {resources}` | `discard {cards}` |
| Hud bank trade (Hud.tsx:282) | `bankTrade {give, want}` | `tradeBank {give, take}` |
| (no UI yet) | `playRoad`, `playPlenty`, `playMonopoly` | `play {card:"road", ids}`, `play {card:"plenty", resources}`, `play {card:"monopoly", resource}` |
| (no UI yet) | `offerTrade` / `respondTrade` | `tradeAsk` / `tradeAnswer` (host-run, 20 s) |

### Host message → store

| Host message | Store does |
|---|---|
| `welcome {code, you, host}` | Remember the table code, seat id, and whether you are the host. Show the lobby. |
| `seats {code, seats[]}` | Lobby seat list (a new store field, `seats`) |
| `state {you, game, legal}` | `loadState(game, you, host, code)` (it already exists and sets `mode:"online"`), plus keep `legal` |
| `rolled {dice, sum, gains}` | Nothing new is needed. `game.dice` arrives in the next `state`. Later: the dice animation. |
| `log {text}` | Append to a store `log` line (the HUD reads `state.log` today, which arrives in `state`) |
| `error {message}` | `set({ error, toast })`, the same as a local rules error |
| `tradeOffer` / `tradeClosed` | New toast with Yes and No. There is no UI yet, and it is not needed for this node's test. |

### Store pieces that change in online mode

| Piece | Today | Online |
|---|---|---|
| `dispatch` | `applyAction` locally | send the intent. Return `{ok:true}` right away, and let `state` update the board. |
| `highlights()` | `legalSettle` / `legalRoads` / `legalCities` on the local state | use `legal.outpost`, `legal.path`, `legal.stronghold`, `legal.wayfarer` from the host |
| `runBots` | runs bots every 700 ms | does nothing (it only acts for `kind:"bot"` seats, and online seats are human, so it is already safe) |
| `screen` | `title` → `play` | `title` → `lobby` → `play`. `lobby` is already in the `Screen` type. `EmberisleApp` shows `Title` for `lobby` and needs a lobby view. |
| Title "Host a table" (EmberisleApp.tsx:78) | makes a fake code with `tableCode()` and copies a URL | sends `hello` with no code |
| Title "Join" (EmberisleApp.tsx:103) | sets `?table=` and **starts a bot game** (a bug: it never joins anything) | sends `hello` with the code |

### Where the socket connects

- In dev, the client runs on 8080 (Vite) and the host on 8787. The client needs the host URL: default
  `ws://<page host>:8787`, overridable by `?host=wss://...` (the browser version of `host.txt`).
- After #72 (the host serves `dist/`), the default becomes same-origin `wss://<page host>`.

## Gaps found (they go to Design or become issues)

1. **Hidden fortunes in the HUD.** Hud.tsx:105 shows `hiddenCount(p)`. The host zeroes other players'
   `hidden` and sends `fortunes` instead, so online the HUD would show 0. Use `p.fortunes ?? hiddenCount(p)`.
2. **Steal choice.** `pickHex` always sends `stealFrom:null`. The host picks when there is exactly one
   target, but with two or more the move is rejected. The host sends `legal.steal[hexId]`, so the client needs the
   "Take from whom?" row (BUILD_BIBLE §4.6). This was already listed on #71 from the old BUGS.md.
3. **The Join button starts a bot game.** EmberisleApp.tsx:103-112 is a bug today, in any mode.

## What I am not sure about

- Whether the HUD reads anything else from the full `GameState` that the host redacts (only `deck` and
  other players' `hidden` are redacted). A grep for `deck` in `src/components` finds nothing, so it looks safe.

## Handoff

```
done: the mapping above
left: #78 Design src/lib/net/table.ts (the socket client) using these tables
next agent: #78
```
