# Turn cue and hand-tab overlap during a controlled refit

The existing desktop proof reports the same `+2` message as CI when a wool gain accompanies its refit.
The selected sample contains one same-RAF pair among seven matching pairs. Painted overlap is not confirmed.
The original report changed no runtime or registered proof. The diagnostic follow-up below extends only the proof.

## Provenance

CI: PR #1023 at `44730fb`, run [40068582965](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/40068582965/job/120797029586).
Its only presentation failure was `1280x720: "Your turn" never covers a hand tab ["+2"]`.
The howto timeout in another leg is tracked by #1077.

Local runtime: main `0e816528a7dc461b107c82af4a8a32520c54d4d9`, Node 24.19.0, Chromium/SwiftShader.
The report branch includes main 984b0e7, with the later PIN-race test and draft-design documents.
In the original report, application files, the turn-gain proof and Vite configuration matched 0e81652.

- [Main desktop control](main-desktop-control.log): original desktop case passes. This log does not publish the frame observation.
- [PR desktop control](pr-desktop-cpu2-control.log): original desktop case passes. The log records neither throttling nor frame observations; it does not establish CPU×2 validation.
- [Controlled case](controlled-failure.log): one original assertion fails, with zero console errors.
- [Measured pair](observed-overlap.json): seven matching pairs; one pair belongs to the same recorder RAF callback.

## What the controlled case changes

The observer adds two wool to the local practice hand immediately before the proof's existing synthetic refit.
It waits for the resulting real Hand component's `+2` tab.
The original proof already holds the turn cue and moves its hole for this measurement.
Every original predicate, assertion, timeout and refit remains active.
This is a controlled geometry reproduction, not a natural-game capture or a full-suite result.

## Observed geometry

The selected turn box spans x = 488.875–695.125, y = 516.5–583.5.
The wool tab spans x = 623–657, y = 526.784–548.784.
The turn opacity is 1; the tab opacity is 0.804104.
Their samples are 0.1 ms apart inside the same recorder callback interval.
The next settled refit position is higher, with the turn box ending at y = 518.
The overlap is therefore transient during the refit, rather than its settled placement.

The original global test compares frames up to 50 ms apart.
The selected sample is the one same-RAF pair among seven matches. It also matches within one callback, so cross-frame pairing alone does not explain this reproduction.

## Paint limit and next decision

Recorder RAF callbacks precede later layout/ResizeObserver work.
`useStage` updates placement through ResizeObserver and React state.
The sample establishes recorded geometry, not which intermediate state reached the compositor.
A short compositor capture returned only before/after images, with no intermediate refit image.
Tracing returned no screenshot events. Those captures do not settle the paint question.

The original CI run has no raw frame pairs, so its identical message does not prove an identical cause.
Capture the original frame/callback/placement data on failure before choosing a runtime or measurement fix.
Keep the existing no-cover assertion intact. Do not add a flake entry or increase any limit.
The desk later narrowed #539 and approved failure-only diagnostics in #1082. Runtime changes still require classifying the cause.

## Bounded reproduction

From a clean checkout with root dependencies and Chromium installed, save the following as `/tmp/turn-gain-refit-observer.mjs`.
The observer wraps the browser API; application and proof files stay unchanged by that harness.
It matches source text (`rec.frames.push` and `--hole-top`); proof edits can silently invalidate those hooks.
Verify the expected failure and evidence file explicitly after any source change.

```js
import { pathToFileURL } from "node:url";
import path from "node:path";
import { writeFileSync } from "node:fs";

const { chromium } = await import(pathToFileURL(path.resolve("node_modules/playwright/index.mjs")));
const launch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  const browser = await launch(...args);
  const context = browser.newContext.bind(browser);
  browser.newContext = async (...options) => {
    const ctx = await context(...options);
    await ctx.addInitScript(() => {
      window.__refitRafRanges = [];
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => {
        if (typeof callback !== "function" || !String(callback).includes("rec.frames.push")) return raf(callback);
        return raf(timestamp => {
          const start = performance.now();
          try { callback(timestamp); }
          finally { window.__refitRafRanges.push({ start, end: performance.now(), timestamp }); }
        });
      };
    });
    const newPage = ctx.newPage.bind(ctx);
    ctx.newPage = async (...options) => {
      const page = await newPage(...options);
      const evaluate = page.evaluate.bind(page);
      page.evaluate = async (...input) => {
        const source = String(input[0]);
        if (source.includes('shell.style.setProperty("--hole-top"')) {
          await evaluate(() => {
            const game = window.__emberisle;
            const state = structuredClone(game.getState().state);
            state.players.find(player => player.id === game.getState().localId).resources.wool += 2;
            state.seq++;
            game.setState({ state });
          });
          await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="resource-flash"]')].some(el => el.dataset.resource === "wool" && Number(el.dataset.delta) === 2));
        }
        const result = await evaluate(...input);
        if (source.includes("window.__turns.flatMap") && source.includes("window.__lines.filter")) {
          const data = await evaluate(() => ({ turns: window.__turns, lines: window.__lines, ranges: window.__refitRafRanges }));
          writeFileSync(process.env.REFIT_EVIDENCE || "/tmp/turn-gain-refit.json", JSON.stringify({ clash: result, ...data }));
        }
        return result;
      };
      return page;
    };
    return ctx;
  };
  return browser;
};
```

Use the browser path installed in your environment. This session uses:

```bash
PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers ONLY=1280x720 REFIT_EVIDENCE=/tmp/turn-gain-refit.json node --import /tmp/turn-gain-refit-observer.mjs scripts/turn-gain-prove.mjs
```

Expected: exit 1, one `FAIL 1280x720: "Your turn" never covers a hand tab ["+2"]`, and `turn-gain-prove: 1 failed`.
The evidence file contains the original clash result, original recorded boxes and recorder callback intervals.
The observer preserves returned values and crypto results. It adds no clock or timer override; the proof's existing hold remains.
Its explicit diagnostic wait only ensures the added hand tab mounted before the existing refit.

## Historical report verification

The exact observer block above was extracted from report commit 5f2c6ea and run in a fresh clone.
Root `npm ci` passed. The documented command returned its expected exit 1 with only the original overlap failure.
Application files, Vite configuration and the target proof were checked byte-for-byte against 0e81652.
The later report edits add qualification and validation records only.

[Fresh output](fresh-reproduction.log), [validation record](validation.json), [registration 129](registered.log) and [loosen 0](loosen.log).


## Current diagnostic follow-up (#1085)

This follow-up adds 29 lines to the existing proof, removing or changing none of its original lines.
The added lines are frame identity at 196 and 198, placement metadata at 205–214, and failure logging at 626–642.
The original clash predicate at 624 and the no-cover check at 625 remain verbatim.
Every original assertion, scenario, viewport, wait and limit remains active.
No runtime, registration, timeout, budget or retry policy changes.

Each existing RAF sample now records its callback identity.
Turn samples also retain their stage, shift, area and hole CSS values at that measurement.
On failure, the original check records its failure first.
The diagnostic then selects the first matching pair and first same-callback pair from the existing records.
It reports the full match count without rereading the live DOM or adding a wait.
Success emits no diagnostic.

Fresh independent clone validation of implementation `5fdc31f`, based on main `c0d15d0`:

- [Full normal proof](diagnostic-normal.log): all four viewport cases, reduced motion, hotseat and reconnect pass; zero console errors.
- [Controlled desktop refit](diagnostic-controlled.log): expected exit 1, exactly one original `+2` failure and one diagnostic record.
- [Selected diagnostic pairs](diagnostic-pairs.json): six matches, including a selected same-callback pair at frame 1775.
- [Complete raw recorder evidence](diagnostic-raw.json): original turn/tab records and external callback intervals for independent recomputation.
- [Validation exits](diagnostic-validation.json), [registration](diagnostic-registered.log), [loosen](diagnostic-loosen.log) and [size](diagnostic-size.log) pass their expected outcomes. Typecheck and build also pass.

In the selected same-callback pair, the turn opacity is 1 and the tab opacity is 0.926767.
The turn is still at stage `centre`, shift 0, inside the changed area from y = 406 to 694.
Its box spans y = 516.5 to 583.5; the tab spans y = 526.293 to 548.293.
The first matching pair instead uses an earlier opacity-zero tab sample from another callback.
Both are retained because the existing predicate tests geometry within 50 ms, without an opacity filter.
This qualification changes no predicate and establishes no painted-overlap cause for either CI failure.
The controlled witness is one selected pair, rather than an enumeration of every frame pair in the log.

Use the exact bounded-reproduction harness above on this revision to reproduce the controlled failure.
The source hooks still match this proof; future proof edits require checking them again.
The raw JSON and selected record allow a reader to check the measured frames without trusting that source hook.
