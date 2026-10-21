# Match-day audit evidence

## Baseline status

These 56 captures are a pre-fix baseline. They are not a check of current `main`. Every image was taken on `587951aa81db45982a8e79e51c4378afaa2986e3` (2026-10-18). When the review desk read this PR, `main` was 29 commits ahead (`00ba9a505d0ab9794cef0ef29ddeba050b5c4a6a`). When `main` was merged into this branch (`ea327a3`, 2026-10-21), it was 67 commits ahead.

Fixes landed after the baseline: #718 (`e378820`), #809 (`bd21ecc`), #811 (`833a463`), and the win-screen table fit in merged PR #878 (`c8df182`, for #808). Because of that, these images cannot show those problems fixed, and they cannot show them still present on `main`. Closed #895 (the lobby chat overlap below) was closed by merged PR #918. This record did not re-check it.

Candidates the review desk listed from the baseline images. None has been checked on current `main`, and none has been filed:

| Baseline image | What the baseline image shows | Related change on `main` |
|---|---|---|
| `390x844-win-screen.jpg` | The score table clips on the right. Army, Hidden and Total are off-screen. | PR #878 (merged, for #808) |
| `844x390-trade-panel.jpg` | Only "You give" shows, cut mid-card. | #811 (`833a463`) |
| `844x390-win-screen.jpg` | Only the winner's row shows. | #809 (`bd21ecc`) |
| 390 and 440 phone images with seat names | Seat names truncate to three letters ("Tid", "Dun"), and the last status line is cut off. | None found |

Recapturing on current `main` is not part of this PR. The review desk asked for at least the trade and win screens at 844×390 and 390×844. That recapture is waiting on the review desk and owner. Until it runs, read every "matches closed #…" line below as "matches the pre-fix baseline", not as a statement about current behaviour.

## Capture provenance

The retained 14 desktop screenshots use baseline `587951aa81db45982a8e79e51c4378afaa2986e3` and host `http://127.0.0.1:8788/`. They came from separate historical passes. `capture-report.txt` directly records only the 10 practice states. Online title, lobby, join-by-link, and watcher images predate that report. `capture.mjs` documents their UI sequence, but no separate online run report was preserved. The practice report's counts and page-error result apply only to its practice pass.

All historical screenshots used fine-pointer contexts, including portrait phones. Those images prove viewport and state, but they do not prove touch behavior. The corrected phone run uses `hasTouch: true`, `isMobile: true`, and device scale factor 1. It covers 14 states at 390×844, 440×956, and 844×390. This run uses the same historical baseline. Raw fine-pointer phone images stay outside the final capture set as provenance.

The practice report records winner `p2`, phase `over`, turn 17, and roll 67. It records 48 human UI actions, 829 polls, and 219,760 ms elapsed. It reports no missing practice captures and zero page errors. The table code remained only in browser state. The harness used visible controls and legal board markers. Built-in bots used the app's 700 ms scheduler. The harness did not inject state, resources, dice, or bot timers. It answered trade offers with the visible No control.

The corrected phone run captures all 14 labels in one pass. It finished with winner `p1`, phase `over`, turn 17, and sequence 228. It used 49 human UI actions, 830 polls, and 208,893 ms. The run reports no missing states and zero page errors. The online sequence uses a host, two bots, a join-by-link seat, and a watcher. The actual table code stays in browser state. Practice actions use visible controls while built-in bots follow the app scheduler.

## Checklist coverage

| Requested evidence | Final capture set |
|---|---|
| Title, four-seat lobby, link join, watcher | Desktop 1280×720 and touch at all three phone sizes |
| Practice roll-off, placements, paying roll | Desktop and touch phone sizes |
| Trade panel, fortune tray, robber, end turn | Desktop and touch phone sizes |
| Win screen | Desktop and touch phone sizes; practice reached a real winner |

The issue's first settlement and road placement appear in separate states. The set also includes `settlement-and-road-placed`. Paying-roll evidence compares local resources before and after the resolved roll. The payout animation can expire between viewport captures. The fortune tray shows an empty hand. It does not show a purchase or play. End-turn captures show the control before the following click.

The final `captures/` folder contains 56 images. The literal count command returned:

```text
$ ls docs/research/match-day-804/captures | wc -l
56
```

## Setup and host validation

The checkout is pinned to `587951aa81db45982a8e79e51c4378afaa2986e3`. The original setup and host stdout was not preserved. `resumed-validation.log` records bounded validation on that same baseline. `npm ci`, `npm --prefix server ci`, and `npm run build` each exited 0. Default `npm run night` on 8787 exited 1 with a recorded busy-port error. `PORT=8789 npm run night` served HTTP 200 from `/`. That process stopped after the response. This is resumed validation, not original capture-time output. Existing 8787 and 8788 hosts were left untouched. Setup validation did not repeat browser capture.

## Artifacts and review findings

`capture-manifest.json` records source, baseline, capture mode, dimensions, byte count, and SHA-256 per image. `contact-sheet.jpg` shows all 56 final captures. `touch-capture-report.txt` records the corrected run. `touch-capture.log` and `touch-capture-monitor.log` preserve its output. `resumed-validation.log` holds actual output from setup checks. Only trailing whitespace was removed from that log.

Current-main review used baseline `00ba9a505d0ab9794cef0ef29ddeba050b5c4a6a`. It found one new candidate at 1280×720. A lobby with three bots initially covers the chat composer and Send control with its sticky footer. Scrolling `.lobby-cover` down 74 pixels reveals both controls and makes them hit-testable. Before and after evidence and measurements live in `current-main-repro/`. Duplicate searches found no matching issue. This does not claim permanent inaccessibility. The baseline landscape trade and win images match the problems later fixed under closed #811 and #809. They are pre-fix evidence (see Baseline status). Coarse-pointer 844×390 title and lobby controls fit without scrolling.

At 390×844, the win image includes a transient `−7 wheat` loss float over the score. The winner and score remain visible. The 844×390 win-row clipping matches closed issue #809. The evidence identifies captured states and viewport sizes. It does not establish that every screen is free of visual defects. Reviewers should inspect full-size images before deciding. Check proposed bugs against current `main`, as issue #804 requires.

## Filed issue

- [#895: desktop lobby chat overlap](https://github.com/jarrodjohnson-gif/emberisle/issues/895).
- No duplicate issues were filed for closed #718, #809, or #811.
