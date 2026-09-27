# Glow and click-to-place (issue #45)

Sources: build bible 4.2 and 8, and `legalFor` in `server/host.mjs`.

## What the server says is legal

Every `state` message carries `legal` for the seat that receives it:

```json
{
  "outpost": ["-2.91,-0.56"],
  "path": ["-2.91,-0.56|-2.91,0.56"],
  "stronghold": [],
  "wayfarer": ["0,0"],
  "steal": { "0,0": ["p2"] },
  "discard": 0,
  "actions": ["roll", "buy", "trade", "pass", "play:knight"]
}
```

- A list is empty when you cannot do that thing now, whether because it is not your turn, you cannot afford it, or you have no pieces left. An empty list hides the button (bible 4.2). During `main`, a hidden build button still shows its cost as a disabled tooltip.
- The client never computes legality. It only glows the ids in these lists.

## Arming

| Input | Result |
|---|---|
| Click Path, Outpost, or Stronghold | Arms that kind. The ids in `legal.<kind>` pulse in your color at 40%. Plays `ui_click`. |
| During `setupSettle` or `setupRoad` | Already armed with `outpost` or `path`, with no button click. |
| During `robber`, or after `play:knight` | Armed with `wayfarer`. Hexes in `legal.wayfarer` pulse. |
| Hover a glowing socket | The pulse brightens, and a ghost piece shows at 50%. |
| Click a glowing socket | Sends `{ "type": "place", "kind": "<kind>", "id": "<id>" }`, clears the glow, and waits for `state`. |
| Click a dark socket | Nothing is sent. Plays `ui_error` quietly. |
| Esc or right-click | Clears the glow in one frame, plays `ui_back`, and sends nothing. |
| Wayfarer hex click | If `legal.steal[hex]` has more than one id, show "Take from whom?" with their circles. Then send `{ "type": "rob", "hexId", "stealFrom" }`. |

The server answers with a new `state` (the piece shows up, with its sound and motion from bible 8) or with an `error` (show the message and do not show the piece). Never place a piece before the `state` arrives.

## Sockets

Vertex and edge sockets are the spawned actors from [hex-id-map.md](hex-id-map.md). A socket's tag is its server id. Hit-test radius is 30 UU for vertices and a 20 UU capsule for edges, and vertices win a tie.

## Test hooks (#47)

`server/table-prove.mjs` places one outpost and then checks that none of its neighbor vertices are in the next seat's `legal.outpost`, and that a click on a neighbor gets an `error`. The Unreal screenshot in #47 should show the same thing.
