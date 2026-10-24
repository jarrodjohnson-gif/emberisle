// Control-only: delay one real served sound-pump timer at its native boundary.
// No product source changes, no wait replacement, no synthetic playback recorder entries.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
const { chromium } = await import(pathToFileURL(path.resolve('node_modules/playwright/index.mjs')));
const launch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  const browser = await launch(...args), newPage = browser.newPage.bind(browser);
  const collected = [];
  browser.newPage = async (...pageArgs) => {
    const page = await newPage(...pageArgs);
    await page.addInitScript(() => {
      const native = window.setTimeout;
      window.setTimeout = function (callback, ms, ...args) {
        if (window.__holdOnePump && ms === 150 && window.__leaveTrace?.at(-1)?.kind === 'pump-scheduled') {
          window.__holdOnePump = false;
          window.__leaveTrace.push({ kind: 'controlled-pump-delay', at: performance.now(), requestedMs: ms, delegatedMs: 750 });
          return native.call(this, callback, 750, ...args);
        }
        return native.call(this, callback, ms, ...args);
      };
    });
    const wait = page.waitForFunction.bind(page);
    page.waitForFunction = async (predicate, arg, options) => {
      if (!String(predicate).includes('window.__quietAt') || arg !== 400 || options?.timeout !== 4000)
        return wait(predicate, arg, options);
      // Establish a drained setup before the measured original bounded wait.
      await wait(() => window.__pendingPumps === 0, null, { timeout: 4000 });
      await page.evaluate(async () => {
        const sound = await import('/src/lib/sound.ts');
        window.__holdOnePump = true;
        sound.play('ui_back');
        sound.play('card_play');
        window.__leaveTrace.push({ kind: 'controlled-boundary-start', at: performance.now(), pending: window.__pendingPumps });
      });
      const result = await wait(predicate, arg, options);
      collected.push(await page.evaluate(() => ({ at: performance.now(), pending: window.__pendingPumps,
        baseline: window.__plays.length, quietAt: window.__quietAt, trace: window.__leaveTrace.slice() })));
      return result;
    };
    return page;
  };
  const close = browser.close.bind(browser);
  browser.close = async (...args) => {
    writeFileSync(process.env.BOUNDARY_EVIDENCE || '/tmp/issue1093-late-pump.json', JSON.stringify(collected, null, 2) + '\n');
    return close(...args);
  };
  return browser;
};
