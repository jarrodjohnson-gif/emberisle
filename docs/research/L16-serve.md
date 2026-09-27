# Research: the client, socket, and avatars behind one tunnel (issue #85)

- step: 1 Research, node #72 (Let friends play the browser version over the internet)
- date: 2026-09-27
- agent: Claude

## What I read

`server/host.mjs` (the http server, avatar routes, `leave`), `src/lib/net/table.ts` (`hostUrl`, `connectTable`),
`vite.config.ts`, the built `dist/index.html`, docs/BUILD_BIBLE.md §2.2, and Cloudflare's own docs pages
(from the `cloudflare/cloudflare-docs` repo, since developers.cloudflare.com is blocked from this container):
Quick Tunnels (`trycloudflare.mdx`), WebSockets (`network/websockets.mdx`), and tunnel DNS records
(`partials/cloudflare-one/tunnel/dns-records-intro.mdx`, `dns-records-create.mdx`).

## What is true

**One port already carries HTTP and the socket.** `host.mjs` makes one `http.createServer` and hands it to
`new WebSocketServer({ server })`. Plain requests go to the request handler (today only `POST /avatars` and
`GET /avatars/<id>.jpg`, everything else is 404). Upgrade requests go to `ws`, on any path. So one tunnel to
port 8787 already reaches the socket and the avatars. What it does not reach is the client itself.

**The built client is small and root-relative.** `npm run build` writes `dist/` (952 KB): `index.html` plus
`dist/assets/*.js|css` with hashed names. `index.html` loads `/assets/...` (Vite `base` is the default `/`),
so the client must be served at the site root. The favicon is an inline data URI. Terrain photos are bundled
through `import.meta.glob` into `dist/assets/`, so there is no separate `public/` folder to serve.
Content types needed: `.html`, `.js`, `.css`, `.jpg`, `.png`, `.svg`.

**The client dials the wrong address behind a tunnel.** `hostUrl` builds `ws(s)://<page hostname>:8787`.
Behind a tunnel the page is `https://<name>.trycloudflare.com` on 443, so the client dials
`wss://<name>.trycloudflare.com:8787`, which the tunnel does not listen on. Same-origin serving fixes this
only if the default becomes `location.origin` with `http→ws` / `https→wss` (and no port change).
`?host=` must keep winning, and `npm run dev` (Vite on 8080, host on 8787) still needs the `:8787` fallback,
so the rule is: use the page origin when the page came from the host, else `:8787`. That choice is the
design question for #86.

**Avatar URLs are already relative.** The host hands out `/avatars/<id>.jpg`. Served same-origin, those work
unchanged through the tunnel. The client does not upload avatars yet (no `fetch("/avatars")` in `src/`), so
nothing else needs to change for this node.

**Quick tunnel (no account).** `cloudflared tunnel --url http://localhost:8787` prints a random
`https://<words>.trycloudflare.com` URL. The URL changes every run. Limits from Cloudflare's docs: 200
in-flight requests (a 429 past that; four sockets plus a page load is far below it), no Server-Sent Events
(not used), no SLA, "testing and development only". It refuses to start if `~/.cloudflared/config.yaml`
exists, so a PC that later sets up a named tunnel must rename that file to use a quick tunnel again.
For a game night where Jarrod pastes the link into the group chat, this is enough: the link is the whole
address, because the client, socket, and avatars share it.

**Named tunnel needs a domain on Cloudflare.** Cloudflare's docs: a tunnel gets `<UUID>.cfargotunnel.com`,
but that name is only a CNAME target and "only proxies traffic for DNS records in the same Cloudflare
account". `cloudflared tunnel route dns <tunnel> <hostname>` creates that CNAME in a zone you own.
**BUILD_BIBLE §2.2 step 1 is wrong** where it says a free `*.cfargotunnel.com` hostname works without a
domain. A stable URL therefore means a domain on Jarrod's Cloudflare account (that is decision #60).
The browser version does not need a stable URL; the packaged Unreal build does.

**WebSockets through Cloudflare.** Supported on all plans with no setup. Cloudflare says it "may restart
servers, which terminates WebSockets connections" when it deploys, and recommends a keepalive.
Today `host.mjs` sends no pings, and `leave()` turns a dropped player into a bot for the rest of the game:
there is no way to sit back down in the same seat. On a LAN that rarely matters. Over a tunnel a single
dropped socket costs a friend their game. Filed as child nodes below.

**No origin check.** The `WebSocketServer` has no `verifyClient`. Any page could open a socket to the
tunnel URL, but it would still need a 4-character room code to sit down, and the host already validates
every move. Not worth blocking the first game night; noted, not filed.

## What I am not sure about

- The live tunnel was not run: opening a public tunnel from this cloud container is not allowed. The
  end-to-end check stays with #88 on Jarrod's PC.
- Cloudflare's idle timeout for a quiet WebSocket (a player thinking for minutes) is not stated on the
  WebSockets page. A 30-second ping from the host makes the number irrelevant.
- Windows install line for cloudflared (`winget install --id Cloudflare.cloudflared`) is from memory, not
  from a doc I could open here. #87 should check it when it writes the README step.

## Prove output

Probe against the real `host.mjs` on `main` (`faeb4e5`), run from `server/` with `node --import ./register.mjs`:

```
GET / -> 404
GET /assets/x.js -> 404
POST /avatars -> 200 then GET /avatars/e866e8b15c51e52a.jpg -> 200
WS / on the same port -> welcome code CS9H
hostUrl https://abc.trycloudflare.com -> wss://abc.trycloudflare.com:8787
hostUrl http://192.168.1.20 -> ws://192.168.1.20:8787
```

Lines 1-2 are the gap #86 closes (the client is not served). Line 3-4 show avatars and the socket already
share one port. Line 5 is the wrong address a tunnelled page would dial today.

## Handoff

```
done: research note; children filed: #113 keepalive ping, #114 rejoin research
left: #86 design same-origin serving (static dist/ from host.mjs, hostUrl default to location.origin)
broke: nothing
next agent: #86, then #87; the keepalive/rejoin children can run beside them (different files)
```
