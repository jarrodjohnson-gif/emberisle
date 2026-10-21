# Checkpoint 1: partial app map

Author: GPT-6 Astra (medium). Status: **incomplete; paused for usage**.
Baseline: `8a9e75d7dd6709192dc8c6fa681cf9725c3e4e95`, current main fetched 2026-10-21 UTC.
No verdict, redesign, runtime changes, commits, push, or PR.

## Evidence labels

- **seen**: walked in this running local app.
- **source**: read from baseline code; not exercised here.
- **untested**: not yet walked or established from source.

## Top-level map

```text
Title --Play--> Play (practice)
Title --Four seats, one table--> Play (hotseat)
Title --Host/Join--> Lobby --Start--> Play (online)
Title --Watch with code--> Watching (online)
Play --Table menu/Leave--> Title
Play --game over--> Results --Look around--> Finished board
Results --Play again--> New game
Results --Menu--> Title
```

Only the title and entry help transitions below were fully walked before the usage stop.
Other arrows are source-derived; online rematch and spectator transitions still need detailed verification.

## Journey coverage

| Journey | Status | Evidence and remaining work |
|---|---|---|
| Entry | **seen** | Desktop 1280×720 title loaded; screenshot 01. Shows name, colour choices, Wayfarer preferences, Play, Host, Join, hotseat, help and sound. |
| Entry → How to play → Close | **seen** | Opened help, read rules, closed it and returned to title. Evidence JSON records rendered text. |
| Name and preferences | **source** | `src/lib/game/store.ts:541`, `:546`, `:551` persist name and colour. Water/view preferences persist at `:948`, `:956`. Reload persistence remains untested. |
| Invalid join and practice entry | **untested** | Browser commands were started at the usage stop. Consult walk-evidence.json for any completed observations; do not infer success from commands. |
| Practice | **source** | `src/lib/game/store.ts:562` starts practice. Full roll-off, setup, turns and exit remain unwalked. |
| Hotseat | **source** | `src/components/game/EmberisleApp.tsx:306` starts four-seat hotseat. `src/lib/game/store.ts:594` owns startup. Handoffs and private information remain untested. |
| Host, join, lobby, readiness | **source** | `src/lib/game/store.ts:867`, `:871`; app mounts lobby at `src/components/game/EmberisleApp.tsx:68`. Host started locally; no lobby walk completed. |
| Watching | **source** | `src/components/game/EmberisleApp.tsx:147` parses code/watch links. `src/lib/game/store.ts:885` connects watchers. Live spectator journey untested. |
| Setup, rolls, builds, fortunes, trades, chat, ownership | **untested** | Walk through controls and record each state, cancellation and transition. |
| Rules, history, secondary actions, strategy | **source** | `src/components/game/TableMenu.tsx:156` help; `:166` costs; `:177` sound; `:182` music; `:191` water; `:203` view; `:210` code; `:216` log; `:220` leave. In-game behaviour untested. |
| Errors, disconnect, rejoin | **source** | `src/lib/game/store.ts:886` rejoin; `:1237` duplicate-seat tab returns to title; `:1244`, `:1252`, `:1257` lost-table paths. Recovery walk untested. |
| Results, rematch, return | **source** | `src/components/game/WinScreen.tsx:205` Look around; `:209` Play again; `:213` Menu. Hidden results can reopen at `:79`. Completion and rematch untested. |
| Account/profile screens | **untested** | No conclusion about existence. Search remaining source and actual entry points before completing map. |

## State retention inventory, not yet verified by reload

- **source**: screens are `title`, `lobby`, `play` (`src/lib/game/store.ts:257`). Results are within play.
- **source**: name uses localStorage (`src/lib/game/store.ts:471`, `:474`, `:541`).
- **source**: online live-seat marker uses localStorage (`src/lib/game/store.ts:427`, `:442`).
- **source**: chat-open preference uses localStorage (`src/lib/game/store.ts:410`, `:939`).
- **source**: leaving uses `goTitle` (`src/lib/game/store.ts:641`). Exact cleared and retained fields require inspection.
- **untested**: browser Back, refresh, closed tab, network loss, host migration, hotseat private-state handoff, and rematch retention.

## Remaining checkpoint work

Complete all six scope journeys in the running app, including online host/join/watch/reconnect and real end-state transitions.
Inventory all overlays and failure states; attach source lines and distinguish fixture-assisted rendering from actual end-to-end play.
Record dead ends and state retention without recommendations. Check phone portrait and landscape.
Keep at most 12 JPG screenshots, each under 300 KB. This partial map does not satisfy checkpoint 1 acceptance.
