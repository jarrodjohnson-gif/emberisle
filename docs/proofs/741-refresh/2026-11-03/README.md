# Landing/dust refresh (#741 / PR #962)

Adopted source: `3ca5a37b049d57f48945a86e7e2c9993bbf6a8f4`.
Current-main merge: `a094007bb0294611aeba363dc7fcc437ad8984b9`, with main
`77a6c08` as second parent. Original Claude source/authorship is retained.

The normal merge resolved three conflicts: retain both package registrations;
keep landing-dust in flows-a alongside main's classic-builder and presentation-3
idle registration; retain main's optional cleanup for partial initialization and
add optional dust disposal. No source motion or taste changes were made. Existing
proof assertions, outpost250–500ms/path190–450ms sound bounds and LAND_MS+100ms
late-puff guard are unchanged. No lockfile edits beyond merged main, timeout,
ceiling, allowance or flaky-signature changes were introduced by this refresh.

Node22.23.4 typecheck/build passed. Native landing-dust-prove passed all its
640x400/1280x720, reduced-motion and390x844 checks. Registration passes176 proofs;
loosen against exactmain77a6c08 reports zero changed existing proofs. The landing
proof itself is byte-identical to the adopted source.

Initial merged-source size: index125194B (+2/400), IslandCanvas201992B (+618/665),
all ceilings and growth pass against exact built main77a6c08. This local result
is separate from hosted synthetic-merge measurements and final evidence-head
size. The6B index headroom does not guarantee a different hosted build passes.

Retained setup mistakes: the first merge command ran in the unchanged current-main
verification worktree and did nothing (`Already up to date`); an early command
reached the new worktree before creation completed; the first size command passed
the base's dist directory rather than its checkout and failed at dist/dist/assets.
The corrected merge and exact checkout-size command produced the results above.
The base build briefly overlapped the start of the native proof; no load-related
causal inference is made. No failed test was retried for green.

Owner motion acceptance, fresh independent review and exact final-head hosted
CI remain required. Recordings are visual evidence and do not establish audible
level, physical-phone rendering or hardware acceptance.

Existing pieces-land and board-look proofs pass; board-look reports zero console
errors. Hosted source build126221403348 (run41723171521, automatic pull_request,
attempt1) passes on Node22.23.4, syntheticce67f7b1 onto main77a6c08:
index125190B (+0/400), IslandCanvas201989B (+611/665). Raw hosted log and run actor
metadata are retained separately from local results.

## Native-renderer motion evidence

Both viewports use the tested source a094007, Playwright1.63.0 and pinned Chromium
headless shell1243, serial under the team browser lock. `capture.mjs` is an
external visual recorder, not a proof and has no assertions; it reuses the native
landing proof's setup function. The staged local fixture creates an outpost and
path through store picking, then upgrades that vertex to a stronghold through
the existing renderer setBoard entry. Bots are held after the initial setup, as
in the proof. There is no product, camera, motion-clock or animation change.

`motion-390x844.mp4` and `motion-1280x720.mp4` show native-speed outpost, path and
stronghold motion. The corresponding `-slow4x` files change playback speed only.
The PNG overview samples the native recording about once a second; use the videos
to judge the short squash/dust. Before/after PNGs retain full native viewports.
Videos are silent; they do not prove audible alignment. Recording event times in
capture.json are approximate wall-clock/video offsets, not timing assertions.
Raw videos remain in the execution evidence directory; ffmpeg trims/transcodes
only, with no synthesized frames. Errors arrays are empty for both recordings.
Owner motion acceptance remains unsatisfied until Jarrod reviews this evidence.
