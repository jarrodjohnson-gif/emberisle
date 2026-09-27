# Design: the browser socket client (issue #78)

Source: [docs/research/online-table.md](../research/online-table.md), [connection.md](connection.md), `server/host.mjs`.

## Module: `src/lib/net/table.ts`

It has no React and no zustand, so a Node proof script can drive it with the `ws` package, just as the browser uses `WebSocket`.

```ts
export interface TableEvents {
  welcome(msg: { code: string; you: string; host: boolean }): void;
  seats(msg: { code: string; seats: Seat[] }): void;
  state(msg: { you: string; game: GameState; legal: Legal }): void;
  rolled(msg: { dice: [number, number]; sum: number; gains: Gain[] }): void;
  log(text: string): void;
  error(message: string): void;
  closed(): void;                        // socket dropped: "Lost the table"
}

export interface TableClient {
  open(me: { name: string; color: string; avatarId?: string }): void;               // hello, no code
  join(code: string, me: { name: string; color: string; avatarId?: string }): void; // hello + code
  ready(value: boolean): void;
  start(): void;
  act(action: Action, phase: Phase): void; // a rules Action -> host intent (table below)
  close(): void;
}

export function connectTable(url: string, on: Partial<TableEvents>, Socket = WebSocket): TableClient;
export function hostUrl(location: Location): string; // ?host=... wins, else ws(s)://<page host>:8787
export function toIntent(action: Action): object | null; // pure, unit-tested
```

- Messages sent before the socket opens are queued, and sent in order on `open`.
- `toIntent` is the Action → intent table from the research note:
  `setupSettle` / `buildOutpost` → `place outpost`, `setupRoad` / `buildPath` → `place path`,
  `buildStronghold` → `place stronghold`, `roll`, `buyCard` → `buy`, `endTurn` → `pass`,
  `moveRobber` → `rob`, `playKnight` / `playRoad` / `playPlenty` / `playMonopoly` → `play`,
  `discard` → `discard {cards}`, `bankTrade` → `tradeBank {give, take}`.
  `offerTrade` and `respondTrade` return `null` (the host runs ask-the-table trades itself).
- `Legal` and `Seat` are the shapes `host.mjs` sends (`legalFor`, `seatsOf`).

## Store changes (step 3, #79)

| Field or action | Change |
|---|---|
| `table: TableClient \| null`, `seats`, `legal`, `code`, `isHost` | new fields |
| `hostTable(name, color)` / `joinTable(code, name, color)` | `connectTable(hostUrl(location), …)` then `open` or `join`, and `screen: "lobby"` |
| `dispatch(action)` | if `mode === "online"`: `table.act(action, state.phase)` and return `{ok:true}`, with no local `applyAction` |
| on `state` | `loadState(game, you, isHost, code)` and `set({ legal })` |
| on `error` | `set({ error, toast })` |
| `highlights()` | if online: `{ vertices: [...legal.outpost, ...legal.stronghold], edges: legal.path, hexes: legal.wayfarer }`, narrowed by `buildMode` the same way as today |
| `goTitle` | `table?.close()` |

## Proof (step 2 completion test)

`server/net-prove.mjs` starts `host.mjs` on a random port and runs three `connectTable(url, …, WebSocket from "ws")`
clients through `open`, `join`, `ready`, `start`, and the whole setup, using only `act()` with rules `Action`s and the `legal` lists.
It passes when setup ends in phase `roll` on all three clients with the same `game.seq`.
