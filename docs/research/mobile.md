# Research: what real mobile support needs (issue #169)

- step: 1 Research
- date: 2026-09-28
- agent: Grok

Jarrod reversed the 2026-09-27 "not doing mobile right now" call after a live host+join
playtest across a PC and a phone. The game already ran. This note scopes what to fix,
and in what order. It is not a from-scratch rebuild.

## What I read

`src/lib/scene/isle-renderer.ts` constructor, `resize`, `onDown`/`onUp`, `buildMarks`;
`src/components/scene/IslandCanvas.tsx`; `src/components/game/Hud.tsx`;
`src/components/game/EmberisleApp.tsx` (`Title`, `Lobby`); `index.html` viewport;
`docs/research/camera-toggle.md` (#147); `docs/research/visual-polish.md` §1 and §7;
`docs/design/chat.md` (#119); `docs/design/title-lobby.md` (#136);
issues #129, #135, #128, #119, #136, and the 2026-09-28 playtest comment on #129.

## What is true

### The playtest already works as a web page

`index.html` has `width=device-width, initial-scale=1.0, viewport-fit=cover`.
The shell is `h-dvh` with `safe-area-inset-*` on the title card and the HUD bars.
Picking uses Pointer Events, not mouse-only `click`. `canvas.style.touchAction = "none"`
stops the browser stealing the first finger for scroll. That is why host+join "mostly
worked" on a phone: it is a same-origin web client, not a separate app.

The gaps below are why it does not yet feel like a table you can play with a thumb.

### 1. Camera: zoom-out is a fixed 10–18 world units

`IsleRenderer` builds one `THREE.PerspectiveCamera(32, …)` at `(6.6, 9.1, 7.4)` and one
`OrbitControls` on the canvas:

- `minDistance = 10`, `maxDistance = 18`
- `minPolarAngle = 0.7`, `maxPolarAngle = 1.02` (about 40°–58° from vertical)
- `resize` only writes `camera.aspect` and the composer size. Distance does not scale
  with viewport or aspect.

`docs/research/visual-polish.md` §7 already recorded the same bug on desktop: at a
fixed 32° FOV the bottom hex row falls off at both 1280×720 and 1920×1080. A phone
makes it worse. Portrait aspect is ~0.46; the vertical field of view stays 32°, so
the island is a small diamond in the middle with HUD chrome eating the rest.
Landscape is closer to the desktop 16:9 shots, but `maxDistance = 18` is still the
ceiling — you cannot pinch further out.

`#128` already decided v1 default is an overhead / orthographic camera on this same
scene, with the current tilted OrbitControls behind a toggle. `#135` owns
`docs/design/camera-light.md` and the "fit the island into the HUD hole at any window
size" rule. `#147` mapped the rig.

**Direction (not the pixel spec):** do not add a third camera system. Teach the
existing fit function about viewport size and aspect.

- Overhead mode (`#135`): size the ortho frustum so all 19 hexes and 9 docks stay
  inside the rectangle the HUD leaves, on a phone portrait (~390×844), a phone
  landscape (~844×390), and the two desktop sizes `#135` already names.
- Free / tilted mode: keep `minDistance = 10` (close-up of one hex is useful) but
  raise `maxDistance` from a viewport rule, not a constant. A starting rule that
  matches the playtest complaint: `maxDistance = max(18, 14 / min(aspect, 1))`, so a
  390×844 phone can pull back to ~30. Design picks the exact curve with screenshots.
- Pinch-zoom (`touches: 2` on OrbitControls) stays; one-finger orbit stays in Free
  mode only. Overhead mode does not orbit.
- Title/lobby can keep today's auto-rotating three-quarter view — the island is a
  backdrop there, not a board you place on.

This is an **addendum to `#135`**, not a redo. `#135` is still the desktop framing,
toggle, lighting, and draw-call budget. Mobile is one more input to the same fit
function. File the addendum as its own Design child so `#135` does not become Size M.

### 2. Orientation: do not lock, do recommend landscape

Nothing in the client locks orientation. The page renders in whatever way the phone
is held. That is the right default for a web page (Safari will not honor
`screen.orientation.lock` outside fullscreen; a hard lock also fights "I set the
phone on the table in portrait").

Physical hex-settler ports (Colonist, Catan Universe, Board Game Arena) treat
**landscape as the play orientation**. A 19-hex island plus a hand bar is a wide
thing. Portrait can work for Title and Lobby; it is a squeeze for Play.

**Direction:**

- Do not call `screen.orientation.lock`.
- On Play, if `matchMedia("(orientation: portrait) and (pointer: coarse)")` matches,
  show a one-line dismissible hint: "Turn the phone sideways to see the whole isle."
  Do not block input behind it.
- Title and Lobby stay usable in both orientations (see §4).
- Every layout rule below is written for both, because people will rotate anyway.

### 3. Touch placement is unreliable, and there is no confirm

Picking is `pointerdown` stores `(x, y)`, `pointerup` fires the raycast only if
`Math.hypot(dx, dy) ≤ 8`. Legal marks are the only extra pickables:

| Kind | Visual / hit mesh | World size |
|---|---|---|
| vertex | `TorusGeometry(0.13, 0.025)` | ring radius 0.13, tube 0.025 (`HEX_SIZE` is 1.12) |
| edge | `BoxGeometry(0.16, 0.07, length·0.72)` | 0.16 wide |
| hex | `hexCap(HEX_SIZE * 0.9)` | almost the tile — fine |

Three separate reasons a thumb tap misses:

1. **8 px slop vs OrbitControls.** The same canvas owns rotate-on-one-finger. A
   sitting-on-the-couch tap routinely moves more than 8 CSS pixels before `pointerup`.
   The handler then returns and the place never happens. This is the most likely
   cause of the playtest "tap on a highlighted corner doesn't always register."
2. **The vertex hit mesh is a thin torus.** Tube 0.025 world units is a few
   on-screen pixels once you have zoomed out to see the island. Edges are better
   (a box) but still narrow. Hexs are not the problem.
3. **No confirm.** Desktop does not need one — a mouse click is a point. A fat
   finger on a glowing corner that sits next to two other glowing corners will
   sometimes hit the neighbour. Committing on first `pointerup` is what makes that
   feel like the game cheated.

`pointerdown`/`pointerup` themselves are the right events. Do not switch back to
`click` (300 ms delay on some mobile browsers) and do not add a `touchstart`
path next to the pointer path.

**Direction:**

- On `pointerType === "touch"` (or `matchMedia("(pointer: coarse)")`), raise the
  drag slop to ~24 CSS pixels so a tap is not also an orbit.
- Give every legal vertex an invisible pick sphere of radius ~0.28, keeping the
  thin torus as the visual. Edges get a thicker invisible box. Visuals stay the
  same so desktop shots do not change.
- **Tap-then-confirm on coarse pointers only.** First tap on a legal mark selects
  it (pulse the mark, show a 44 px "Place" chip above the bottom HUD or next to
  the thumb). Second tap on the same mark, or the chip, sends `place`. Tap empty
  space or another mark to change the selection. Esc / a Cancel chip clears it.
  Desktop stays one click, no chip.
- While a mark is selected, one-finger orbit is off so the confirm tap cannot
  become a drag. Pinch-zoom stays.
- Do not invent a long-press. Long-press fights OrbitControls and is slower than
  tap-then-confirm.

This is new work in `isle-renderer.ts` + a thin HUD chip. `#135` owns camera fit;
this node owns the pick slop, the hit volumes, and the confirm step. They land in
the same Design child because they edit the same file and must be tested together.

### 4. No visible turn indicator — already a HUD bug, worse on a phone

`Hud.tsx` today:

- Phase sentence at the bottom: "Place an outpost on a highlighted corner."
- `"Turn {n}"` is `hidden … sm:inline` inside the wordmark chip — gone on a phone.
- The player rail (`aside`, accent border on `state.current`) is
  `hidden … md:flex`. Below the `md` breakpoint **the list of seats is not
  rendered at all.** That is the playtest line "no way to know when its your turn."
- `mine` already exists (`state.current === actor`). It only gates the action row.

So the missing turn signal is not a mobile-only invention. `#129` (HUD design, still
Backlog) already owns "the phase sentence, the turn owner." Its 2026-09-28 comment
says to make current-turn state unmissable on desktop too, and to coordinate with
this note rather than solve it twice.

**Direction:** solve whose-turn once, in `#129`, with a mobile constraint:

- An always-visible banner, not only a rail accent: whose turn, and a distinct
  state when it becomes *your* turn (color + short copy, e.g. "Your turn — place
  an outpost"). Motion optional; do not flash every frame.
- The player list cannot be `hidden` below `md`. On a coarse / narrow viewport it
  becomes a top or bottom strip of color dots + names, with the current seat
  marked. `#119`'s avatar menu then anchors to those dots the same way it anchors
  to the desktop rail.
- Leave the desktop rail layout to `#129`. This note only forbids hiding it.

Do not file a second "turn indicator" Implementation. Fold the constraint into
`#129`'s spec (addendum) so one PR draws it.

### What already-written specs need

| Spec | Desktop-only line | Verdict |
|---|---|---|
| `#119` / `docs/design/chat.md` | "Target: desktop PC… Phone layouts are out of scope." | **Addendum, not a redo.** Host messages, validation, `table.ts`, and the B-log-in-the-corner idea stay. What changes: on a coarse / narrow viewport the 288 px top-right dock becomes a bottom sheet above the hand bar (same contents: log, presets, input, emote tray), and the player menu anchors to the compact seat strip in §4. File the addendum inside the HUD/menus Design child, then patch `chat.md` there. |
| `#136` / `docs/design/title-lobby.md` | "Target: desktop, 1280×720 and up. Phone layouts are out of scope." | **Addendum, not a redo.** Bottom-left `max-w-sm` glass card is correct on desktop. On a phone portrait that card covers most of the island. Phone rule: the card goes full-width, max ~55% of height, and scrolls; Host / Join stay the weighted actions. Landscape can keep the desktop card. `#167` (desktop implementation, now Todo) should ship the desktop spec unchanged — do not block it on this addendum. |
| `#129` / HUD (no spec file yet) | Desktop mockups at 1280 and 1920 | **Addendum as it is written.** Turn banner + visible seat strip on narrow viewports are required, not optional. Trade panel and discard picker must be thumb-reachable (44 px targets). |
| `#135` / camera-light (no spec file yet) | Desktop framing + toggle + budget | **Addendum as it is written.** Fit function takes viewport size and aspect; Free-mode `maxDistance` is not the constant 18. Lighting and draw-call budget stay desktop-first (`needs: jarrod` for frame time). |
| `#147` camera-toggle research | Desktop-only mapping | Still true. No rewrite. |

Host / rules / `table.ts` do not change for mobile. A phone is another client of the
same socket.

## What I am not sure about

- Exact `maxDistance` curve. The `14 / min(aspect, 1)` sketch is a starting point
  for `#171` to replace with screenshots at 390×844 and 844×390.
- Whether overhead-default (`#128`) plus a higher maxDistance already fixes "I
  cannot see the board" without the confirm chip. Build both; the slop and hit
  volumes are cheap and the confirm chip is what stops a neighbour-corner mis-tap.
- PWA / "Add to Home Screen" and `display-mode: standalone`. Out of scope for v1.
  The page already has `viewport-fit=cover`. A manifest is a later XS if Jarrod
  wants an icon on the phone.
- Performance on a phone GPU with SSAO + 2048² shadows. `#135`'s budget should
  name a "titleMode-like" cheap path for `pointer: coarse` (SSAO off, as title
  already does). Not measured here.

## Prove output

(research gate — no command)

## Children filed

- **#171 Design the mobile camera fit and touch-to-place flow.** Addendum to `#135`
  plus the pick slop, hit volumes, and tap-then-confirm. Size S. Backlog.
- **#172 Design the phone HUD, turn banner, and title/lobby addenda.** Constraints
  for `#129` / `#119` / `#136`: whose-turn banner, visible seat strip below `md`,
  chat as a bottom sheet, title/lobby card on a narrow viewport. Size S. Backlog.

No Implementation children yet. Those wait on the two designs (FRAMEWORK §2 just-in-time).

## Handoff

```
done: scoped camera, orientation, touch-place, and turn-indicator from the live client; filed #171 and #172
left: Design #171 and #172 (Backlog). #167 (desktop title/lobby) and #160 (desktop chat dock) stay on the desktop specs and do not wait on these.
broke: nothing
next agent: either #171 or #172, or the already-Todo desktop leaves #167 / #160 / #169's siblings. Do not start mobile implementation until the matching design exists.
```
