# Design: serve the client from the rules host (issue #86)

Source: [docs/research/L16-serve.md](../research/L16-serve.md), `server/host.mjs`, `src/lib/net/table.ts`.

Goal: one address carries the page, the socket, and the avatars. `http://localhost:8787` on the host PC,
`http://<LAN ip>:8787` at home, and `https://<name>.trycloudflare.com` through a tunnel all work with no
`?host=` in the link.

## 1. `host.mjs` serves `dist/`

The request handler keeps the avatar routes first. Anything else that is a `GET` or `HEAD` falls through to
a static handler. No new dependency: `node:fs/promises`, `node:path`.

| Request | Answer |
|---|---|
| `/` | `dist/index.html`, `cache-control: no-cache` |
| `/assets/<file>` that exists | the file, `cache-control: public, max-age=31536000, immutable` (Vite hashes these names) |
| any other file that exists under `dist/` | the file, `no-cache` |
| a path that resolves outside `dist/` (`..`, `%2e%2e`, an absolute path, a NUL byte) | 404 |
| a missing file | 404 (no SPA fallback: the client has no routes) |
| `/` when `dist/index.html` does not exist | 503, text `Run npm run build first.` |
| `POST` or anything else not matched | 404, as today |

- `DIST` is `process.env.DIST` or `new URL("../dist/", import.meta.url)`. The env var lets the proof point
  the host at a small temp folder, so `npm test` does not need a build first.
- Containment check: `const file = path.resolve(DIST, "." + decodeURIComponent(url.pathname))`, then
  refuse unless `file.startsWith(DIST + path.sep)` (or equals `DIST/index.html` for `/`). A
  `decodeURIComponent` throw is a 404.
- Content types by extension: `.html` `text/html; charset=utf-8`, `.js` `text/javascript`, `.css`
  `text/css`, `.json` `application/json`, `.svg` `image/svg+xml`, `.png`, `.jpg`/`.jpeg`, `.webp`,
  `.woff2`, `.ogg`, `.mp3`; anything else `application/octet-stream`. Add
  `x-content-type-options: nosniff` to every static answer.
- Files are read with `readFile` per request. `dist/` is under 1 MB and a table is four people, so no
  cache in memory.
- The WebSocket is untouched: `ws` takes upgrade requests on any path before the request handler sees them.

## 2. The client dials its own origin

```ts
// ?host= wins. In `npm run dev` the page is on Vite (8080) and the host on 8787.
// A built page was served by the host itself, so it dials the address it came from.
export function hostUrl(loc: { protocol: string; hostname: string; host: string; search: string },
                        dev = import.meta.env?.DEV ?? false): string {
  const pinned = new URLSearchParams(loc.search).get("host");
  if (pinned) return pinned;
  const scheme = loc.protocol === "https:" ? "wss" : "ws";
  return dev ? `${scheme}://${loc.hostname}:8787` : `${scheme}://${loc.host}`;
}
```

- `loc.host` carries the port when there is one (`192.168.1.20:8787`) and none behind the tunnel
  (`abc.trycloudflare.com`), which is exactly what the socket needs.
- `import.meta.env?.DEV`: Vite sets it to `true` in `npm run dev` and `false` in a build. Under Node
  (`net-prove.mjs` imports `table.ts`) `import.meta.env` is undefined, so the default is `false`, and the
  proof passes `dev` explicitly.
- `vite preview` (port 8080) will dial 8080 and fail. Nobody uses it for play; `?host=` still works there.
- `store.ts` keeps calling `hostUrl(window.location)`. Nothing else in the client changes. Avatar URLs are
  already `/avatars/<id>.jpg`, relative to the page, so same-origin makes them work as they are.

## 3. Tests

**`server/serve-prove.mjs`**, added to `npm --prefix server test`. It writes a temp `dist/` (an
`index.html` and `assets/app-abc123.js`), starts `host.mjs` with `PORT=0` and `DIST=<temp>`, and checks:

```
GET /                         -> 200 text/html, no-cache
GET /assets/app-abc123.js     -> 200 text/javascript, immutable
GET /assets/missing.js        -> 404
GET /../package.json          -> 404   (sent raw, not normalised by fetch)
GET /%2e%2e/package.json      -> 404
POST /avatars then GET it     -> 200, 200
WS on the same port           -> welcome
host with DIST=<empty dir>: GET / -> 503
hostUrl https://abc.trycloudflare.com         -> wss://abc.trycloudflare.com
hostUrl http://192.168.1.20:8787              -> ws://192.168.1.20:8787
hostUrl http://localhost:8080 (dev)           -> ws://localhost:8787
hostUrl ...?host=ws://x:1                     -> ws://x:1
serve prove ok
```

The raw `..` requests go through `node:http` `request({ path })`, since `fetch` removes dot segments.

**Browser end to end** (in the same PR, as a second mode of `scripts/tabs-prove.mjs`, or a short
`scripts/serve-tabs-prove.mjs`): after `npm run build`, start the host with the real `dist/`, open three tabs
at `http://127.0.0.1:<hostPort>/` with **no** `?host=`, and play setup. Zero console errors and zero 4xx
responses. CI already runs `npm run build` before the proofs.

## 4. Steps this design feeds

- **Implement static `dist/` serving and the same-origin `hostUrl`** (sections 1-3). New issue, Size S.
- **#87** `npm run night` then only has to run `npm run build` and `npm run host`, and print the join line:
  the local URL, the LAN URL, and the `cloudflared tunnel --url http://localhost:8787` command to run next to
  it. It depends on the step above.
- **#88** is unchanged: a second computer opens the tunnel URL, joins with the code, places an outpost.
