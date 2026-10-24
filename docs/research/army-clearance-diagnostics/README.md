# Army clearance failure diagnostics

Issue [#1081](https://github.com/jarrodjohnson-gif/emberisle/issues/1081) follows the unmeasured CI failure on PR #706.
The original failure named the phone, scenario and seat but supplied no coordinates.
This change logs the boxes already used by that assertion, then rethrows the same error.
It does not diagnose or fix the original CI geometry.

Only `scripts/longest-army-prove.mjs:182–196` changes in the proof: 15 added try/catch and logging lines.
The original assertion remains at line 183, including its predicate and 0.5 px allowance.
Removing the wrapper restores the complete main proof byte for byte.
Every other assertion, scenario, viewport, wait and runtime file is unchanged.
The existing proof remains registered; no new product proof is added.
The desk explicitly released this scope on #539 and #1081.

## Fresh verification

Implementation `478a57a`, based on main `c0d15d0`, was tested in an independent clone.
Root and server frozen installs passed.
The [normal full proof](normal.log) passes all four viewports and nine scenarios per viewport.
There is no diagnostic output on success.
Typecheck, build, [registration](registered.log), [loosen](loosen.log) and [size](size.log) pass.
[Validation exits](validation.json) distinguish the expected red control from the passing checks.
No ceiling, allowance, predicate, timeout or retry policy changes.

The external control moves a real points element inside p1's non-badge army tally.
It does so immediately before the existing read at 390×844 with two wayfarers played.
It changes only the controlled browser's DOM; the proof and application files remain unchanged.
This creates the [original assertion failure plus one diagnostic](overlap.log), exit 1.
The [record](controlled-overlap.json) contains the exact tally, card and points boxes from that read.
The original CI instance's cause remains unknown; matching the message does not prove matching geometry.

| Clause | Existing comparison | Controlled result |
|---|---|---|
| Left of points | tally.right ≤ points.left + 0.5 | false: 313.25 > 301.3125 |
| Above points | tally.bottom ≤ points.top | false: 50 > 42 |
| Below points | tally.top ≥ points.bottom | false: 34 < 43 |

The three comparisons are false, so the original OR predicate fails.
The payload also retains the requested viewport, scenario, seat, kind, badge, visibility, label and animation.
The existing unused `phase` argument is reported as null, without inventing a phase.

## Reproduce the controlled failure

Save the following external harness as `/tmp/army-clearance-overlap-control.mjs`.
Run from a checkout with frozen dependencies installed and Playwright Chromium available:

```sh
npm run longest-army-prove
node --import /tmp/army-clearance-overlap-control.mjs scripts/longest-army-prove.mjs
```

The first command passes. The second exits 1 with the control marker, one JSON record and the original error.
The harness matches the proof's read-function source text; source changes can invalidate that hook.
If no injection occurs, browser cleanup fails explicitly rather than silently accepting the control.

```js
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const { chromium } = await import(pathToFileURL(path.resolve('node_modules/playwright/index.mjs')));
const launch = chromium.launch.bind(chromium);
let injected = false;
chromium.launch = async (...args) => {
  const browser = await launch(...args);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...options) => {
    const ctx = await newContext(...options);
    const newPage = ctx.newPage.bind(ctx);
    ctx.newPage = async (...args) => {
      const page = await newPage(...args);
      const evaluate = page.evaluate.bind(page);
      page.evaluate = async (...args) => {
        if (!injected && page.viewportSize()?.width === 390 && String(args[0]).includes('const sel = document.querySelector')) {
          injected = await evaluate(() => {
            const st = window.__emberisle?.getState().state;
            if (st?.players.find(p => p.id === 'p1')?.knightsPlayed !== 2) return false;
            const card = document.querySelector('[data-testid="seat-p1"]');
            const army = card.querySelector('[data-testid="tally-army"]');
            const vp = card.querySelector('[data-testid="seat-vp"]');
            Object.assign(vp.style, { position: 'fixed', width: '1px', height: '1px', padding: '0px', margin: '0px', transform: 'none' });
            const b = army.getBoundingClientRect();
            Object.assign(vp.style, { left: `${(b.left + b.right) / 2}px`, top: `${(b.top + b.bottom) / 2}px` });
            return true;
          });
          if (injected) console.error('CONTROL: injected real 1px points box inside p1 army tally at 390x844 / army 2');
        }
        return evaluate(...args);
      };
      return page;
    };
    return ctx;
  };
  const close = browser.close.bind(browser);
  browser.close = async (...args) => {
    await close(...args);
    if (!injected) throw new Error('CONTROL FAILED: DOM overlap was never injected');
  };
  return browser;
};
```
