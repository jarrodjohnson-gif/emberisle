# #1418: one button type and one ink focus colour

Owner decision on #1298: option A for the type (15 px / 22 px / 600 on every Button) and option A for the focus colour (ink `#263d3c` everywhere). Design: [`docs/design/button-audit`](../../design/button-audit/README.md).

These are real-game pictures in Chromium at device scale 1, written by `scripts/button-system-prove.mjs --pictures`.
"Before" is `main` at `a3dde1fd`; "after" is this branch. The same script took both, so each pair shows the same crafted state.
The lobby is not pictured because its buttons are unchanged: `lobby.css` already sets 15 px / 600 there.

| Size | Title | Table | Offer | Trade | Fortunes | Menu | Results |
|---|---|---|---|---|---|---|---|
| 430x932 | [before](before/430x932-title.jpg) · [after](after/430x932-title.jpg) | [before](before/430x932-table.jpg) · [after](after/430x932-table.jpg) | [before](before/430x932-offer.jpg) · [after](after/430x932-offer.jpg) | [before](before/430x932-trade.jpg) · [after](after/430x932-trade.jpg) | [before](before/430x932-fortunes.jpg) · [after](after/430x932-fortunes.jpg) | [before](before/430x932-menu.jpg) · [after](after/430x932-menu.jpg) | [before](before/430x932-results.jpg) · [after](after/430x932-results.jpg) |
| 390x844 | [before](before/390x844-title.jpg) · [after](after/390x844-title.jpg) | [before](before/390x844-table.jpg) · [after](after/390x844-table.jpg) | [before](before/390x844-offer.jpg) · [after](after/390x844-offer.jpg) | [before](before/390x844-trade.jpg) · [after](after/390x844-trade.jpg) | [before](before/390x844-fortunes.jpg) · [after](after/390x844-fortunes.jpg) | [before](before/390x844-menu.jpg) · [after](after/390x844-menu.jpg) | [before](before/390x844-results.jpg) · [after](after/390x844-results.jpg) |
| 375x812 | [before](before/375x812-title.jpg) · [after](after/375x812-title.jpg) | [before](before/375x812-table.jpg) · [after](after/375x812-table.jpg) | [before](before/375x812-offer.jpg) · [after](after/375x812-offer.jpg) | [before](before/375x812-trade.jpg) · [after](after/375x812-trade.jpg) | [before](before/375x812-fortunes.jpg) · [after](after/375x812-fortunes.jpg) | [before](before/375x812-menu.jpg) · [after](after/375x812-menu.jpg) | [before](before/375x812-results.jpg) · [after](after/375x812-results.jpg) |
| 820x1180 | [before](before/820x1180-title.jpg) · [after](after/820x1180-title.jpg) | [before](before/820x1180-table.jpg) · [after](after/820x1180-table.jpg) | [before](before/820x1180-offer.jpg) · [after](after/820x1180-offer.jpg) | [before](before/820x1180-trade.jpg) · [after](after/820x1180-trade.jpg) | [before](before/820x1180-fortunes.jpg) · [after](after/820x1180-fortunes.jpg) | [before](before/820x1180-menu.jpg) · [after](after/820x1180-menu.jpg) | [before](before/820x1180-results.jpg) · [after](after/820x1180-results.jpg) |
| 844x390 | [before](before/844x390-title.jpg) · [after](after/844x390-title.jpg) | [before](before/844x390-table.jpg) · [after](after/844x390-table.jpg) | [before](before/844x390-offer.jpg) · [after](after/844x390-offer.jpg) | [before](before/844x390-trade.jpg) · [after](after/844x390-trade.jpg) | [before](before/844x390-fortunes.jpg) · [after](after/844x390-fortunes.jpg) | [before](before/844x390-menu.jpg) · [after](after/844x390-menu.jpg) | [before](before/844x390-results.jpg) · [after](after/844x390-results.jpg) |

What to look at:

- **Title:** on `main`, "Host a table" wraps onto two lines at 390x844, 375x812 and 844x390, and at 1280x720 too. After this change, Host and Join sit on one line at every size. Join is a little narrower, with 12 px side padding instead of 20 px.
- **Everywhere else:** button labels are 15 px / 600, up from 14 px / 500, and the large buttons drop from 16 px / 500. No fill changes.

To reproduce, run `node scripts/button-system-prove.mjs --pictures <dir>` from the repo root, one browser at a time.
