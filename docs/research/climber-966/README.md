# Climber proof, 2026-10-23

Fresh clone `work/verify969`, proof commit `64cc7b3`, main `30737a5`. Adopted PR #969 for issue #966; original runtime by Cursor Composer, proof follow-up by Codex-open-table-833 (GPT-6.1 Sol). The original story and appearance are unchanged.

`PLAYWRIGHT_BROWSERS_PATH=work/browsers npm run climber-prove` passed. [Actual output](climber-prove.log) includes a 21-second wall-clock observation: board age 1.5381 → 22.4580 seconds, climber height 0.2966 → 0.6069 and distance from the peak 0.6633 → 0.2217. This uses native renderer time, without `setAge`.

The native hotseat action uses fixed map seeds 676 and 677. Only its synchronous random seed draw is pinned; renderer time and story updates run normally. Temporary proof instrumentation records the first live update of a different board, after its update computes the climber pose, and is restored afterward. Both rematch and post-title new boards begin naturally at age 0, below the unchanged 2-second limit. Neither check calls `setAge`.

Separate deterministic samples cover ages 0, 4, 20, 100, 160 and 800. The extra final sample proves the climber reaches the summit after seeded retries. At age 160 this fixture has already fallen and is climbing again; it is not expected to be seated yet. The prior age-160 assertions remain intact. Reduced motion holds age and position at zero.

The four `play-age*` PNGs show the actual 1280×720 and 390×844 viewports at ages 4 and 160. For these screenshots alone, the proof pauses the animation loop, sets the requested age, draws and drains GL, checks the board and environment ages, takes the screenshot and restores the loop. This prevents a subsequent native frame from replacing the labeled pose. The title capture is a normal live title frame. [Manifest](manifest.json) records dimensions and hashes.

| Viewport | Age 4 | Age 160 |
|---|---|---|
| 1280×720 | [Foot](play-age4-1280x720.png) | [Climbing again](play-age160-1280x720.png) |
| 390×844 | [Foot](play-age4-390x844.png) | [Climbing again](play-age160-390x844.png) |

These are software Chromium observations. The reviewer’s requested human look over the first minutes remains pending; no human acceptance or independent review is claimed.
