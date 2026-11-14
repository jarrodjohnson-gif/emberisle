# Research: Authoritative Profile Outcome Playback (#1045)

- date: 2026-11-13
- agent: builder-a11y
- lane: hud, net (tier 1, prio p2)
- issue: [#1045](https://github.com/jarrodjohnson-gif/emberisle/issues/1045)
- dependencies: #768, #889, #1043, #1044

## 1. Overview
This research investigates authoritative profile outcome playback for present listeners.
It defines wire events, projection rules, deduplication, and audio arbitration.
It consumes durable terminal outcomes from #889 and shared song selections from #1043.
It wires into the foreground long-clip owner designed in #1044.
All listeners present at completion, including watchers, participate in outcome playback.

## 2. Current State and Gaps
Today, outcome audio is triggered via client-side heuristics in `hear()` within `store.ts`.
In `trade-sound.ts`, `gameEnd()` uses regular expression matching on player names.
Player name checks like `isDiggler()` determine whether to play `isaac_win`.
This approach is insecure and bypasses profile authentication.
Clients lack the authoritative `gameId` required for reliable deduplication.
The current `resultOf()` in `host.mjs` sends only `{ tracked, wins }`.
No playback metadata or song identifiers are carried over the wire.
Watchers have empty local IDs and receive default winner audio.
End music uses a fixed 1,500 ms timer rather than tracking clip completion.

## 3. Shipped and Gated Foundations
Three predecessor milestones establish the necessary architecture for Issue #1045:

### Durable Terminal Outcome (#889 / PR #1231)
- `server/host.mjs` implements `settle(room)` before publishing terminal state.
- `freezeRoster()` generates an immutable `gameId` UUID and frozen participant rows.
- `freezeOutcome()` commits the final room snapshot and pending outcome to disk.
- Outcomes are durable before terminal state reaches connected sockets.

### Host-Validated Shared Catalogue (#1043 / PR #1324)
- `src/lib/profile-songs.ts` defines the approved shared song catalogue.
- Profile creation defaults `winSongId` to `null`.
- Owners select or clear shared songs through authenticated `profileEdit` requests.
- The server validates IDs against `PROFILE_SONGS` and rejects arbitrary URLs or paths.

### Foreground Long-Clip Owner (#1044 / branch `builder-opus/issue-1044`)
- `src/lib/sound.ts` arbitrates long audio clips through one foreground owner.
- Priority rank: `outcome` (4) > `start` (3) > `match` (2) > `soundboard` (1) > `end` (0).
- Lower-priority clips are dropped when a higher-priority clip is playing.
- `cancelForeground()` cancels playing audio and clears queued end music.
- `foregroundScope()` prevents stale async imports and promises from playing.

## 4. Authoritative Wire Protocol
When a game reaches terminal state, `settle(room)` completes on the host.
The host prepares an authoritative playback projection for all present listeners.

### Winner Resolution
1. The rules engine identifies the winning player ID (`room.game.winner`).
2. The host maps `winner` to the frozen participant row in `room.roster.players`.
3. If the winner has an attached `profileId`, the host looks up the profile record.
4. The host extracts `winSongId` and validates it against `isProfileSongId()`.
5. If valid, `winSongId` is assigned to the playback projection.
6. If the winner is a guest or bot, `winSongId` resolves to `null`.
7. If the catalogue entry was deleted, `winSongId` falls back to `null`.

### Wire Payload
The host sends `playback` metadata inside the terminal `state` message:
```json
{
  "type": "state",
  "result": {
    "tracked": true,
    "wins": { "p0": 5, "p1": 2 },
    "playback": {
      "gameId": "d3b07384-d113-49d6-b088-755ef6d37fb9",
      "winnerPid": "p0",
      "winSongId": "isaac-win"
    }
  }
}
```
This payload is sent to all seated players and all active room watchers.
Private credentials, tokens, salt, device IDs, and PINs never enter this payload.

### Deduplication Contract
Clients track `playedOutcomeGameId: string | null` in memory.
When a terminal state message arrives:
- If `result.playback.gameId === playedOutcomeGameId`, playback is skipped.
- Reconnects, resync messages, and duplicate state frames never replay audio.
- Connecting to an already-finished game suppresses outcome audio.
- Only a live transition into the terminal state triggers playback.

## 5. Audio Playback and Arbitration
When a live terminal transition occurs, the client invokes `playForeground()`:

### Playback Rules
- **Selected Win Song:**
  When `winSongId` is present, the selected song plays for all listeners.
  This includes the winner, opponents, and watchers.
  Opponents hear the winner's chosen celebration song.
  The default `game_lose` sting is suppressed and never layered over the song.
- **Default Fallback:**
  When `winSongId` is `null`, default audio plays once.
  The winner hears `win`.
  Opponents hear `game_lose`.
  Watchers hear the spectator default.
- **Asset Failure:**
  If a song file is missing or fails to decode, default audio plays.
  Gameplay and UI presentation are never delayed by audio failure.
- **End Music Queuing:**
  End music is queued via `playEndMusic(ms)`.
  It waits for the selected outcome clip to finish completely.
  Selected songs may play up to 15 seconds.
  End music begins after the song finishes or after 1,500 ms, whichever is later.

## 6. Cancellation Matrix
Outcome audio and queued end music must respond to user actions immediately.

| User Action | Trigger | Audio Behavior |
| :--- | :--- | :--- |
| **Skip** | Skip button pressed | Immediately stops outcome audio and cancels queued end music. |
| **Hide Results** | Look around or Escape | Immediately stops outcome audio and cancels queued end music. |
| **Leave Table** | Exit or return to title | Immediately stops outcome audio and invalidates scope token. |
| **Rematch** | New game started | Cancels existing audio before starting new game audio. |
| **Mute Category** | Music volume zeroed | Cuts off active song and discards queued end music. |
| **Master Mute** | Global mute enabled | Immediately pauses clip and discards waiting timers. |

Unmuting later never resumes a clip from where it stopped.
Late asynchronous chunk loads verify `foregroundScope()` before starting playback.

## 7. Implementation Plan for #1045
The implementation should proceed in four focused steps:

1. **Host Projection Helper:**
   Add `playbackOf(room)` in `server/host.mjs`.
   Derive winner profile, validate `winSongId`, and include `gameId`.
   Transmit payload to seated players and watchers in `pushState()`.
2. **Client Net & Store Integration:**
   Extend `TableEvents` and `useGame` store to parse `result.playback`.
   Track `lastPlayedGameId` in client state to prevent duplicate playback.
3. **Audio Routing:**
   Update `gameEnd()` in `src/lib/trade-sound.ts` to consume `playback`.
   Route selected song or fallback through `playForeground()`.
   Queue end music using clip completion event.
4. **Verification Proof:**
   Add `scripts/profile-outcome-prove.mjs`.
   Test winner, watcher, deduplication, missing assets, Skip, and mute.
   Register proof in `package.json` and `ci.yml`.

## 8. Conclusion
Issue #1045 bridges host-validated profile songs and the foreground audio owner.
It replaces name-based heuristics with authoritative, tamper-proof outcome audio.
All present listeners and watchers experience synchronized celebration playback.
