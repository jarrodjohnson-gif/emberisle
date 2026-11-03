# Climber proof, 2026-10-23

Fresh clone `work/verify969`, proof commit `64cc7b3`, main `30737a5`. Adopted PR #969 for issue #966; original runtime by Cursor Composer, proof follow-up by Codex-open-table-833 (GPT-6.1 Sol). The original story and appearance are unchanged.

`PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers npm run climber-prove` passed. [Actual output](climber-prove.log) includes a 21-second wall-clock observation: board age 1.5381 → 22.4580 seconds, climber height 0.2966 → 0.6069 and distance from the peak 0.6633 → 0.2217. This uses native renderer time, without `setAge`.

The native hotseat action uses fixed map seeds 676 and 677. Only its synchronous random seed draw is pinned; renderer time and story updates run normally. Temporary proof instrumentation records the first live update of a different board, after its update computes the climber pose, and is restored afterward. Both rematch and post-title new boards begin naturally at age 0, below the unchanged 2-second limit. Neither check calls `setAge`.

Separate deterministic samples cover ages 0, 4, 20, 100, 160 and 800. The extra final sample proves the climber reaches the summit after seeded retries. At age 160 this fixture has already fallen and is climbing again; it is not expected to be seated yet. The prior age-160 assertions remain intact. Reduced motion holds age and position at zero.

The four `play-age*` PNGs show the actual 1280×720 and 390×844 viewports at ages 4 and 160. For these screenshots alone, the proof pauses the animation loop, sets the requested age, draws and drains GL, checks the board and environment ages, takes the screenshot and restores the loop. This prevents a subsequent native frame from replacing the labeled pose. The title capture is a normal live title frame. [Manifest](manifest.json) records dimensions and hashes.

| Viewport | Age 4 | Age 160 |
|---|---|---|
| 1280×720 | [Foot](play-age4-1280x720.png) | [Climbing again](play-age160-1280x720.png) |
| 390×844 | [Foot](play-age4-390x844.png) | [Climbing again](play-age160-390x844.png) |

These are software Chromium observations. The reviewer’s requested human look over the first minutes remains pending; no human acceptance or independent review is claimed.

Fresh-clone checks also passed: dependency installs, TypeScript, production build, registration of all 120 proofs, no loosened proofs against main, every chunk ceiling and growth allowance, `tokens-prove`, `jelly-ocean-prove` at all three viewports, `idle-prove` and `board-look-prove`. Full command output is saved beside this report. The static build used `6f487d4`; subsequent commits change only the proof and evidence, with identical app/server/package/CI bytes. The focused and neighboring proofs used `64cc7b3`.

Measured growth: index −2 B / 400 B allowance, IslandCanvas +7 B / 660 B, jelly-board +52 B / 200 B, hex-jelly +6 B / 200 B; every other chunk also passes. No budget file was changed.

During proof development an unpinned random map legitimately completed a fall and restarted gear-out at age 160, failing the original late-position assertion. The fixture now uses explicit seeds instead of weakening that assertion. A separate polling-based rematch/post-lobby measurement read 2.475/3.449 seconds on software GL; recording the first natural live frame removes that measurement delay while retaining the strict 2-second limit and new-object check.

Negative controls, run serially in the fresh clone and then reverted byte for byte:

- Initialize `t0` to zero: the full proof exits 1, including rematch natural age 30.0794 s and post-lobby natural age 10.4818 s, both failing the strict <2 s checks.
- Freeze `env.age` at zero: the full proof exits 1 on the natural movement assertion, fixed-age climb/summit assertions and exact screenshot environment-age checks.
- Restore the original runtime file (SHA-256 `b10cad0323ba7a5babf8e0a778ffadef867bcb58158c8f2feb9ed68b8f1f1284`): the full climber proof passes again. [Results](negative-controls.json) and complete logs are retained. Screenshots in this report are from the earlier positive run, never from a mutant.
