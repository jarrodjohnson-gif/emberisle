# Independent review

Reviewer: GPT-6.1 Sol, 2026-10-19.

- Capture baseline: `587951aa81db45982a8e79e51c4378afaa2986e3`.
- Current-main reproduction baseline: `00ba9a505d0ab9794cef0ef29ddeba050b5c4a6a`.
- Required coverage contains 42 corrected touch images and 14 retained desktop images.
- Touch contexts use `hasTouch: true`, `isMobile: true`, and `deviceScaleFactor: 1`.
- Touch images cover 390×844, 844×390, and 440×956.
- Desktop images cover 1280×720 with a fine pointer.
- Every size includes all 14 named states or surfaces.
- The touch run resized one real practice game across three viewports.
- The retained desktop images come from earlier capture passes on the same baseline.
- The original final report directly corroborates its ten practice labels, excluding four earlier online/title labels.

## Method and result

- Online evidence uses a real host, copied-link join, two bots, and a watcher.
- Practice evidence uses Play, visible UI controls, and legal board marks.
- Existing debug hooks supply state and legal marker coordinates for observation and clicking.
- The application schedules bots naturally every 700 milliseconds.
- Its canonical policy selects and dispatches bot actions.
- The capture harness injects no game state, resources, dice, winners, or bot timers.
- A separate final-state monitor only reads the running game state and log.
- The touch run reached Tide's real win at turn 17, sequence 228.
- Its report records 49 human actions, 830 polls, and 208893 milliseconds.
- Missing practice labels: `[]`.
- Page errors: `[]`.
- Trade, fortune, paying-roll, robber, and win originals visibly match their labels across all three phone sizes.
- The fortune tray shows an empty hand; no fortune purchase or play is implied.
- End-turn images show the control before the subsequent real click.
- The 390×844 win image includes a transient wheat-loss float over the score.
- The other win images show the same real winner after that float expires.

## Findings

- Approve one new current-main finding: the 1280×720 lobby action footer initially hides the chat composer and Send.
- Reproduce in a fresh fine-pointer context: Host a table, then Add bot three times.
- The composer initially begins at y=528; its center fails hit-testing.
- Scrolling the lobby cover 74 pixels reveals the composer at y=454 and restores hit-testing.
- This is an initial overlap; the controls remain reachable by scrolling.
- Title/body duplicate searches found no matching issue.
- #417 covers Start and Leave clipping; #718 covers room-code overflow and short touch landscapes.
- Reject the fine-pointer 844×390 title candidate: scrolling 104 pixels reveals Host and Join.
- Actual touch title and lobby controls fit at 844×390 on current main.
- Treat historical landscape trade truncation as closed #811.
- Treat historical landscape win-row clipping as closed #809.
- Treat the historical short-landscape lobby concern as closed #718.
- The current-main title/lobby checks emitted no page errors.

No game code changed. The reviewer filed no issues and merged no changes.

## Final artifact check

- Reviewed the final contact sheet: all 56 images show their named states or surfaces.
- Independently verified the complete 14-state, four-viewport filename matrix.
- All 56 SHA-256 hashes, byte counts, and image dimensions match the manifest.
- All 42 phone files exactly match the corrected touch run.
- All 14 desktop files exactly match their retained historical originals.
- Stopped only the reviewer's hosts on ports 8790 and 8791.
- Port 8787 remained available after cleanup.
