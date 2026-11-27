# #129 completion test, measured on main

- gate worked: research
- date: 2026-11-27
- agent: claude-opus-a (Claude Opus 5.5)
- refs: [#129](https://github.com/jarrodjohnson-gif/emberisle/issues/129)

#129 asked for a HUD design (`docs/design/hud.md` and mockups). Its parts shipped as separate issues (turn banner #240, win table #227, roll banner #203, trade panel #241, discard picker #255), as the 2026-10-02 note on the issue says. This page checks the issue's own completion test against today's game. It adds no layout and changes no code.

## What I measured

The four shots the completion test names, at 1280×720, made the same way `scripts/shots.mjs` makes them (practice versus three bots, the 7 and the win screen loaded as crafted states). In each shot a script ([`measure-shots.mjs`](hud-129-acceptance/measure-shots.mjs)) projected every hex centre and every corner through the live camera (`__isle.cam()`) and asked `document.elementFromPoint` what is on top there. A point counts as covered when the top element is not the board canvas. I also measured `[data-hud-stack]` (the bottom tray with the hand and the actions), looked for a visible Trade button, and opened the trade sheet once. The same run at 1920×1080 is in the table for comparison.

Main at `4530a5a`, SwiftShader Chromium, the default diorama view.

## Result

| Check from #129 | 1280×720 | 1920×1080 | Verdict |
|---|---|---|---|
| Every hex visible, no panel over it (`04-turn`, `05-trade`, `06-discard`) | 0 of 19 hexes covered | 0 of 19 | Pass |
| Every glowing corner visible (setup, `03-setup`) | 0 of 46 glowing corners covered | 0 of 50 | Pass |
| Every corner visible in play (`04`, `05`, `06`, `07-wayfarer`) | 0 of 54 covered | 0 of 54 | Pass |
| Hand, actions and dice in a bar no taller than about 15% of the height | 140 px in `main` (19.4%), 146 px in `discard` (20.3%), 54 px in setup (7.5%) | 140 px (13.0%), 146 px (13.5%) | **Fails at 1280×720**, passes at 1920×1080 |
| A Trade button, with player-to-player trade reachable | `Trade` shown and enabled in `main`; it opens the trade sheet with **Ask the table** | same | Pass |
| A final score table on the win screen (`08-win`) | "Ember wins" with one row per player and their points, plus dice this game | same | Pass |

Notes:

- The tray is 720 px wide and sits centred at the bottom. Its 140 px are two rows: the status line ("Your turn", numbers, the last roll) and the hand with Build, Trade and End turn. The first-game tip adds one more line above it (about 38 px) for the first three turns only.
- The dice are not drawn in the tray. The roll shows as the tray's event text ("Ember rolled 8!") and as the banner, so "dice in the bar" is met by text, not by dice faces.
- The open trade sheet and the win screen cover most of the board (19 of 19 hexes). Both are modal sheets you close to play on, so the test's "no panel over the board" does not read as covering them; I report it so nobody has to re-measure.

## Pictures

All at 1280×720, from this run:

- [`04-turn`](hud-129-acceptance/04-turn-1280x720.png)
- [`05-trade`](hud-129-acceptance/05-trade-1280x720.png), and the sheet that Trade opens: [`05b-trade-open`](hud-129-acceptance/05b-trade-open-1280x720.png)
- [`06-discard`](hud-129-acceptance/06-discard-1280x720.png): five goods tiles and "Discard 4: pick 4 more", the "N left" count #129 asked for
- [`08-win`](hud-129-acceptance/08-win-1280x720.png)

## What I am not sure about

- The ~15% bar height was written on 2026-09-27, before the tray and the phone layouts were designed. Later designs set the tray's rows on purpose. Whether 19% at 1280×720 is a defect or an outdated number is Jarrod's call, asked on #129.
- SwiftShader draws the same layout as a GPU, but I did not check a real desktop browser.

## Prove output

`node docs/research/hud-129-acceptance/measure-shots.mjs` (a copy of `scripts/shots.mjs` with a measuring step; not a proof and not registered). The script logs one JSON line per shot; these are those lines, reduced to their counts by a short Python filter:

```
03-setup 1280x720 phase=setupSettle hexCovered=0/19 vertexCovered=0/54 glowingCovered=0/46 stack=720x54@y654 trade=[]
04-turn 1280x720 phase=main hexCovered=0/19 vertexCovered=0/54 glowingCovered=0/0 stack=720x140@y568 trade=[{'text': 'Trade', 'disabled': False}]
05-trade 1280x720 phase=main hexCovered=0/19 vertexCovered=0/54 glowingCovered=0/0 stack=720x140@y568 trade=[{'text': 'Trade', 'disabled': False}]
06-discard 1280x720 phase=discard hexCovered=0/19 vertexCovered=0/54 glowingCovered=0/0 stack=720x146@y562 trade=[]
07-wayfarer 1280x720 phase=robber hexCovered=0/19 vertexCovered=0/54 glowingCovered=0/0 stack=720x140@y568 trade=[]
03-setup 1920x1080 phase=setupSettle hexCovered=0/19 vertexCovered=0/54 glowingCovered=0/50 stack=720x54@y1014 trade=[]
04-turn 1920x1080 phase=main hexCovered=0/19 vertexCovered=0/54 glowingCovered=0/0 stack=720x140@y928 trade=[{'text': 'Trade', 'disabled': False}]
05-trade 1920x1080 phase=main hexCovered=0/19 vertexCovered=0/54 glowingCovered=0/0 stack=720x140@y928 trade=[{'text': 'Trade', 'disabled': False}]
06-discard 1920x1080 phase=discard hexCovered=0/19 vertexCovered=0/54 glowingCovered=0/0 stack=720x146@y922 trade=[]
07-wayfarer 1920x1080 phase=robber hexCovered=0/19 vertexCovered=0/54 glowingCovered=0/0 stack=720x140@y928 trade=[]
05b-trade-open 1280x720 phase=main tradeOpen=True hexCovered=19/19 vertexCovered=54/54 stack=720x140
08-win 1280x720 phase=over tradeOpen=False hexCovered=19/19 vertexCovered=54/54 stack=720x174
05b-trade-open 1920x1080 phase=main tradeOpen=True hexCovered=19/19 vertexCovered=54/54 stack=720x140
08-win 1920x1080 phase=over tradeOpen=False hexCovered=19/19 vertexCovered=54/54 stack=720x174
18 shots in test-results/shots129
```

## Handoff

```
done: #129's completion test measured on main at 1280x720 and 1920x1080, with pictures
left: Jarrod's answer on #129: close it as superseded, or file a fix for the tray height at 1280x720
broke: nothing
next agent: follow his answer; nothing else in #129 is open
```
