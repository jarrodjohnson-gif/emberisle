# Quick tunnel sharing for browser play (issue #72)

This note defines hosting and joining the browser game over the internet.
It matches the single-origin rules host and the join-code link design (#1505).

## Host workflow

1. Build the browser client and start the rules host:
   ```sh
   npm run night
   ```
2. In a second terminal, start the quick tunnel:
   ```sh
   cloudflared tunnel --url http://127.0.0.1:8787
   ```
3. Cloudflare outputs a public `https://<random>.trycloudflare.com` address.
4. Open the public tunnel address in your browser before hosting.
5. Click **Host a table** to open a lobby.
6. Tap the 4-character table code in the lobby header (#1430).
7. Tapping copies the exact join link: `https://<random>.trycloudflare.com/?code=<code>`.
8. Paste that link in your group chat.

## Guest workflow

1. Click the shared join link.
2. The browser opens directly on the join card (#1505).
3. Enter your player name and select a seat colour.
4. Click **Join table <code>**.
5. Guests never type a port number or room code.
6. In the lobby, click **Ready** when set.
7. Ready toggles to **Cancel ready** to allow changing seat or settings.
8. When all players are ready, the host clicks **Start**.

## Connection architecture

- Port 8787 serves both the static web bundle and the WebSocket (#86).
- The client connects WebSocket connections to its own origin (#86).
- Through Cloudflare tunnels, connections use secure `wss://` over port 443.
- Quick tunnels require no Cloudflare account or custom domain.
- Quick tunnel URLs change whenever the tunnel restarts.
- For a permanent domain, configure a named tunnel (`docs/named-tunnel.md`).

## Verification tests

- `npm run night-prove`: tests host build, join lines output, and crash recovery.
- `npm run join-link-prove`: tests `?code=` join card, missing code boxes, and Cancel ready.
- `npm run lobby-code-copy-prove`: tests tapping the lobby code to copy join links.
- `npm run install-prove`: tests browser joins and safe-area layouts across viewports.
