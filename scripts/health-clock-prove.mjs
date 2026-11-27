// #1493: actual shared initialization tolerates delivery latency with no future-time margin or private clock API.
import assert from "node:assert/strict";
import { chromium } from "./proof-browser.mjs";
import { pauseHealthClock } from "./health-clock.mjs";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = await chromium.launch();
try {
  for (const latencyMs of [400, 1000]) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      let target;
      const read = () => page.evaluate(() => ({ date: Date.now(), perf: performance.now(), fired: window.__clockSentinel ?? 0 }));
      const delayedPage = { clock: {
        install: options => page.clock.install(options),
        setFixedTime: time => page.clock.setFixedTime(time),
        setSystemTime: time => page.clock.setSystemTime(time),
        pauseAt: async time => {
          target = Number(time);
          // Only delivery is delayed. No evaluation or browser-clock observation precedes the native pause call.
          await delay(latencyMs);
          try { await page.clock.pauseAt(time); }
          catch (error) {
            console.error("health-clock-negative", JSON.stringify({ latencyMs, target, nodeAge: Date.now() - target, afterError: await read(), error: error.message }));
            throw error;
          }
        },
      } };
      await pauseHealthClock(delayedPage);
      const paused = await read();
      assert.equal(paused.date, target, "wall clock is held at the target despite delivery latency");
      assert.ok(Number.isFinite(paused.perf) && paused.perf >= 0, "monotonic clock keeps a finite nonnegative origin");
      await page.evaluate(() => { window.__clockSentinel = 0; setTimeout(() => window.__clockSentinel++, 50); });
      await delay(100);
      assert.deepEqual(await read(), paused, "timers, Date and performance remain paused across real Node time");
      await page.clock.fastForward(49);
      assert.equal((await read()).fired, 0, "timer does not fire before its original 50 ms deadline");
      await page.clock.fastForward(1);
      const advanced = await read();
      assert.equal(advanced.fired, 1, "timer fires exactly once at 50 ms");
      assert.equal(advanced.date - paused.date, 50, "Date advances with virtual time after initialization");
      assert.ok(Math.abs(advanced.perf - paused.perf - 50) < 1e-6, "performance advances by the same 50 ms");
      console.log("PASS health clock", JSON.stringify({ latencyMs, target, nodeAge: Date.now() - target, paused, advanced }));
    } finally { await context.close(); }
  }
  console.log("health-clock-prove: both delayed initializations and timer contracts passed");
} finally { await browser.close(); }
