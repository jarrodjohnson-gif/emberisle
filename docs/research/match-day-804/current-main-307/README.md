# Current-main match-day audit, 2026-10-23

56 PNGs cover 14 states at 1280×720 (mouse), 390×844, 844×390 and 440×956 (touch emulation). Baseline: `30737a5c81f194b1c6235c1409555ee8e6cb19bd`. Application, server, scripts and package files in the fresh capture clone are byte-identical to that main commit. The adoption preserves original authorship and merges main normally at `a987d6c`.

Open [the image index](index.html), the contact sheets ([desktop](contact-1280.png), [390](contact-390.png), [landscape](contact-844.png), [440](contact-440.png)), or the full-size [captures](captures). The contact sheets render the original images in an HTML grid.

## Results

- The full capture pass exited 0 with 56 states, zero page errors and 147 instrumented practice actions. Desktop reached natural winner `p3`, turn 24, sequence 311; the touch game reached natural winner `p2`, turn 23, sequence 304.
- Title, four-seat lobby, link join, watcher, roll-off, settlement placement, road placement, placed pieces, trade, fortunes, end turn, paying roll, wayfarer and win are captured at every size.
- All 56 SHA-256 hashes, byte counts, PNG dimensions, unique state labels and pointer modes were checked. The filename set is 14 states × four viewports.
- Fresh root/server frozen installs and production build exited 0; isolated `npm run night` served HTTP 200 on 8787. Actual output is in `setup-validation.log` and `setup-result.log`; only trailing whitespace was removed from retained logs.

Final checks from a new clone of `c175c97` pass: both installs, typecheck, build, registered119, loosen (zero changed proofs), size (all chunks +0 B), diff and the full evidence checks. Actual output is in `final-validation.log`.

## Review candidates checked again

| Historical candidate | Current-main observation |
|---|---|
| 390×844 win table cuts off Army, Hidden and Total | All columns and four rows are visible. Table client/scroll width both 324 px. No duplicate of #808/#878 filed. |
| 844×390 win shows only the winner | Four rows and both actions are visible. Table client/scroll height both 104 px. No duplicate of #809 filed. |
| 844×390 trade cuts off wanted goods | A separate native practice run verified a real wheel scroll from 0 to 39 px (218 px client height, 257 px content), independently of the fixed footer. All ten wanted-goods buttons fit inside the scroll area afterward; all five enabled increment buttons were hit-testable. Clicking More Wood then Fewer Wood changed the wanted quantity 0→1→0. [Before](supplemental/captures/844x390-trade-panel.png), [after](supplemental/captures/844x390-trade-panel-scrolled.png), [metrics](supplemental/scroll-metrics.json). Disabled decrements intentionally do not receive pointer events. No duplicate of #811 filed. |
| 390/440 seat names shorten and the status line clips | Three-letter labels are intentional (`SeatRail.shortNames`; approved `docs/design/mobile-hud.md`: truncated names). Full names remain in accessible text. “Hidden fortunes may add points.” is visible in fresh portrait play images. No new defect established. |
| Prior #895 desktop lobby chat overlap | The fresh four-seat desktop image shows composer, Send, Ready and Leave clear of one another. #918 already fixed this; no duplicate filed. |

No new issues filed. These observations cover the sampled screens and scroll interaction; they do not assert that every possible state or physical phone is defect-free.

## Capture method and limits

Chromium used SwiftShader. Phone contexts used `hasTouch: true`, `isMobile: true`, device scale 1 and recorded `(pointer: coarse) = true`; desktop recorded false. The three phone sizes are successive resizes of one touch context and practice game, rather than three independent games.

Online setup used visible Host, Add bot twice and Copy link controls, followed by Join in a second context, both humans Ready, Start, and a real `?watch=CODE` visit. Inactive online pages were frozen with CDP while the other page was captured, to avoid competing software render loops. Join used focus and Enter. This controls the test browser lifecycle; it does not inject game state or timers.

Practice used visible controls and legal placement-list buttons, keyboard activation, normal 700 ms bot scheduling, ordinary rolls and legal discards. Placement selection reads legal vertices and favours ore/grain/wool. Offers were declined through No. No dice, resources, state, bot timers or winner were injected, and no fast-forward was used. Fortunes images show the tray; this does not prove playing every fortune. Paying-roll captures compare the local hand before and after the resolved roll; payout animation may change between resizes.

The first title images preceded island readiness. All four were replaced in a serial follow-up after `landReady` and a settling wait. `manifest.json` contains final hashes and timestamps. `result.json` records the gameplay pass, `title-result.json` that follow-up, and `supplemental/result.json` the separate scroll run. `capture.log`, `titles.log` and `scroll.log` contain actual output.

Earlier temporary harness attempts timed out in guest-title interactions, and one had a syntax error; raw errors remain in `earlier-harness-failures.log`. The first scroll diagnostic wrongly required disabled decrements to be hit-testable; the corrected diagnostic checks every button's geometry, enabled hit targets, and actual increment/decrement behavior. No product or existing proof assertion changed. Failed attempts are not counted as completed passes.
