# Startup loading screen mock (#1281)

Owner decision, 2026-11-06 (Desk Decisions card `q1281-loading`, A): looks right. Move the title to the 56 px wordmark too.

Owner note: on the final zoom in, the end view is a nice aerial view of the island, in the spirit of Peter Pan's approach to Neverland. The mock's last frame shows the title view and does not yet do this.

## What the mock shows

The game loads behind fog with a visible loading bar, a percent and a one-line status. When loading ends, one Start button appears. Tapping it pushes the camera through the clouds in 2.4 s, the same length as the invite page's reveal. The card then comes back as the title card. With reduced motion it is a cross-fade only.

The loading card sits where the title card sits, so nothing jumps when its contents change.

## How to view it

Open `index.html` in a browser. Drive the states with a query string:

- `?state=loading`
- `?state=ready`
- `?state=through&t=0.5` (t from 0 to 1)
- `?state=title`
- `&rm=1` for the reduced-motion variant

With no state, it runs a live demo.

## Rules for the build

- Same tokens as the #1274 audit: white on mist, ink text, one teal primary, 8 px grid, 44 px targets, no blur or translucent controls.
- Heavy files load during this screen, which keeps the first download small (see PR #1144).
- Show the owner pictures before merge. The end view of the push must read as an aerial view of the island.
