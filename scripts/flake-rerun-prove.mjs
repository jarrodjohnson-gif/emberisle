#!/usr/bin/env node
// Fixture proof for scripts/flake-rerun.mjs's decision, against the real .github/flaky.json. No network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decide, loadFlakes } from "./flake-rerun.mjs";

const flakes = loadFlakes(readFileSync(new URL("../.github/flaky.json", import.meta.url), "utf8"));
const workflow = readFileSync(new URL("../.github/workflows/flake-rerun.yml", import.meta.url), "utf8");

// Each signature matches the failure text its proof really prints, as it appears in a job log.
const at = "2026-10-19T01:00:00.0000000Z ";
const failures = {
  "countdown-prove": `${at}FAIL Error: the waited-on seat heard timer_tick, timer_tick, timer_tick, timer_tick, timer_tick`,
  "rotate-overlays-prove": `${at}FAIL locator.waitFor: Timeout 120000ms exceeded.\n${at}  - waiting for getByTestId('chat-sheet') to be visible`,
  "hotseat-prove": `${at}hotseat-prove failed: Error: Leave played ["/audio/click_001.wav","/audio/click_001.wav"], not click_001.wav once`,
  "turn-gain-prove": `${at}FAIL host 844x390: no gain line is up while "Your turn" is [{"t":1}]`,
  "chat-prove": `${at}FAIL phone game 390x844 {"total":63,"whole":9,"newest":false,"newestText":"Embergame line 6","font":14,"size":"390x844"}: 9 whole chat lines on screen, newest ("Embergame line 6") visible, 14px text\n`,
  "tokens-prove": `${at}FAIL 7 no numeral behind the scenery (1280x720): the 8: 1 of 5 points (hit (-3.144, 1.362, 1.186) on ore seed 450910998)\n`,
  "tabs-prove-4": `${at}FAIL timed out: start\n${at}##[error]Process completed with exit code 1.`,
  "board-touch-prove": `${at}AssertionError [ERR_ASSERTION]: setup: a tap on a Pasture hex plays nothing\n${at}+ actual - expected`,
  "flash-prove": `${at}flash-prove failed: page.waitForFunction: Timeout 120000ms exceeded.\n${at}    at settled (/home/runner/work/emberisle/emberisle/scripts/flash-prove.mjs:131:8)`,
  "lobby-layout-prove": `${at}AssertionError [ERR_ASSERTION]: 375x667: "Copy" has at least 8 px between text and button edge (7.3 / 7.2)`,
  "connection-health-prove": `${at}+   saving: false,\n${at}-   saving: true,`,
  "steal-picker-push-prove": `${at}Error: setup: seeded roll must leave the same player and two legal victims\n${at}    at file:///home/runner/work/emberisle/emberisle/scripts/steal-picker-push-prove.mjs:45:9`,
  "audio-recovery-prove": `${at}page.waitForFunction: Timeout 8000ms exceeded.\n${at}    at /home/runner/work/emberisle/emberisle/scripts/audio-recovery-prove.mjs:163:42`,
};
assert.deepEqual(flakes.map((f) => f.id).sort(), Object.keys(failures).sort());
for (const f of flakes) {
  assert.ok(Number.isInteger(f.issue), `${f.id} has a tracking issue`);
  assert.ok(f.regex.test(failures[f.id]), `${f.id} signature matches its failure`);
}
// The passing log line of the same text is not a failure.
assert.equal(flakes.find((f) => f.id === "hotseat-prove").regex.test(`${at}Leave played ["/audio/click_001.wav"]`), false);
// The near misses of each signature that are not that flake: a passing line, a wider failure, or another step's timeout.
const notFlake = {
  "chat-prove": [
    `${at}ok phone game 390x844 {"total":63,"whole":9,"newest":true,"newestText":"Embergame line 6","font":14,"size":"390x844"}: 9 whole chat lines on screen\n`,
    `${at}FAIL phone game 390x844 {"total":63,"whole":9,"newest":true,"newestText":"Embergame line 6","font":12,"size":"390x844"}: 9 whole chat lines on screen\n`,
  ],
  "tokens-prove": [
    `${at}ok   7 no numeral behind the scenery (1280x720): 0 of 90 points\n`,
    `${at}FAIL 7 no numeral behind the scenery (1280x720): the 8: 2 of 5 points (hit (1, 1, 1) on ore seed 1; hit (1, 1, 1) on ore seed 1)\n`,
    `${at}FAIL 7 no numeral behind the scenery (1280x720): the 8: 1 of 5 points (hit (1, 1, 1) on ore seed 1), the 9: 1 of 5 points (hit (1, 1, 1) on ore seed 2)\n`,
  ],
  "tabs-prove-4": [`${at}FAIL timed out: start the game\n`, `${at}FAIL timed out: tab B notices the drop\n`],
  "board-touch-prove": [`${at}AssertionError [ERR_ASSERTION]: a one-finger drag from a Pasture hex plays nothing\n`],
  "flash-prove": [`${at}flash-prove failed: page.waitForFunction: Timeout 120000ms exceeded.\n${at}    at pieceProof (/x/scripts/flash-prove.mjs:216:9)`],
  "lobby-layout-prove": [
    `${at}AssertionError [ERR_ASSERTION]: 375x667: "Copy" has at least 8 px between text and button edge (not a number)`,
    `${at}AssertionError [ERR_ASSERTION]: 320x568: "Copy" has at least 8 px between text and button edge (7.3 / 7.2)`,
    `${at}AssertionError [ERR_ASSERTION]: 375x667: "Copy" has at least 8 px between text and button edge (2.0 / 1.5)`,
    `${at}AssertionError [ERR_ASSERTION]: 375x667: "Send" has at least 8 px between text and button edge (7.3 / 7.2)`,
  ],
};
for (const [id, lines] of Object.entries(notFlake)) {
  for (const line of lines) assert.equal(flakes.find((f) => f.id === id).regex.test(line), false, `${id} signature is not ${JSON.stringify(line)}`);
}

let id = 0;
const job = (name, conclusion, step) => ({
  id: ++id, name, conclusion,
  steps: [
    { name: "Run npm ci", conclusion: "success" },
    ...(step ? [{ name: `Run npm run ${step}`, conclusion }] : []),
    { name: "Run actions/upload-artifact@v4", conclusion: "success" },
  ],
});
function run(spec) {
  const jobs = [job("changes", "success"), job("build", "success")];
  const logs = {};
  for (const [name, step, log] of spec) {
    const j = job(name, "failure", step);
    jobs.push(j);
    logs[j.id] = log;
  }
  jobs.push(job("checks", spec.length ? "failure" : "success", null));
  return { jobs, logs };
}
const check = (label, input, want) => {
  const got = decide({ flakes, runAttempt: 1, ...input });
  assert.equal(got.rerun, want, `${label}: ${got.reason}`);
  console.log(`ok   ${label}: ${got.rerun ? "re-run" : "no re-run"}, ${got.reason}`);
  return got;
};

const allFlaky = run([
  ["browser-a (a3)", "countdown-prove", failures["countdown-prove"]],
  ["browser-b (presentation)", "turn-gain-prove", failures["turn-gain-prove"]],
  // The browser-a aggregate fails with its suites; like checks, it is not a flake of its own and is skipped.
  ["browser-a", "test", `${at}Process completed with exit code 1.`],
]);
const got = check("every failed job is a known flake", allFlaky, true);
assert.deepEqual(got.jobs, [
  { name: "browser-a (a3)", flakes: ["countdown-prove"] },
  { name: "browser-b (presentation)", flakes: ["turn-gain-prove"] },
]);

check("one failed job is not a known flake", run([
  ["browser-a (a3)", "countdown-prove", failures["countdown-prove"]],
  ["server", "test", `${at}AssertionError: expected 3, got 4`],
]), false);

check("attempt 2 is never re-run", { ...allFlaky, runAttempt: 2 }, false);

check("no failed jobs", run([]), false);

check("only the aggregate checks job failed", {
  jobs: [job("build", "success"), job("checks", "failure", null)], logs: {},
}, false);

// The signature is in the log, but a different step failed: not that flake.
check("signature in the log, another step failed", run([
  ["browser-a (a3)", "trade-prove", `${failures["countdown-prove"]}\n${at}FAIL trade-prove`],
]), false);

// A suffix proof name is not the flaky proof.
check("step name must be the proof exactly", run([
  ["browser-b (flows-b)", "rotate-overlays-prove-4", failures["rotate-overlays-prove"]],
]), false);

const timedOut = run([["browser-a (a3)", "countdown-prove", failures["countdown-prove"]]]);
timedOut.jobs[2].conclusion = "cancelled";
check("a cancelled or timed-out job is not a flake", timedOut, false);

check("a failed job with no log is not a flake", { ...allFlaky, logs: {} }, false);

// Every failed step in a job must be a flake, not just one of them.
const twoSteps = run([["browser-a (a3)", "countdown-prove", `${failures["countdown-prove"]}\n${at}FAIL trade-prove`]]);
twoSteps.jobs[2].steps.splice(2, 0, { name: "Run npm run trade-prove", conclusion: "failure" });
check("one job, two failed steps, only one a known flake", twoSteps, false);

// The workflow never runs PR code: it checks out the default branch only, and has no head ref anywhere.
assert.match(workflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
assert.equal(/head_(branch|repository)|pull_request\.head|refs\/pull/.test(workflow), false);
assert.match(workflow, /workflows: \[CI\]/);
const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
assert.match(ci, /^name: CI$/m, "flake-rerun listens for the workflow named CI");
assert.match(ci, /^ {2}checks:$/m, "the aggregate job is still called checks");

console.log("flake-rerun-prove: ok");
