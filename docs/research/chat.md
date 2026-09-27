# Research: table chat and emoji reactions (issue #118)

- step: 1 Research, node #117 (Let players chat and send emoji reactions at the table)
- date: 2026-09-27
- agent: Claude

## What I read

`server/host.mjs` (`send`, `broadcast`, `say`, `seatsOf`, the message switch, `new WebSocketServer`),
`src/lib/net/table.ts` (`TableEvents`, the `onmessage` switch), `src/components/game/Hud.tsx` (the log line),
`src/components/game/EmberisleApp.tsx` (`Lobby`), `src/lib/scene/isle-renderer.ts` (how terrain photos load),
README "Messages between client and host", BUILD_BIBLE §3.3 and §4.4.

## What is true

**The decision.** Jarrod decided on 2026-09-27 that chat is needed and that players can react with emoji
he supplies as small transparent images. BUILD_BIBLE §3.3 ("No chat required for v1") and §4.4 ("Do not build
a chat") said the opposite. This PR changes both lines. The §4.4 line was about trades, and it still holds
there: an offer goes through the trade panel, never through chat.

**The host already has what chat needs.** `broadcast(room, msg)` sends to every seat, and each socket knows
its `seat` (`id`, `name`, `color`). Chat is one new client intent and one new host message. The host fills
in who sent it, so a client cannot speak for another seat. It works the same before and after `start`,
because `room` exists from the first `hello`. The switch at `host.mjs:415-428` only needs its new cases
before the `if (!room.game) return … "not ready"` line, so that lobby chat works.

**Proposed messages** (the Design step fixes the names):

| Client → host | Host → every seat |
|---|---|
| `{type:"chat", text}` | `{type:"chat", from, name, color, text, at}` |
| `{type:"react", emote}` | `{type:"react", from, emote, at}` |

- `from` is the seat id. `name` and `color` travel with the chat line because a lobby chat has no `game.players` yet.
- `at` is the host's `Date.now()`. Clients order lines by it.

**Limits the host must enforce** (a client can send anything):
- Chat `text`: a string. Trim it, and drop control characters (`\p{Cc}`). Cut it at **200**
  characters. Drop it if it is empty.
- Rate: about **5 messages per 5 s per seat**. Chat and reactions share this bucket. Past it, the host
  replies `error {message:"Slow down."}` to that seat alone.
- `emote`: must be an id from the host's allowlist (below). Anything else is dropped without a broadcast.
- Keep the last **50** chat lines per room (`room.chat`). Send them in `welcome` or a first `chat` batch,
  so someone who sits down late, or rejoins after #114, sees the conversation. Reactions are not kept.
- **Socket size is unbounded today.** `new WebSocketServer({ server })` has no `maxPayload`, and the `ws`
  default is 100 MiB. Chat is the first free-text message, so the Implementation step should set
  `maxPayload: 16 * 1024`. The biggest client message today is a `discard` or a trade, well under 1 KB.

**Showing chat safely.** React escapes text in `{text}` children, so a chat line rendered as text cannot run
script. The rule for the Design step is: never `dangerouslySetInnerHTML`, never turn chat text into a link,
and never use chat text as an image URL or CSS value. Names are already shown the same way.

**Where it shows.**
- Lobby (`Lobby` in EmberisleApp.tsx): a chat box under the seat row, with an input and Send button, and
  the reaction bar.
- Game (`Hud.tsx`): today the bottom panel shows the last 3 `state.log` lines at `sm:` widths and up. Chat
  goes in its own small panel: a collapsible box on the left, with the last few lines and an input. Enter
  opens it and sends; Esc closes it. It must not cover the board's click targets on a phone.
- A reaction shows as the image, about 48 px, floating over the sender's seat or player card for ~2 s and
  then fading. It does not add a line to the chat. Sound: optional `ui_react`, CC0 only (README "Do not").

**The emoji images Jarrod supplies.**
- Format: **PNG or WebP** with transparency. SVG works too, but browsers can run scripts in an SVG opened
  as a page, so keep to PNG/WebP unless they are plain vector art.
- Size: **128 × 128 px**, shown at 32-48 px (sharp on high-DPI screens). Target **under 15 KB each**.
- Names: lowercase, `a-z 0-9 -`, for example `laugh.png`, `gg.png`, `angry-sheep.png`. The file name without
  the extension is the `emote` id.
- Count: 8-16 fits in one reaction bar without scrolling.
- Place: `src/assets/emotes/`. The client loads them with `import.meta.glob("../../assets/emotes/*.{png,webp}", { eager: true, query: "?url", import: "default" })`,
  the same pattern `isle-renderer.ts` uses for terrain photos. Vite then hashes them into `dist/assets/`,
  and #116's host serves them with `immutable` caching. No new host route is needed.
- The **allowlist** is the same folder. The host reads `src/assets/emotes/` once at start (`readdirSync`)
  and builds a `Set` of ids, so an image added to the folder becomes a valid reaction with no code change.
  The Unreal client can later ship the same files and ids.
- Only Jarrod's images. No emoji picker from a font or a library, so the set and look stay his.

**Out of scope for this node:** private messages, a profanity filter, message edits or deletes, and chat
history after the table closes. A table is 3-4 friends, so moderation beyond the length and rate limits is
not needed. The host could later add a "mute this seat" on the client side only. It is an idea, not filed.

## What I am not sure about

- Whether Jarrod wants chat during the game to show as floating bubbles over the player cards, or only in a
  panel. The Design step should show both and let him pick in the PR.
- The final emote count and names wait on his files. The design and code do not depend on them.

## Prove output

Research step: no code. Facts above were read from `main` at `c548c6f` (after #115 merged).

## Handoff

```
done: research note; BUILD_BIBLE §3.3/§4.4 updated; children filed under #117: #119 design, #120 Jarrod's emote images
left: Design step, then Implementation (waits for #116: both touch host.mjs and table.ts)
broke: nothing
next agent: #119
```
