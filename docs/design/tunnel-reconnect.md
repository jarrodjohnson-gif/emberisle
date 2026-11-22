# Tunnel Reconnect Runbook (#197)

This runbook documents the physical verification steps for issue #197.
The test verifies reconnection over a Cloudflare named tunnel.
Two physical devices connect to an online game hosted by `npm run night`.
Device one is a mobile phone that locks mid-game.
Device two is a laptop that switches Wi-Fi networks mid-turn.
Both players must finish the game in their original seats.
Neither player may display a `(bot)` suffix at game completion.

## Equipment and Prerequisites

- One hosting computer running macOS, Linux, or Windows.
- One mobile phone with Safari or Chrome.
- One laptop with access to two distinct Wi-Fi networks.
- A configured Cloudflare named tunnel from `docs/named-tunnel.md`.
- Working directory clean with `npm run build` completed.

## Host Startup

1. Open a terminal on the hosting computer.
2. Start the game host supervisor:

```sh
npm run night
```

3. Open a second terminal on the hosting computer.
4. Launch the registered Cloudflare named tunnel:

```sh
node scripts/named-tunnel.mjs --run
```

5. Confirm the tunnel prints the registered HTTPS hostname.
6. Note the public URL, such as `https://play.example.com/`.

## Test Procedure

### 1. Table Setup and Game Start

1. Open the public URL in the host browser.
2. Click `Host Table` to open a new room.
3. Note the four-letter room code.
4. Open the public URL on the mobile phone.
5. Enter the room code and join the table.
6. Open the public URL on the laptop.
7. Enter the room code and join the table.
8. Click Ready on all three devices.
9. Click Start on the host device.
10. Complete the initial placement phase and roll-off.

### 2. Phone Lock Mid-Game

1. Play two complete turns on the mobile phone.
2. Lock the phone screen during the third turn.
3. Keep the phone screen locked for 60 seconds.
4. Verify the game log shows connection updates on the table.
5. Verify the game log shows: `"<PhonePlayer> lost connection."`.
6. Verify the seat rail marks the phone player as away.
7. Unlock the phone screen after 60 seconds.
8. Open the active browser tab.
9. Observe the phone reconnect automatically using its saved seat secret.
10. Verify the game log shows: `"<PhonePlayer> is back."`.
11. Confirm the phone player remains human without a `(bot)` suffix.
12. Take the next legal action on the phone to confirm synchronization.

### 3. Laptop Wi-Fi Switch Mid-Turn

1. Advance gameplay until the laptop player's turn begins.
2. Roll the dice on the laptop.
3. Switch the laptop to the secondary Wi-Fi network immediately after rolling.
4. Observe the brief `Reconnecting...` status message on the laptop screen.
5. Verify the game log shows: `"<LaptopPlayer> lost connection."`.
6. Allow the operating system to establish the new Wi-Fi connection.
7. Confirm the laptop browser reconnects automatically once the network restores.
8. Verify the game log shows: `"<LaptopPlayer> is back."`.
9. Verify the board remains mounted and turn actions remain available.
10. Complete the turn actions on the laptop and end the turn.

### 4. Game Completion Gate

1. Play the game to completion.
2. Reach the final victory screen.
3. Check the player names on the final score summary.
4. Confirm both the phone and laptop players occupy their original seats.
5. Confirm neither player name carries a `(bot)` suffix.
6. Post the device models and game log lines to issue #197.

## Expected Game Log Signatures

The game log on the table displays these exact status transitions:

- Phone disconnect: `"<PhonePlayer> lost connection."`
- Phone reconnect: `"<PhonePlayer> is back."`
- Laptop disconnect: `"<LaptopPlayer> lost connection."`
- Laptop reconnect: `"<LaptopPlayer> is back."`

## Failure Modes and Technical Mitigations

### 1. Grace Period Expiration (Lock Exceeds 90 Seconds)

- Root cause: The host grace timer (`GRACE_MS = 90 s`) expires before unlock.
- Symptom: Host bot takes over and appends ` (bot)` to the player name.
- Mitigation: Rejoining within the 10-minute hold restores `kind: "human"`.
- Verification: The host removes the ` (bot)` suffix upon successful rejoin.

### 2. Hold Period Expiration (Lock Exceeds 10 Minutes)

- Root cause: The host hold timer (`HOLD_MS = 10 min`) expires.
- Symptom: The host drops the seat and returns `Seat is gone.`.
- Mitigation: Perform phone lock tests within the standard 60-second test window.

### 3. Half-Open Sockets on Dirty Disconnect

- Root cause: Mobile operating systems suspend sockets without sending TCP FIN packets.
- Symptom: Host socket remains open until ping timeout (up to 60 seconds).
- Mitigation: Fast reconnects receive `Seat is taken.`.
- Client response: Client retries with backoff until the host terminates the dead socket.

### 4. Cloudflare Edge Idle Timeout

- Root cause: Cloudflare edge terminates idle WebSockets after 100 seconds of silence.
- Mitigation: Host pings every 30 seconds and client probes every 30 seconds.
- Result: Heartbeats keep Cloudflare tunnel connections active.

### 5. Mobile Browser Tab Eviction

- Root cause: Mobile operating systems purge background browser processes under memory pressure.
- Mitigation: Client saves the seat secret in `localStorage`.
- Recovery: The page reloads and automatically rejoins the active seat.

### 6. Mid-Turn Timer Expiration

- Root cause: Disconnecting during an active turn could trigger turn expiration.
- Mitigation: The host pauses the turn timer upon disconnect.
- Result: The 90-second grace timer governs bot takeover instead.

## Automated Verification

Automated proofs validate host and client reconnect logic:

- `npm run tunnel-reconnect-prove`: Simulates phone lock and Wi-Fi switch sequences.
- `npm test`: Validates host secret recovery, grace expiration, and keepalive termination.
- `npm run tabs-prove`: Validates multi-tab browser reconnects and localStorage restoration.
