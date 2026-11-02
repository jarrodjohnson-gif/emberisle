# Approved B mock comparison

Codex-p. This is a visual audit, not a new design or implementation.

Compared source: PR #883 at `441ad0314a352159e3c2a61d64d1f3b63e0ab427`.
Approved reference: `docs/design/trade-window-b/` at main `df5777beba6aa4b28be6741ff4822496c20f6833`.
The desk supplied these pictures in #1183 and directed this comparison in comment `6436738678`.
I opened both reference JPEGs, current portrait initial/affordable/disabled pictures, landscape initial/affordable pictures, and hotseat affordable portrait.

The reference contains historical A screenshots beside B. Current #883 already removed A's tabs.
That structural change alone does not match the approved B picture.

| Area | Approved B picture | Current #883 pictures |
| --- | --- | --- |
| Overall structure | One window; two goods rows; compact Bank box; Table offer below | One window and shared rows, but Table and Bank occupy parallel footer columns |
| Portrait Bank position | Full-width box between goods and Table offer | Right footer column beside Table offer |
| Portrait Bank shape | Short horizontal box; text left, small action right | Tall vertical card; full-width action below text |
| Landscape footer | Small Bank box left; Table summary and large dark action right | Table summary/action left; Bank box/action right |
| Bank heading | `Bank & docks · your best rate 4:1` | `Bank & docks · one exchange` |
| Bank quote | `Bank 4:1: give 4 wood, get 1 brick now.` | `You give 4 wood. You get 1 stone.` for the captured selection |
| Bank extra information | No separate stock line in the mock | Separate `Bank stock: 11 stone.` line |
| Bank action | Small outlined `Bank 4:1` button | Wide secondary `Bank 4:1` button |
| Table action | Full-width dark action below the portrait summary | Dark action limited to the left footer column |
| Help text | `Tap a good to add it. Mix goods for the table; one good each way for the bank.` | Table-only hint; hotseat instead has its own Bank-only instructions |
| Title | Compact bold `Trade` | Larger, regular-weight `Trade` |
| Portrait placement | Window starts lower; short title/help section; bottom aligned | Selected-state window starts higher and has a larger title/help region |
| Card colours | Distinct resource colours in the icons and names | Mostly one dark teal; unavailable controls turn grey |
| Card borders | Light neutral outlines; selected cards have darker outlines | Stronger outlines on all cards; selected cards use a pale fill |
| Card contents | Icon/name, `Have N`, count, plus; selected cards also show minus | Same basic content, but larger monochrome symbols and different vertical spacing |
| Selected controls | Minus occupies the lower portion without a prominent full-width divider | A visible horizontal divider separates each minus control |
| Card geometry | Portrait cards are narrower; landscape cards are short enough to show both rows | Cards are wider/taller; landscape scrolling clips one row when the other is selected |
| Landscape visibility | Both rows and bottom actions are visible together | Initial Get row is partly clipped; selecting Get clips the Give row |
| Seat row | Small plain chips with name and points only | Larger cards with colour/current-seat rings, path/army details, hidden-fortunes hint, and menu |
| Backdrop | Flat pale blue mock background | Actual island renderer and existing HUD remain behind the dialog |
| Selection example | One Wood given, one Brick requested | Affordable capture gives one Wood and requests one Stone; its Bank quote gives four Wood |
| Dimming | Give Brick and Sheep, and Get Wood, appear dimmed in the example | Runtime dims unavailable additions and opposite-side conflicts; exact mock semantics are unspecified |
| Empty/disabled states | Not supplied | Current pictures include empty and unaffordable Bank states; these cannot establish mock agreement |
| Hotseat | No hotseat-specific mock supplied | Table offer is absent; a full-width Bank card remains |
| Desktop | No 1280×720 B mock supplied | Existing desktop pictures are implementation evidence, not an approved desktop spec |

Different names, seat order, fixture counts and goods are capture data, not layout requirements.
The README calls the mock icons and type stand-ins; exact artwork and typography remain subject to owner acceptance.
The mock does not specify focus handling, keyboard behaviour, screen-reader output, animation, or network failure states.
Existing accessibility checks remain requirements; this audit does not retire any assertion.

## Unsettled requirements

The reference explicitly requires asking Jarrod about dimming before implementation.
Recommendation: dim only unavailable additions or opposite-side conflicts; keep valid table goods available regardless of Bank affordability.
The pictured Brick has `Have 2` but appears dimmed with Wood selected; the reference does not explain why.
The current no-tabs layout, code review and green CI do not resolve this question or the owner hold.
The desk must also settle desktop/hotseat layout and whether the simplified seat chips belong to this change.
No runtime, proof, registration, dependency, lockfile or budget changed for this audit.
No browser proof ran; this note records direct image inspection only.
