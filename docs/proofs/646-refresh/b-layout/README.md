# #646 owner B seat dot and menu details

Codex-p (GPT-6.1 Terra), parent: Codex-p. Owner decision #873 comment 6425583272 selects B: retain 44px seats, show a dot on seats with published needs, and show details in the player menu and Trade window. Trade-window chips remain deferred until #883 merges and must use its approved window.

Source head `8647aabf4c019a6ca6c584cb34997bd6d214bded`. `304c4d5b34e817e1b456791c64b5119508941e08` is the separate owner-approved proof replacement; `cc3b74af9d199306bdd3e773e3cdb166af0b423f` implements dot/menu; `a0c33390546e1af849d5c9bc6a42962dc880ea03` strengthens public-update and accessibility checks. Later runtime-only commits match the literal mock ring and reduce bundle size; no proof assertions were removed.

| Old `scripts/needs-prove.mjs` check (e1dc4b7) | Owner B replacement (304c4d5 and a0c3339) |
| --- | --- |
| Line 213: full chip inside own card | 8×8 dot at card padding origin minus 3px on both axes, accounting for the card border |
| Line 214: chip clears tallies and hidden-point hint | Dot clears those same public elements and visible VP |
| Line 215: chip clears neighbouring chips | Dot clears neighbouring dots, cards and triggers |
| Line 216: chip caption at least 12px, X padding at least 12px, Y padding at least 8px | Menu details use 12px text, 8px gap, 12px X and 8px Y padding and show the two published labels |
| Line 217: chip is not a live region | Dot and menu details are not live regions; dot remains a noninteractive image with the exact public needs label |
| Line 235: four-seat chip assertion | Same accumulated geometry assertion for approved dot and menu details |

Existing picker, hole, keyboard, protocol, privacy, settlement and expiry checks remain. Two real clients additionally verify the peer menu updates from Stone to Stone and Wheat and disappears on clear. Four-seat captures and geometry cover 320×568, 390×844, 844×390 and 1280×720.

Fresh frozen `8647aab` validation: needs, seat-rail and public-score browser proofs passed serially. Typecheck, build and unchanged ceilings and growth passed. Registered proof count 152 and loosen-prove (one changed proof, none loosened) passed on the unchanged proof source at a0/0133. SeatNeeds was 1896/1900 gzip bytes; index 124522/125200, +185/400 against built 1752 base 124337; table 2118, +27/200. No host, store, dependency, lockfile or size limit changed. Earlier frozen `a0c3339` failed dot shadow serialization because Tailwind added transparent zero-shadow layers to the white ring; color and radius were correct. Runtime changed to the mock's literal `box-shadow` without changing the assertion. Fresh `0133d88` failed the unchanged size ceiling at 1902/1900 bytes; the later caption simplification restores the ceiling. Both failures remain recorded in the parent validation output.


These are manual pictures of the actual product and renderer, with no DOM/CSS overlays or WebGL stubs. The controlled hotseat seed-14 fixture forces main phase and clears buildings; it is not a legal play path. Joshua has Stone; Dune has `grain` and `wool`, displayed as Wheat and Sheep by the product. The approved mock overlay manually said Wool. The first manual capture helper incorrectly expected Wool and stopped; its original helper, records and failure log are retained below. The corrected capture uses the established product label. Renderer readiness and frame counts are in [records](records.json); [capture helper](capture-owner.mjs) and [hashes](hashes.json) are included.

| Viewport | Overview | Dune menu |
| --- | --- | --- |
| 320×568 | [Overview](pictures/320x568-overview.png) | [Menu](pictures/320x568-menu.png) |
| 390×844 | [Overview](pictures/390x844-overview.png) | [Menu](pictures/390x844-menu.png) |
| 844×390 | [Overview](pictures/844x390-overview.png) | [Menu](pictures/844x390-menu.png) |
| 1280×720 | [Overview](pictures/1280x720-overview.png) | [Menu](pictures/1280x720-menu.png) |

The registered geometry proof's captures use its existing WebGL drawing stub; the manual pictures above use the real renderer. [Compressed raw logs and geometry](raw/) retain the a0 shadow-serialization failure, 0133 size failure, first manual label mismatch and final passing output. Each gzip was decompressed and compared byte for byte with its original. Source hashes were compared with the frozen validation clone at 8647; artifact hashes are in the manifest.
