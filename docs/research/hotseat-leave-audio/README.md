# Hotseat Leave audio: bounded attribution

Issue [#1088](https://github.com/jarrodjohnson-gif/emberisle/issues/1088) follows the fresh recurrence on PR #1086.
CI run [40091634710](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/40091634710/job/120865363554) reported:

```text
hotseat-prove failed: Error: Leave played ["/audio/back_001.wav"], not click_001.wav once
```

The original failure remains unreproduced locally. Its cause is unproven.
No runtime or registered proof changes are proposed here.
The earlier false-Promise quiet predicate was fixed by #1076 and is present in both tested revisions.
This report does not assume that older cause explains the new value.

## Source facts

All references below were checked at main `c0d15d0` and PR head `d517827`.
The listed application files and `scripts/hotseat-prove.mjs` are byte-identical between those revisions.
Their dependency lockfiles also match.

- `src/components/game/TableMenu.tsx:221`: Leave uses the common Button, without `back` or `silent`, and calls `goTitle` in hotseat.
- `src/components/ui/button.tsx:35–51`: the default pointer press requests `ui_click`; `ui_back` requires the `back` prop.
- `src/lib/game/store.ts:643–678`: `goTitle` cancels game activity and restores the title state. It has no direct `ui_back` call.
- `src/components/game/FortuneTray.tsx:73` and `TableMenu.tsx:77`: Escape can request `ui_back`.
- `src/lib/sound.ts:147–162,188–195`: sounds enter a shared queue and start through `pump`, paced by 150 ms timers.
- `scripts/hotseat-prove.mjs:32–39,329–346`: the proof counts playback starts, waits for 400 ms without a new start, snapshots the count, clicks Leave, then checks the first observed post-baseline slice.

A playback start after the snapshot alone does not identify which earlier input requested that clip.
The current CI log contains neither native input targets nor queue/timer provenance.
These source facts leave an earlier queued clip and a wrong native target among the possibilities.
They establish neither possibility as the original cause.

## Native observations

A fresh independent clone installed root/server dependencies with frozen lockfiles.
The exact full registered hotseat proof ran through an external observer, with no source edits.
The observer delegates audio playback and timer callbacks with their original arguments and return values.
It records native input targets, audio starts, sound-pump timer scheduling/firing, and proof count/slice reads.
No input, timer delay, clock, predicate or timeout is changed.
Instrumentation adds bookkeeping and may perturb timing; passing observations do not rule out an unobserved race.

| Case | Revision | CPU | Original result | First clip after trusted Leave pointerdown | Delay |
|---|---|---|---|---|---:|
| [main normal](main-normal.log) | c0d15d0 | normal | pass | click_001 | 2.0 ms |
| [main CPU×2](main-cpu2.log) | c0d15d0 | rate 2 accepted | pass | click_001 | 2.6 ms |
| [PR normal](pr-normal.log) | d517827 | normal | pass | click_001 | 0.7 ms |
| [PR CPU×2](pr-cpu2.log) | d517827 | rate 2 accepted | pass | click_001 | 0.6 ms |

Both CPU logs explicitly record successful `Emulation.setCPUThrottlingRate` calls.
Each trace records a trusted pointerdown, pointerup and click on Leave table.
The following playback stack reaches the common Button press and `play` on the successful path.
The proof sees exactly one `click_001` after its baseline in every run.
Observed audio paths were checked one-for-one against the proof's original `__plays` array.
The recorded proof slices match those arrays at the original baseline indices.

[Summary](summary.json), [validation exits](validation.json), and full traces:
[main normal](main-normal.json), [main CPU×2](main-cpu2.json), [PR normal](pr-normal.json), [PR CPU×2](pr-cpu2.json).

In the main-normal observation, a pump timer in the second before Leave fired 368.3 ms late.
Its requested delay was 150 ms, so the interval was about 518.3 ms.
That run still passed. This is evidence of timer lateness, not a reproduction of the CI error.
A quiet interval measures observed starts and does not expose the private pending queue.
The failing CI instance needs its own input and playback timeline before a runtime or proof-boundary fix is chosen.

## Next scope

Gated child [#1089](https://github.com/jarrodjohnson-gif/emberisle/issues/1089) adds failure-only provenance to the existing proof.
It depends on this report's review and closure.
Capture native Leave targets, clip ordinals/timestamps/stacks, pump timing, baseline and original observed slice.
Preserve every original assertion and deadline. Do not add another wait or CI retry.
No UI, sound choice or queue-policy change is justified by these four passing observations.

## Reproduce the observation

Save the following external harness as `/tmp/hotseat-leave-observer.mjs`.
Run the original proof from the chosen checkout with frozen dependencies and Chromium available:

```sh
LEAVE_EVIDENCE=/tmp/leave-normal node --import /tmp/hotseat-leave-observer.mjs scripts/hotseat-prove.mjs
LEAVE_CPU=2 LEAVE_EVIDENCE=/tmp/leave-cpu2 node --import /tmp/hotseat-leave-observer.mjs scripts/hotseat-prove.mjs
```

Set `PLAYWRIGHT_BROWSERS_PATH` to the browser cache in your environment if necessary.
The four observations above used `/workspace/emberisle/work/browsers` and Chromium/SwiftShader.
They are observations of a passing proof, not a guaranteed reproducer for the original failure.
The observer recognizes sound-pump callbacks by their function name; source changes can invalidate that timer hook.
Audio and native input tracing are separate from that hook.
Host read timestamps bracket the protocol call; browser events use their own performance clock and recorded time origin.
Do not treat those host brackets as exact browser event timestamps.

```js
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
const { chromium } = await import(pathToFileURL(path.resolve('node_modules/playwright/index.mjs')));
const launch = chromium.launch.bind(chromium);
const prefix = process.env.LEAVE_EVIDENCE;
if (!prefix) throw new Error('LEAVE_EVIDENCE required');
const reads = [], throttle = [];
chromium.launch = async (...args) => {
  const browser = await launch(...args);
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...args) => {
    const page = await newPage(...args);
    if (process.env.LEAVE_CPU) {
      const rate = Number(process.env.LEAVE_CPU);
      await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate });
      throttle.push({ rate, accepted: true, viewport: page.viewportSize() });
      console.error(`OBSERVER CPU throttle accepted: rate=${rate}`);
    }
    await page.addInitScript(() => {
      window.__leaveTrace = [];
      const info = () => {
        const s = window.__emberisle?.getState();
        return { mode: s?.mode, phase: s?.state?.phase, state: !!s?.state, focus: document.activeElement?.textContent?.trim().slice(0, 80) };
      };
      const note = (kind, data) => window.__leaveTrace.push({ kind, at: performance.now(), ...info(), ...data });
      for (const kind of ['pointerdown', 'pointerup', 'click', 'keydown', 'keyup']) document.addEventListener(kind, e => {
        const b = e.target.closest?.('button');
        note('input', { event: kind, key: e.key, button: b?.textContent?.trim(), label: b?.getAttribute('aria-label'), trusted: e.isTrusted });
      }, true);
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) {
        if (!this.src.endsWith('/old_tower_inn_loop.mp3')) note('audio', { path: new URL(this.src).pathname, stack: new Error().stack });
        return play.apply(this, args);
      };
      const later = window.setTimeout;
      window.setTimeout = function (fn, ms, ...args) {
        if (typeof fn !== 'function' || fn.name !== 'pump') return later.call(this, fn, ms, ...args);
        const scheduled = performance.now();
        note('pump-scheduled', { ms, scheduled });
        return later.call(this, function (...args) {
          note('pump-fired', { ms, scheduled, lateness: performance.now() - scheduled - ms });
          return fn.apply(this, args);
        }, ms, ...args);
      };
    });
    const evaluate = page.evaluate.bind(page);
    page.evaluate = async (...args) => {
      const source = String(args[0]);
      const relevant = source.includes('window.__plays.length') || source.includes('window.__plays.slice');
      const from = Date.now(), value = await evaluate(...args);
      if (relevant) reads.push({ source, from, to: Date.now(), value });
      return value;
    };
    return page;
  };
  const close = browser.close.bind(browser);
  browser.close = async (...args) => {
    const pages = [];
    for (const ctx of browser.contexts()) for (const page of ctx.pages()) if (!page.isClosed()) {
      pages.push(await page.evaluate(() => ({ origin: performance.timeOrigin, trace: window.__leaveTrace, plays: window.__plays, quiet: { n: window.__quietN, at: window.__quietAt } })));
    }
    writeFileSync(prefix + '.json', JSON.stringify({ throttle, reads, pages }, null, 2));
    return close(...args);
  };
  return browser;
};
```
