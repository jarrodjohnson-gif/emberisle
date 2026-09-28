# Phone HUD, turn banner, and title/lobby addenda (issue #172)

Sources: [docs/research/mobile.md](../research/mobile.md) §2 and §4, [docs/design/mobile-camera-touch.md](mobile-camera-touch.md)
(#171 inset contract), [docs/design/chat.md](chat.md) (#119), [docs/design/title-lobby.md](title-lobby.md) (#136),
`src/components/game/Hud.tsx`, `src/components/game/EmberisleApp.tsx`.

This is not a second HUD. #129 still writes the desktop rail, trade panel, and discard picker. This file
adds the constraints those specs must keep when the viewport is coarse or narrow, and writes the short
addenda into `chat.md` and `title-lobby.md` so "phone layouts are out of scope" is no longer the last word.

`#167` ships the desktop title/lobby card unchanged. `#160` ships the desktop 288 px dock unchanged. Phone
chrome is its own Implementation after this lands.

## Breakpoint

Use the same test everywhere:

```ts
const phone = matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
const portrait = window.innerHeight > window.innerWidth;
```

Do not invent a third Tailwind screen. Existing `sm:` / `md:` stay for desktop density. Phone rules key off
`phone` so a narrow desktop window still gets the rail (a player may dock the window), while a phone in
landscape still gets the compact strip.

## Whose-turn banner (one design, both viewports)

Today:

- Phase sentence lives in the bottom bar.
- `"Turn {n}"` is `hidden sm:inline` inside the wordmark — gone on a phone.
- The seat rail is `hidden md:flex` — **no seat list on a phone**.
- `mine` (`state.current === actor`) only gates the action row.

Required, desktop and phone:

| State | Banner copy | Color |
|---|---|---|
| Someone else's turn | `{Name}'s turn — {phase}` | that seat's color as a 4 px left border on the glass chip |
| Your turn | `Your turn — {phase}` | accent fill on the chip (`bg-accent/20`, border-accent), not a per-frame flash |
| Discard / robber on you | `Your turn — discard N` / `Your turn — move the wayfarer` | same accent |

Phase strings reuse `phaseCopy` in `Hud.tsx`. The banner is always visible — it is not `hidden` below any
breakpoint. On desktop it can sit in the top-left next to the wordmark or replace the current bottom phase
pill; #129 picks the desktop seat. On phone it is the first row of the bottom stack (portrait) or the left
chunk of the bottom strip (landscape).

Motion: a 200 ms opacity fade when `state.current` changes. No pulse loop.

## Seat strip (phone)

The `aside` rail stays `hidden md:flex` for desktop. On `phone` render a horizontal strip instead:

- One cell per seat: 12 px color dot, truncated name, VP. Current seat gets the accent border.
- Height 44 px (thumb target). Portrait: top edge, under the wordmark, full width with 12 px side inset.
- Landscape: top-right, after Leave, so it does not eat the short hole height.
- `#119`'s avatar / action menu anchors to the tapped cell the same way it anchors to a desktop rail card.
  The menu opens downward from a top strip, upward from a bottom strip.

`#129` does not get to hide this strip. That is the whole point of the playtest line.

## Chat on phone: bottom sheet, not the 288 px dock

Desktop dock from #119 stays. On `phone` during Play:

- Minimized: 44 px button, bottom-right, above the hand bar (portrait) or above the landscape strip. Unread
  badge unchanged.
- Open: a sheet `inset-x-0`, height `min(48vh, 320px)`, sitting on top of the hand bar, same contents as
  option B (log, presets, input, emote tray). Esc / a grab handle / tap outside (the board) closes it.
- The sheet is `pointer-events-auto`. While it is open, board picks are ignored (`IslandCanvas` checks
  `chatOpen`).
- Player menu still anchors to the seat strip, not to the sheet.

Lobby on phone: the chat box stays inside the title/lobby card (see below), not a second sheet.

## Title and Lobby on a phone portrait

Desktop card from #136 stays bottom-left `max-w-sm`. On `phone && portrait`:

```tsx
<div className="absolute inset-x-3 bottom-3 top-auto z-10 max-h-[55vh] overflow-y-auto rounded-[20px] border border-white/50 bg-white/45 p-5 backdrop-blur-md">
```

- Full width minus 12 px. Max 55% of the viewport height. Scrolls if Lobby + chat overflow.
- Host / Join stay the weighted actions. Practice / Hotseat stay secondary.
- Landscape (`phone && !portrait`) may keep the desktop `max-w-sm` bottom-left card — the island still has
  a wide hole.

`#167` does not implement this. It ships the desktop card. A later Implementation child of this issue
adds the `phone` class branch.

## Orientation hint

Do not call `screen.orientation.lock`.

On Play, when `phone && portrait`, show a one-line dismissible hint above the banner:

> Turn the phone sideways to see the whole isle.

- `pointer-events-auto` only on the dismiss ×. The board stays live under it.
- Remember dismiss in `sessionStorage["emberisle-landscape-hint"]` so rotate-and-back does not nag.
- Title and Lobby never show it.

## Thumb targets

Anything a coarse pointer must hit is at least 44 CSS px on both axes: Place chip (#171), seat cell, chat
button, Host/Join, Ready/Start, trade confirm, discard ±. `#129`'s trade panel and discard picker pick up
the same 44 px rule when they are written.

## Inset contract with #171

`docs/design/mobile-camera-touch.md` `hudInsets` is the camera's view of this chrome. If this Implementation
grows the seat strip or the sheet, it updates those numbers in the same PR:

| | top | right | bottom | left |
|---|---|---|---|---|
| phone portrait | 72 (wordmark) + 44 (seats) → **116** once the strip ships | 12 | 196 | 12 |
| phone landscape | 56 | 12 | 96 | 12 |

Until that PR, Implementation of #171 uses the numbers already in that file (portrait top 72, no strip yet).
Order: #171's camera can land first; this issue's Implementation then bumps `hudInsets.top` to 116.

## Files

- New: `docs/design/mobile-hud.md` (this file).
- Patch: `docs/design/chat.md` Target line + a "Phone addendum" section + out-of-scope list.
- Patch: `docs/design/title-lobby.md` Target line + a "Phone addendum" section + out-of-scope list.

No code in this PR.

## Implementation children (file after this lands)

- **Implement the phone seat strip, turn banner, and landscape hint** in `Hud.tsx`. Depends on this design
  and coordinates with #129 (fold in, do not wait). Size S.
- **Implement the phone chat sheet and title/lobby card branch** in `Chat.tsx` / `EmberisleApp.tsx`.
  Depends on #160 / #167 so the desktop pieces exist to branch from. Size S.

## Handoff

```
done: banner, seat strip, chat sheet, title/lobby 55vh card, no orientation.lock, inset bump noted
left: two Implementation leaves. #167 and #160 stay on the desktop specs.
broke: nothing
```
