# Lobby fix notes (issue #1103, PR #1133), measured on the merged head

All numbers are from a 2-human table (host plus one guest, two Empty seats with Add bot) unless stated. Fonts: Inter is the sandbox default; DejaVu Sans and Liberation Sans are forced with an `!important` font-family (and, for the proofs, with a fontconfig override) to stand in for the wider CI font.

## Empty and Add bot per size and font
"centre-off" is the distance between the vertical centre of the "Empty" text and the vertical centre of the Add bot button (proof tolerance 1 px).

| Font | Size | Measurement |
|---|---|---|
| Inter (default) | 320x568 | empty 47/47 centre-off 0.75 px; Add bot 52 px wide, 2 line(s); h-overflow 0 |
| Inter (default) | 375x667 | empty 47/47 centre-off 0.75 px; Add bot 65 px wide, 1 line(s); h-overflow 0 |
| Inter (default) | 390x640 | empty 47/47 centre-off 0.75 px; Add bot 65 px wide, 1 line(s); h-overflow 0 |
| Inter (default) | 390x844 | empty 47/47 centre-off 0.75 px; Add bot 65 px wide, 1 line(s); h-overflow 0 |
| Inter (default) | 844x390 | empty 47/47 centre-off 0.75 px; Add bot 63 px wide, 2 line(s); h-overflow 0 |
| Inter (default) | 1280x720 | empty 47/47 centre-off 0.75 px; Add bot 65 px wide, 1 line(s); h-overflow 0 |
| DejaVu Sans | 320x568 | empty 54/54 centre-off 0.25 px; Add bot 45 px wide, 2 line(s); h-overflow 0 |
| DejaVu Sans | 375x667 | empty 54/54 centre-off 0.25 px; Add bot 73 px wide, 2 line(s); h-overflow 0 |
| DejaVu Sans | 390x640 | empty 54/54 centre-off 0.25 px; Add bot 74 px wide, 1 line(s); h-overflow 0 |
| DejaVu Sans | 390x844 | empty 54/54 centre-off 0.25 px; Add bot 74 px wide, 1 line(s); h-overflow 0 |
| DejaVu Sans | 844x390 | empty 54/54 centre-off 0.25 px; Add bot 56 px wide, 2 line(s); h-overflow 0 |
| DejaVu Sans | 1280x720 | empty 54/54 centre-off 0.25 px; Add bot 74 px wide, 1 line(s); h-overflow 0 |
| Liberation Sans | 320x568 | empty 46/46 centre-off 0.75 px; Add bot 53 px wide, 2 line(s); h-overflow 0 |
| Liberation Sans | 375x667 | empty 46/46 centre-off 0.75 px; Add bot 65 px wide, 1 line(s); h-overflow 0 |
| Liberation Sans | 390x640 | empty 46/46 centre-off 0.75 px; Add bot 65 px wide, 1 line(s); h-overflow 0 |
| Liberation Sans | 390x844 | empty 46/46 centre-off 0.75 px; Add bot 65 px wide, 1 line(s); h-overflow 0 |
| Liberation Sans | 844x390 | empty 46/46 centre-off 0.75 px; Add bot 64 px wide, 2 line(s); h-overflow 0 |
| Liberation Sans | 1280x720 | empty 46/46 centre-off 0.75 px; Add bot 65 px wide, 1 line(s); h-overflow 0 |

Add bot stays on one line at 375, 390 and 1280 wide with Inter and Liberation Sans, and wraps to two lines at 320x568 and 844x390 (and at 375 wide with DejaVu Sans). This is a stated taste call: "Empty" never truncates, so the button gives way. Horizontal overflow is 0 everywhere.

## Proof lines replaced in this PR (DECISIONS 2026-10-25)
| File and line | Old | New | Why |
|---|---|---|---|
| scripts/chat-prove.mjs:490 | footer bottom gap 8 px, "approved 8 px bottom padding" | gap 12 px, "approved 12 px bottom padding" | phone card padding is 12 px (amends the row approved in #1116) |
| scripts/lobby-layout-prove.mjs:114 (file new in #1116) | "Start" in the controls that must exist before everyone is ready | "Start" removed from that list; new assertion: host sees no Start until everyone is ready (count 0) | Start is hidden until `canStart` |
| scripts/lobby-layout-prove.mjs:157 | click Start | wait for Start, run `geometry()` so its size and gap are checked, then click | Start only exists once everyone is ready |
| scripts/lobby-layout-prove.mjs `centred()` (added in this PR) | every seat name shares one vertical position; name centred on its dot, for all seats | same two assertions, for seats that have a status line | empty seats centre "Empty" on the Add bot button by design |

`loosen-prove -- --base origin/main` on the merged head flags only two chat-prove lines (the phone card size line and the sticky-row line, replaced and approved in #1116).

## Assertions added (additions only)
bubble clear of the seat status (390x844, 844x390, 1280x720, 375x667, 390x640, 320x568); rename button receives taps at its centre and 8 px above its bottom; label centring, 8 px text inset, seat name alignment, emoji row, code, footer and input centring (390x844, 844x390, 1280x720, 375x667); "Empty" not truncated next to Add bot and "Empty" centred on Add bot (390x844, 375x667, 390x640, 320x568, plus 844x390 and 1280x720 in the main loop); `geometry()` at 375x667, 390x640, 320x568.

## 320x568 overflow (CI failure) cause
The Invite button in `.lobby-copy-controls` was `shrink-0`; with a wider fallback font (DejaVu Sans) the header was 299 px in a 270 px box (21 px overflow). The copy buttons may now shrink and wrap, the code may shrink.

## Screenshots (this folder)
- 4 seats: fix-390x844-calm.png, fix-390x844-bubbles.png, fix-844x390-calm.png, fix-844x390-bubbles.png, fix-1280x720-calm.png, fix-1280x720-bubbles.png (fix-metrics.json)
- 2 humans with Empty and Add bot: two-390x844-calm.png, two-390x844-bubbles.png, two-844x390-calm.png, two-844x390-bubbles.png, two-1280x720-calm.png, two-1280x720-bubbles.png (two-metrics.json)
