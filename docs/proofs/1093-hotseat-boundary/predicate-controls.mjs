// Execute the actual old/new predicate bodies; no copied acceptance algorithm.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { chromium } from 'playwright';
function extract(source) {
  const anchor = source.indexOf('  // Clips start 150 ms apart');
  const start = source.indexOf('await page.waitForFunction(', anchor) + 'await page.waitForFunction('.length;
  const end = source.indexOf('}, 400, { timeout: 4000 });', start);
  assert.ok(anchor >= 0 && end > start);
  return source.slice(start, end + 1);
}
const before = extract(execFileSync('git', ['show', 'f334d47:scripts/hotseat-prove.mjs'], { encoding: 'utf8' }));
const after = extract(readFileSync('scripts/hotseat-prove.mjs', 'utf8'));
const pending = { __plays: [], __quietN: 0, __quietAt: 0, __pendingPumps: 1 };
const run = (body, window) => vm.runInNewContext('(' + body + ')(400)', { window, performance: { now: () => 600 } });
assert.equal(run(before, { ...pending }), true);
assert.equal(run(after, { ...pending }), false);
assert.equal(run(after, { ...pending, __pendingPumps: 0 }), true);
// A playback count change must still restart the original 400ms interval.
assert.equal(run(after, { ...pending, __pendingPumps: 0, __plays: ['clip'] }), false);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const result = { oldAcceptsQuietPending: true, newRejectsQuietPending: true, drainedAccepted: true, countChangeResetsQuiet: true };
try {
  const page = await browser.newPage();
  await page.goto('about:blank');
  await page.evaluate(() => { window.__plays = []; window.__quietN = 0; window.__quietAt = performance.now() - 600; window.__pendingPumps = 1; });
  await page.waitForFunction(Function('return (' + before + ')')(), 400, { timeout: 4000 });
  const start = Date.now();
  let rejected = false;
  try { await page.waitForFunction(Function('return (' + after + ')')(), 400, { timeout: 4000 }); }
  catch (e) { assert.equal(e.name, 'TimeoutError'); rejected = true; }
  assert.equal(rejected, true, 'an undrained pump cannot pass the unchanged deadline');
  result.undrainedRejectedAtExisting4000msDeadline = true;
  result.observedTimeoutWallMs = Date.now() - start;
  assert.equal(await page.evaluate(() => window.__pendingPumps), 1);
} finally { await browser.close(); }
writeFileSync('/tmp/issue1093-predicate-controls.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
