# Lobby text scaling measurements (#1235)

The [accepted lobby HIG design](../design/lobby-hig/README.md) records the owner’s October 31 answer for #1220.
It separates full text-size support into #1235. This note adds measurements, without another design or text inventory.

## Method

Measured November 17, 2026, after merging main `a7122815c489d2fd5dfd660acc1d03a82f739b01`.
The capture source was `28fc259e11ae951aa3022fe5cc5b35e4c06d0502`; its runtime matches that main commit.
Command: `node /workspace/work/resume-nov9/1634-lobby-text/capture.mjs`, under the team browser lock.
Node 22.23.4 and repository-pinned Chromium 153.0.8010.12 ran the capture.
This temporary research command is not a permanent CI proof.

A real local host issued code `VHVL`. Jarrod hosted; Josh joined; one bot and one empty seat remained.
Josh sent “Ready when you are!” Jarrod marked ready. The same room served all fifteen captures.
Desktop Chromium resized to the five requested CSS viewports, with device scale 1 and reduced motion.
The root’s computed size was 16 px. Setting its inline font size to 20/24 px represented 125%/150%.
Each sample waited for loaded fonts and two animation frames. No other CSS or store state was substituted.

This tests controlled root-font scaling, not browser zoom or physical iOS Dynamic Type.
“Overflow” means `scrollWidth - clientWidth` or `scrollHeight - clientHeight` on the named element.
Code fit compares its text range with its span and enclosing button. It checks this code, not every possible code.

## New measurements

All five 100% baselines had zero card, people-list and document overflow.
All fifteen samples kept `VHVL` fully inside its button. Document horizontal overflow stayed zero.

| Viewport | Text size | Root px | Card overflow x/y px | People-list overflow x/y px | Code fits |
|---|---:|---:|---:|---:|---|
| 320×568 | 125% | 20 | 0/3 | 0/6 | Yes |
| 320×568 | 150% | 24 | 0/14 | 0/11 | Yes |
| 375×667 | 125% | 20 | 0/3 | 0/6 | Yes |
| 375×667 | 150% | 24 | 0/14 | 0/11 | Yes |
| 390×844 | 125% | 20 | 0/0 | 0/2 | Yes |
| 390×844 | 150% | 24 | 0/10 | 0/7 | Yes |
| 844×390 | 125% | 20 | 0/3 | 0/0 | Yes |
| 844×390 | 150% | 24 | 0/14 | 0/0 | Yes |
| 1280×720 | 125% | 20 | 0/0 | 0/2 | Yes |
| 1280×720 | 150% | 24 | 0/2 | 0/7 | Yes |

Chat-line computed font sizes grew with the root:

| Viewports | 100% | 125% | 150% |
|---|---:|---:|---:|
| 320×568, 375×667, 390×844 | 14 px | 17.5 px | 21 px |
| 844×390, 1280×720 | 17 px | 21.25 px | 25.5 px |

The sampled code, name button, seat status, input, Ready button and summary font sizes stayed fixed within each viewport.
These seven sampled roles are not a count of every lobby text.

## Limits and retained failures

The capture completed fifteen samples with zero console or page errors.
Raw screenshots, measurements and the capture utility remain outside the checkout, not in this PR.
Earlier setup attempts failed a letters-only input guard: the host also generates digits, as `JOIN_CODE` permits.
One bounded eight-code search found no letters-only fixture. It stopped without a host denial or configuration change.
The final capture collected observations before that unchanged guard; naturally issued `VHVL` satisfied it.
Those setup failures are preserved separately. A successful room code does not fix text scaling.

This is not a passing #1235 implementation test. The enlarged-root cases still show vertical overflow.
The capture does not prove every text remains unclipped, every code fits, or physical device acceptance.
No rem conversion, layout change, assertion relaxation or design decision is proposed here.
