# Astra brief for #903: finish it (owner rescope, 2026-10-24)

Paste this to Astra as is. Astra works locally and does not post to GitHub. Jarrod pastes your result back.

## The goal, in one sentence

Deliver **one bundle of mocks, then stop**: for each of four screens, a **Mock 1: current, improved** and a **Mock 2: fresh take**, so Jarrod can pick per screen, mix, and hand the winner to builders.

No new audit, no new map, no checkpoints 0 to 2. They are done (inputs below). Do not go down research paths. If you hit a gap, make the best call, mark it `ASSUMPTION` in the doc, and keep going.

## What to make

Screens: **title, lobby, table (with the dock), results.**
Sizes: **390x844, 844x390, 1280x720** for every mock.

- **Mock 1, current improved.** Start from the real current screen. Apply the fixes below and Apple's lessons. Keep what works. Cards stay the centred hero on the table.
- **Mock 2, fresh take.** Reinvent freely within the laws and the hard constraints. Your option frames (opt01 to opt03) are fine as a starting point; pick the best one per screen and refine it. Do not make three options.
- Mock = a real rendered screenshot or HTML page at the exact size, not a sketch. One hosted gallery page (link it, do not commit big image sets). Current screenshot beside each mock, same size, labelled "current / improved / fresh".
- Plus one short doc, `docs/design/app-review/3-directions.md`: per screen, what changed and why in 3 lines, what it costs a builder (files, size), and your recommended pick.
- Time box: 3 hours. At the box, post what you have and stop.

## Owner's votes (verbatim, 2026-10-23). These beat your taste.

- **Standing rule for you:** "always one really good mock ... open for current, current redesign, and brand new fresh take, so Astra can always create with old and new." Stop wasting tokens on designs we don't want.
- **Dock problem:** yes, it jumps. **Fix:** build it, with changes: "accepting a trade or doing a move is not in the bottom third of the screen, so you have to move your hand; the map is super small; cards should be the highest bar in the bottom third, so you keep the rising/green animations; a stationary box that always shows the row, even shows the animation when it isn't your turn; everything just stays put and we change the screen as needed based on actions; at least it's not so jumpy. We are overengineering for a vertical mode."
- **Table:** "our table looks really good, but a bit clunky in some areas. Take THAT Astra style (players) and make it a more detailed view on the left side: cleanup of the current UI applying Astra's lessons. Ours has the cards centred as the hero, which is nice."
- **Lobby:** "ours is best because we have more options (chat, reactions, ready), but the simplified version of options 1 and 2 is nice, so change menus and refine so things are easier. Theme: refine current vs reinvent the wheel." Verdict: mix.
- **Title:** "looks good, but I have no idea what practice, online, hotseat mean and why it is nested as a setting. Option 3 is best for landscape; our current landscape is weird: the box covers about 45% of the screen but shows 20% of the top and 20% of a side. Desktop on ours looks best; we need minimal changes for menus." Verdict: mix.
- **Results:** "I like ours, it is more detailed; take UX inspiration if needed. It clearly says who wins; the win order of current standings should show too." Keep the table and columns; drop the repeated target-points sentence.
- **Do these small changes:** fortunes button (one fixed spot, one label), seat (tallies as agreed), lobby.

## Inputs (read these, do not redo them)

- Design laws v1, Apple notes, builder and reviewer checklists, open questions: `docs/design/app-review/laws/design-laws.md`, `apple-notes.md`, `open-questions.md` in this repo. The laws are a **draft** until Jarrod votes. Follow them, and mark any mock choice that depends on an unvoted law with its number.
- Current captures at all three sizes (title, lobby, table, results) and the dice jump measurements: `scratchpad/current/` (cur-*.png, dice-measure.json). The dock jumps 170 px portrait / 198 px landscape; the dock fix v2 mock is on the review page.
- Your earlier 36 frames: `scratchpad/current/gal/` (opt01 to opt03).
- Repo: `docs/DECISIONS.md` (read first; owner decisions beat everything), `docs/design/polish.md` (north star Offsuit x Catan, island is the hero), `docs/design/ux-review-2026-10.md`, `docs/design/jelly-ocean.md`, the audit in `docs/design/hud-pass/v2/` (69 measured views).

## Hard constraints (do not break; if a mock must, name the conflict)

- Goods V1 (#773), Chat C (#899), game rules, scoring privacy (public score vs private total), inspectable unavailable builds, board fit.
- One stationary dock box; fixed slots; nothing appears or disappears; actions in the bottom third (laws 1, 2, 5). Island never below its share (law 3: 60% portrait is a proposal; show the real number in each mock).
- No cream in chrome, no dark theme, no emoji outside reactions, no uppercase labels, 44 px targets, five type sizes.
- Practice, hosting and joining never depend on anything new. Mini-games or a hub (#1067) are out of scope.
- No runtime code. Builders get issues only after Jarrod picks.

## Definition of done

1. Gallery link: 4 screens x 3 sizes x (current, improved, fresh).
2. `3-directions.md` with the recommended pick per screen.
3. A list of 8 or fewer phased build issues the desk can file (title, files, sizes, acceptance check), ordered: dock fix first.
4. Stop. Do not start anything else.
