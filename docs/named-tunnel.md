# One link for every game night

A named Cloudflare tunnel keeps the same public hostname after restarts.
Use a short subdomain such as `play` on a domain you own.
Your domain must use Cloudflare DNS before these steps work.
The hosting computer, Emberisle host, and tunnel must remain running for friends to connect.
This setup provides a stable address, not an always-on hosting service.

## Set up once on the hosting computer

Install `cloudflared` first. On a Mac, run `brew install cloudflared`.
Then authenticate and create one tunnel:

```sh
cloudflared tunnel login
cloudflared tunnel create emberisle
```

Select the domain you control during login.
Keep the UUID printed by the create command.
It also writes a credentials file in your user's `.cloudflared` directory.
Reuse an existing tunnel rather than creating one every night.

From your Emberisle checkout, replace both placeholders:

```sh
node scripts/named-tunnel.mjs --setup play.YOUR-DOMAIN.com YOUR-TUNNEL-UUID
```

The command saves local settings and a dedicated ingress file under `.emberisle-tunnel/`.
It points to the rules host on port 8787, which serves both the browser game and WebSocket.
It does not change your existing Cloudflare configuration or copy credentials into the repository.
It refuses to overwrite a previous setup.

If your credentials file lives elsewhere, pass its absolute path after the port:

```sh
node scripts/named-tunnel.mjs --setup play.YOUR-DOMAIN.com YOUR-TUNNEL-UUID 8787 "/absolute/path/YOUR-TUNNEL-UUID.json"
```

Run the exact `cloudflared tunnel route dns ...` command that setup prints.
That creates the permanent hostname's DNS route.
The setup command prepares files; DNS and a running tunnel are still required.
If the hostname already has a DNS record, resolve that conflict in Cloudflare before continuing.

## Each game night

In the first terminal:

```sh
npm run night
```

In a second terminal, from the same checkout:

```sh
node scripts/named-tunnel.mjs --run
```

The launcher reads the saved settings and starts the same named tunnel through `cloudflared`.
No rotating quick-tunnel URL is created in named mode.
Open the permanent HTTPS link yourself before hosting a table.
Use the lobby's Copy link button; its room code changes with the table, while the website hostname stays fixed.
Friends can bookmark the website and enter the current table code.
They must open the permanent link, rather than an old quick-tunnel link or a localhost invitation.

To inspect startup instructions without starting a host:

```sh
node scripts/night.mjs --print
```

## Verify and recover

1. Open the permanent link from a second device and join a table.
2. Confirm a WebSocket connection and a legal game action work.
3. Stop and restart only the tunnel using the same run command.
4. Open the same bookmarked URL again and confirm joining still works.
5. Restart the hosting computer and repeat after starting both commands.

No live public test has been performed from the coding sandbox.
An owned domain and access to the hosting computer are required for activation.

Saved named-tunnel settings never fall back silently to a rotating URL.
Malformed JSON, missing credentials, changed ingress, and a mismatched `PORT` stop startup with an error.
For another origin port, choose that port during setup; the game host and tunnel must agree.
To replace a setup, keep a backup by renaming `.emberisle-tunnel/`, then rerun setup.
Do not commit that directory or the `.cloudflared` credentials.
An optional `EMBERISLE_TUNNEL_DIR` selects an absolute configuration directory outside the checkout.

Installing a tunnel as a system service is optional and does not keep Emberisle itself running.
Follow Cloudflare's platform instructions if you want the tunnel to start at login or boot.

Source: [Cloudflare's named-tunnel setup guide](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/create-local-tunnel/).
Related: [build bible section 2.2](BUILD_BIBLE.md#22-stable-server-address-do-this-once), [issue #746](https://github.com/jarrodjohnson-gif/emberisle/issues/746).
