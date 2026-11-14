# Watcher cheers specification

- status: design
- issue: #1450
- rank: 7 (Issue #1450 item 4)
- author: builder-size

## Vision

Watcher cheers allow spectators to react to live matches without playing.
Spectators can send the six standard chat emoji.
Cheers bubble from a designated spectator origin on the board.
The feature keeps the game quiet, polite, and unobtrusive.
Seated players can enjoy audience participation without game disruption.

## Allowed Emoji Set

Spectators can only send emoji from the fixed allowlist of six strings.
This set exactly matches the six seat chat emoji in `server/host.mjs`.

1. `"😠"` (Angry)
2. `"😊"` (Smile)
3. `"👏"` (Clap)
4. `"😂"` (Laugh)
5. `"🔥"` (Fire)
6. `"🐑"` (Sheep)

- Spectators cannot send custom text messages.
- Spectators cannot send image stickers or meme sounds.
- Any unlisted emoji or string is rejected silently by the host.

## Wire Protocol

### Spectator Message
A spectator socket sends a cheer payload over the existing WebSocket connection.

```json
{
  "type": "cheer",
  "emote": "👏"
}
```

### Host Validation Rules
When the server receives a message from a spectator socket (`ws.watch`):

1. **Bucket check**: Verify the spectator cheer token bucket.
2. **Type check**: Message type must equal `"cheer"` or `"react"`.
3. **Allowlist check**: `msg.emote` must belong to the six allowed emoji.
4. **Broadcast**: Emit the cheer event to all room sockets and watchers.

```json
{
  "type": "cheer",
  "emote": "👏",
  "from": "watcher",
  "at": 1731518400000
}
```

## Rate Limits and Spam Prevention

Spectators must not flood the table with emoji bubbles.

- **Per-socket token bucket**:
  - Burst capacity: 2 tokens.
  - Refill rate: 1 token every 3 seconds (0.33 tokens/sec).
  - Excessive requests drop silently without sending error responses.
- **Room-wide throttle**:
  - The board displays at most 4 simultaneous spectator cheer floats.
  - Excess incoming cheers queue or discard when the screen cap is reached.
- **Coalescing**:
  - Repeated cheers of the same emoji coalesce into a single bubble with a count multiplier (`×2`, `×3`).

## Floating Bubble UI and Presentation

Spectator cheers render through the shared reaction floating layer in `Reactions.tsx`.

### Anchor and Bubble Origin
- Player seat reactions emerge directly from seat name cards.
- Spectator cheers emerge from the spectator count badge in the top HUD.
- On desktop, bubbles float down and right from the eye count icon.
- On mobile, bubbles float from the watching pill in the Table menu header.

### Visual Styling
- Bubble background uses a subtle tinted frosted glass (`rgba(244, 244, 245, 0.85)`).
- Border uses a light slate accent to distinguish spectators from seated players.
- A tiny spectator icon or "Watcher" label appears beneath the emoji.
- The bubble lifetime lasts exactly 2.0 seconds.
- Normal motion floats upward by 16 pixels before fading out.
- Under `prefers-reduced-motion`, bubbles fade in place without vertical motion.

## Spectator Audio Rules

Spectator cheers must not distract players making critical decisions.

- **Default behavior**: Spectator cheers produce no sound for seated players.
- **Spectator local sound**: The sending spectator hears a quiet confirmation pop.
- **Audio setting**: Players can enable optional soft spectator chimes in Table menu audio settings.
- **Mute enforcement**: Muting the table silences all spectator audio immediately.

## Performance and Size Constraints

- **Bundle footprint**: Reuses existing `Reactions.tsx` and `emotes.ts` components.
- **Chunk growth**: Adds zero bytes to the initial bundle.
- **Render performance**: Float animations use hardware-accelerated CSS transforms and opacity.
- **Idle state**: Disconnecting inactive float nodes preserves the 12 fps idle throttle.

## Delivery Phases

### Phase 1: Host Protocol and Validation
- Update `server/host.mjs` to permit cheer frames on `ws.watch`.
- Enforce token bucket rate limiting on spectator connections.
- Add unit tests for allowed and rejected cheer payloads.

### Phase 2: Client Reaction Display and Origin
- Add spectator float origin anchor to HUD spectator badge.
- Render distinct spectator bubble styling in `Reactions.tsx`.
- Implement emoji coalescing for rapid cheers.

### Phase 3: Spectator Controls and Settings
- Add floating cheer action trigger bar to the spectator HUD.
- Add spectator audio preferences toggle in sound settings.
- Verify browser proofs pass across desktop and phone viewports.
