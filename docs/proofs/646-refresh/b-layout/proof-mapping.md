# Owner B proof replacement

Owner decision: #873 comment 6425583272. This proof-only commit replaces the obsolete seat-chip presentation checks; picker and behavior assertions remain.

| Old check in needs-prove | Replacement |
| --- | --- |
| Full chip contained inside card | 8×8 dot at card padding origin minus 3px on both axes, including card border in origin |
| Chip clears public tallies and hidden-point hint | Dot clears the same tallies and hint, plus visible VP |
| Chip clears neighbouring chips | Dot clears neighbouring dots, cards and triggers |
| Seat chip has 12px text and 12px X/8px Y padding | Player menu has two published labels at 12px with 12px X/8px Y padding and 8px gap |
| Chip is not a live region | Dot and menu details are not live regions |

The trigger remains 44px and the dot cannot create an interactive target. Existing picker geometry, protocol, privacy, settlement, expiry, keyboard and hole checks are retained. Trade-window details wait for #883.
