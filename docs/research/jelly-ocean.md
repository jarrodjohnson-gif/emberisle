# Jelly Ocean implementation audit

The approved mockup combined a tactile miniature board with cream controls. Jarrod's implementation instruction changed the water block into actual open ocean and added occasional creatures and island work. The existing scene already supplied sheep grazing, boats, a wayfarer and merged ore carts/miners; the work extends those rather than replacing the renderer or rules.

Implementation: [Jelly Ocean](../design/jelly-ocean.md), issue #592, PR #591. The earlier Basalt audit remains historical. No new fonts, chrome images or game dependencies are introduced.

## What changed

Cream HUD faces and one SVG resource-symbol family replace the dark table theme. Goods place count and icon on one line, reserving the corner for deltas during a lift. Dice use cream faces and dark pips. The island has warmer terrain, grain fields/farmers, clay outcrops and layered hex walls. Ocean shader colours now give a broad shallow/deep transition and faint cellular caustics without the initial grid-like interference pattern.

The ocean scheduler is entirely decorative. Seed/sequence/resource/state snapshots are unchanged across visits. It prebuilds reusable visitors, admits one at a time, and searches the measured board hole. The island fit is never changed to make room for wildlife. A hidden page or reduced-motion preference stops the scheduler and all work transforms. Existing game/network behaviour, privacy, offers, chat, safe areas and piece landing remain.

## Evidence

The scene proof exercises all three visitors on desktop, portrait and landscape, checks every visitor vertex beyond the coast/docks, limits active visitor meshes to 4, simulates bounded random visits with quiet intervals, verifies crop clearance, and freezes an already visible visitor and all workers when motion is disabled or the page is hidden.

The responsive proof retains a larger fitted island than baseline: +40% projected area on desktop main phase, +7% phone portrait and landscape. These are scale-squared estimates, not counts of painted framebuffer pixels. All visible controls remain at least 44 px. Essential text colours meet AA; the count contrast is 11.05:1 on cream and 9.8:1 at zero goods. Phone fields remain 16 px and track the visual viewport keyboard.

Hand motion, zero values, resource-delta visibility, token/prop clearance, scene idle/reduced motion, contrast and rotation checks pass locally. The full release checks and CI are reported in the PR. Previous-design colour assertions are updated to the cream palette; interaction, privacy and timing checks remain.

One contrast run found its default port occupied; it passed on an isolated port. The new hand layout initially let a lifted two-digit count touch its delta badge; reserved top padding fixes both delta/count and count/label spacing. The first water ripple pattern formed a grid; the cellular version removes it, and the broader depth transition keeps the existing calm-water pixel check.

The screenshots and video are real Chromium rendering. The showcase deliberately shortens wildlife waiting time so each visitor can be reviewed. The shipped scheduler uses the timings in the design spec. This environment does not verify physical iPhone/Safari rasterisation, VoiceOver speech or sustained mobile GPU performance.
