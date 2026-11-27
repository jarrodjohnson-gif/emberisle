#!/usr/bin/env node
// Fixture proof for scripts/flake-rerun.mjs's decision, on a made-up flake list. No network.
// The real .github/flaky.json is checked on its own: it may hold any entries, or none.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decide, loadFlakes } from "./flake-rerun.mjs";

const realText = readFileSync(new URL("../.github/flaky.json", import.meta.url), "utf8");
const scripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts;

// A flake list as flake-rerun.mjs reads it: an array of entries, each with its own string id and a pattern that compiles.
function listed(text, what) {
  const raw = JSON.parse(text).flakes;
  assert.ok(Array.isArray(raw), `${what}: flakes is an array`);
  for (const f of raw) {
    assert.equal(typeof f.id, "string", `${what}: ${JSON.stringify(f.id)} is a string id`);
    // new RegExp(undefined) and new RegExp("") both compile, and match every log.
    assert.ok(typeof f.pattern === "string" && f.pattern !== "", `${what}: ${f.id} has a non-empty pattern`);
    assert.ok(Number.isInteger(f.issue), `${what}: ${f.id} has an integer issue`);
    assert.doesNotThrow(() => new RegExp(f.pattern), `${what}: ${f.id} pattern compiles`);
  }
  const ids = raw.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, `${what}: no id is listed twice`);
  return loadFlakes(text);
}
const flakes = listed(realText, ".github/flaky.json");
for (const f of flakes) assert.ok(Object.hasOwn(scripts, f.id), `${f.id} is a proof in package.json`);

// decide() runs on these made-up entries, through the same loadFlakes the workflow uses, so its scenarios hold
// whatever the real list holds. fixture-alpha-prove is a prefix of the step fixture-alpha-prove-4; fixture-beta-prove's
// signature spans two log lines; fixture-gamma-prove, a browser step, is a suffix of the server proof's id.
const fixtures = listed(JSON.stringify({
  flakes: [
    { id: "fixture-alpha-prove", pattern: "FAIL (host|guest) \\d+x\\d+: the alpha marker is missing\\b", issue: 1 },
    { id: "fixture-beta-prove", pattern: "Z FAIL timed out: beta start\\n\\S+ ##\\[error\\]Process completed", issue: 2 },
    { id: "server-fixture-gamma-prove", pattern: "Error: gamma timeout p0 state:", issue: 3 },
  ],
}), "fixtures");
for (const f of fixtures) assert.equal(f.id in scripts, false, `${f.id} is not a real proof`);
const workflow = readFileSync(new URL("../.github/workflows/flake-rerun.yml", import.meta.url), "utf8");

// Each signature matches the failure text its proof really prints, as it appears in a job log.
const at = "2026-10-19T01:00:00.0000000Z ";
// Empty while .github/flaky.json has no entries; an entry that is added brings its failure text here.
const failures = {
};
const fixtureFailures = {
  "fixture-alpha-prove": `${at}FAIL host 844x390: the alpha marker is missing [{"t":1}]`,
  "fixture-beta-prove": `${at}FAIL timed out: beta start\n${at}##[error]Process completed with exit code 1.`,
  "server-fixture-gamma-prove": `${at}Error: gamma timeout p0 state:`,
};
// Retired signatures (#1323): the fix landed and the tracking issue is closed, so each entry left .github/flaky.json.
// The failure text each one matched is kept here: a failed job that prints it is a real failure and is not re-run.
const retired = {
  // #1733: #1522 fixed the stale-socket race behind this timeout; no CI hit since it landed.
  "server-needs-prove": `${at}Error: timeout p0 state:`,
  "countdown-prove": `${at}FAIL Error: the waited-on seat heard timer_tick, timer_tick, timer_tick, timer_tick, timer_tick`,
  "rotate-overlays-prove": `${at}FAIL locator.waitFor: Timeout 120000ms exceeded.\n${at}  - waiting for getByTestId('chat-sheet') to be visible`,
  "tabs-prove-4": `${at}FAIL timed out: start\n${at}##[error]Process completed with exit code 1.`,
  "flash-prove": `${at}flash-prove failed: page.waitForFunction: Timeout 120000ms exceeded.\n${at}    at settled (/home/runner/work/emberisle/emberisle/scripts/flash-prove.mjs:131:8)`,
  "steal-picker-push-prove": `${at}Error: setup: seeded roll must leave the same player and two legal victims\n${at}    at file:///home/runner/work/emberisle/emberisle/scripts/steal-picker-push-prove.mjs:45:9`,
  "audio-recovery-prove": `${at}page.waitForFunction: Timeout 8000ms exceeded.\n${at}    at /home/runner/work/emberisle/emberisle/scripts/audio-recovery-prove.mjs:163:42`,
  // #1730: no hit in CI from 2026-11-01 to 2026-11-15 (docs/research/flaky-audit-2026-11.md), so these left too.
  "hotseat-prove": `${at}hotseat-prove failed: Error: Leave played ["/audio/click_001.wav","/audio/click_001.wav"], not click_001.wav once`,
  "chat-prove": `${at}FAIL phone game 390x844 {"total":63,"whole":9,"newest":false,"newestText":"Embergame line 6","font":14,"size":"390x844"}: 9 whole chat lines on screen, newest ("Embergame line 6") visible, 14px text\n`,
  "tokens-prove": `${at}FAIL 7 no numeral behind the scenery (1280x720): the 8: 1 of 5 points (hit (-3.144, 1.362, 1.186) on ore seed 450910998)\n`,
  "board-touch-prove": `${at}AssertionError [ERR_ASSERTION]: setup: a tap on a Pasture hex plays nothing\n${at}+ actual - expected`,
  "lobby-layout-prove": `${at}AssertionError [ERR_ASSERTION]: 375x667: "Copy" has at least 8 px between text and button edge (7.3 / 7.2)`,
  "connection-health-prove": `${at}+   saving: false,\n${at}-   saving: true,`,
  // #1726: this pattern no longer matches anything turn-gain-prove prints, so the entry left.
  "turn-gain-prove": `${at}FAIL host 844x390: no gain line is up while "Your turn" is [{"t":1}]`,
};
for (const id of Object.keys(retired)) assert.equal(flakes.some((f) => f.id === id), false, `${id} is retired from flaky.json`);
assert.deepEqual(flakes.map((f) => f.id).sort(), Object.keys(failures).sort());
for (const f of flakes) {
  assert.ok(Number.isInteger(f.issue), `${f.id} has a tracking issue`);
  assert.ok(f.regex.test(failures[f.id]), `${f.id} signature matches its failure`);
  for (const [id, log] of Object.entries(retired)) assert.equal(f.regex.test(log), false, `${f.id} signature is not retired ${id}'s failure`);
}
for (const f of fixtures) assert.ok(f.regex.test(fixtureFailures[f.id]), `${f.id} signature matches its failure`);
// A signature covers every seat and viewport, and any log timestamp, not only the one it was written from.
for (const line of [
  `${at}FAIL guest 390x844: the alpha marker is missing [{"t":1}]`,
  `${at}FAIL host 1280x720: the alpha marker is missing []`,
]) assert.ok(fixtures.find((f) => f.id === "fixture-alpha-prove").regex.test(line), `fixture-alpha-prove signature matches ${JSON.stringify(line)}`);
assert.ok(fixtures.find((f) => f.id === "fixture-beta-prove").regex.test(fixtureFailures["fixture-beta-prove"].replaceAll(at, "2026-11-16T09:30:00.1234567Z ")), "fixture-beta-prove signature matches at another timestamp");
// The passing log line of the same text is not a failure.
assert.equal(fixtures.find((f) => f.id === "fixture-alpha-prove").regex.test(`${at}ok   host 844x390: the alpha marker is missing [{"t":1}]`), false);
// The near misses of each signature that are not that flake: a passing line, a wider failure, or another step's timeout.
const notFlake = {
  "fixture-alpha-prove": [
    `${at}FAIL spectator 844x390: the alpha marker is missing [{"t":1}]`,
    `${at}FAIL host 844x390: the alpha marker is missingly drawn`,
    `${at}FAIL host 844x390: the alpha marker and the beta marker are missing`,
  ],
  "fixture-beta-prove": [
    `${at}FAIL timed out: beta start the game\n${at}##[error]Process completed with exit code 1.`,
    `${at}FAIL timed out: beta start\n${at}FAIL timed out: beta end\n`,
  ],
  "server-fixture-gamma-prove": [`${at}Error: gamma timeout p1 state:`, `${at}Error: gamma timeout p0 welcome:`],
};
for (const [id, lines] of Object.entries(notFlake)) {
  for (const line of lines) assert.equal(fixtures.find((f) => f.id === id).regex.test(line), false, `${id} signature is not ${JSON.stringify(line)}`);
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
  const got = decide({ flakes: fixtures, runAttempt: 1, ...input });
  assert.equal(got.rerun, want, `${label}: ${got.reason}`);
  console.log(`ok   ${label}: ${got.rerun ? "re-run" : "no re-run"}, ${got.reason}`);
  return got;
};

const allFlaky = run([
  ["browser-a (a3)", "fixture-alpha-prove", fixtureFailures["fixture-alpha-prove"]],
  ["browser-b (presentation)", "fixture-beta-prove", fixtureFailures["fixture-beta-prove"]],
  // The browser-a aggregate fails with its suites; like checks, it is not a flake of its own and is skipped.
  ["browser-a", "test", `${at}Process completed with exit code 1.`],
]);
const got = check("every failed job is a known flake", allFlaky, true);
assert.deepEqual(got.jobs, [
  { name: "browser-a (a3)", flakes: ["fixture-alpha-prove"] },
  { name: "browser-b (presentation)", flakes: ["fixture-beta-prove"] },
]);

check("one failed job is not a known flake", run([
  ["browser-a (a3)", "fixture-alpha-prove", fixtureFailures["fixture-alpha-prove"]],
  ["server", "test", `${at}AssertionError: expected 3, got 4`],
]), false);

check("attempt 2 is never re-run", { ...allFlaky, runAttempt: 2 }, false);
check("attempt 3 is never re-run", { ...allFlaky, runAttempt: 3 }, false);

check("an empty flake list never re-runs", { ...allFlaky, flakes: loadFlakes('{"flakes": []}') }, false);

check("no failed jobs", run([]), false);

check("only the aggregate checks job failed", {
  jobs: [job("build", "success"), job("checks", "failure", null)], logs: {},
}, false);

// The signature is in the log, but a different step failed: not that flake.
check("signature in the log, another step failed", run([
  ["browser-a (a3)", "trade-prove", `${fixtureFailures["fixture-alpha-prove"]}\n${at}FAIL trade-prove`],
]), false);

// A suffix proof name is not the flaky proof.
check("step name must be the proof exactly", run([
  ["browser-b (flows-b)", "fixture-alpha-prove-4", fixtureFailures["fixture-alpha-prove"]],
]), false);
// Nor is a longer proof name that ends in the flaky proof's id, nor a step that only ends in "npm run <id>".
check("a proof name ending in the flaky id is not that proof", run([
  ["browser-b (flows-b)", "x-fixture-alpha-prove", fixtureFailures["fixture-alpha-prove"]],
]), false);
const pnpm = run([["browser-b (flows-b)", null, fixtureFailures["fixture-alpha-prove"]]]);
pnpm.jobs[2].steps.splice(1, 0, { name: "Run pnpm run fixture-alpha-prove", conclusion: "failure" });
check("npm run must start the step's command", pnpm, false);

// #1326: a known flake's step in the server job is matched as in a browser job. The browser step that ends the same
// way, fixture-gamma-prove (like needs-prove and server-needs-prove), is not that flake.
const serverNeeds = check("a known flake in the server job is re-run", run([
  ["server", "server-fixture-gamma-prove", fixtureFailures["server-fixture-gamma-prove"]],
]), true);
assert.deepEqual(serverNeeds.jobs, [
  { name: "server", flakes: ["server-fixture-gamma-prove"] },
]);
check("browser fixture-gamma-prove is not the server timeout flake", run([
  ["browser-a (a3)", "fixture-gamma-prove", fixtureFailures["server-fixture-gamma-prove"]],
]), false);

// A retired signature is no longer a flake: its failed job is not re-run, and neither are the near misses it once excluded.
// These run on the real list: they hold trivially while it has no such entry, and fail if one comes back.
const retiredNear = {
  "server-needs-prove": [`${at}Error: timeout p1 state:`, `${at}Error: timeout p0 welcome:`],
  "tabs-prove-4": [`${at}FAIL timed out: start the game\n`, `${at}FAIL timed out: tab B notices the drop\n`],
  "flash-prove": [`${at}flash-prove failed: page.waitForFunction: Timeout 120000ms exceeded.\n${at}    at pieceProof (/x/scripts/flash-prove.mjs:216:9)`],
  "chat-prove": [
    `${at}ok phone game 390x844 {"total":63,"whole":9,"newest":true,"newestText":"Embergame line 6","font":14,"size":"390x844"}: 9 whole chat lines on screen\n`,
    `${at}FAIL phone game 390x844 {"total":63,"whole":9,"newest":true,"newestText":"Embergame line 6","font":12,"size":"390x844"}: 9 whole chat lines on screen\n`,
  ],
  "tokens-prove": [
    `${at}ok   7 no numeral behind the scenery (1280x720): 0 of 90 points\n`,
    `${at}FAIL 7 no numeral behind the scenery (1280x720): the 8: 2 of 5 points (hit (1, 1, 1) on ore seed 1; hit (1, 1, 1) on ore seed 1)\n`,
    `${at}FAIL 7 no numeral behind the scenery (1280x720): the 8: 1 of 5 points (hit (1, 1, 1) on ore seed 1), the 9: 1 of 5 points (hit (1, 1, 1) on ore seed 2)\n`,
  ],
  "board-touch-prove": [`${at}AssertionError [ERR_ASSERTION]: a one-finger drag from a Pasture hex plays nothing\n`],
  "lobby-layout-prove": [
    `${at}AssertionError [ERR_ASSERTION]: 390x844: "Copy" has at least 8 px between text and button edge (7.9 / 7.9)`,
    `${at}AssertionError [ERR_ASSERTION]: 320x568: "Copy" has at least 8 px between text and button edge (7.3 / 7.2)`,
    `${at}AssertionError [ERR_ASSERTION]: 375x667: "Copy" has at least 8 px between text and button edge (not a number)`,
    `${at}AssertionError [ERR_ASSERTION]: 320x568: "Join" has at least 8 px between text and button edge (7.3 / 7.2)`,
    `${at}AssertionError [ERR_ASSERTION]: 375x667: "Copy" has at least 8 px between text and button edge (2.0 / 1.5)`,
    `${at}AssertionError [ERR_ASSERTION]: 375x667: "Send" has at least 8 px between text and button edge (7.3 / 7.2)`,
  ],
};
for (const [step, log] of Object.entries(retired)) {
  check(`retired ${step} signature is not a known flake`, { ...run([["browser-a (a3)", step, log]]), flakes }, false);
}
for (const [step, logs] of Object.entries(retiredNear)) {
  for (const log of logs) check(`retired ${step} near miss is not a known flake`, { ...run([["browser-a (a3)", step, log]]), flakes }, false);
}

const timedOut = run([["browser-a (a3)", "fixture-alpha-prove", fixtureFailures["fixture-alpha-prove"]]]);
timedOut.jobs[2].conclusion = "cancelled";
check("a cancelled or timed-out job is not a flake", timedOut, false);
// A timed-out job is a failed job that is never a flake, so it blocks the re-run of a flaky job beside it.
const timedOutBeside = run([
  ["browser-a (a3)", "fixture-alpha-prove", fixtureFailures["fixture-alpha-prove"]],
  ["browser-b (presentation)", "fixture-beta-prove", fixtureFailures["fixture-beta-prove"]],
]);
timedOutBeside.jobs[3].conclusion = "timed_out";
check("a timed-out job beside a known flake blocks the re-run", timedOutBeside, false);
// The same for a cancelled job: it is a failed job, and never a flake.
const cancelledBeside = run([
  ["browser-a (a3)", "fixture-alpha-prove", fixtureFailures["fixture-alpha-prove"]],
  ["browser-b (presentation)", "fixture-beta-prove", fixtureFailures["fixture-beta-prove"]],
]);
cancelledBeside.jobs[3].conclusion = "cancelled";
check("a cancelled job beside a known flake blocks the re-run", cancelledBeside, false);

// A failed job with no failed step is not a flake, even when its log holds a signature.
const noFailedStep = run([["browser-a (a3)", "fixture-alpha-prove", fixtureFailures["fixture-alpha-prove"]]]);
noFailedStep.jobs[2].steps[1].conclusion = "success";
check("a failed job with no failed step is not a flake", noFailedStep, false);

check("a failed job with no log is not a flake", { ...allFlaky, logs: {} }, false);

// Every failed step in a job must be a flake, not just one of them.
const twoSteps = run([["browser-a (a3)", "fixture-alpha-prove", `${fixtureFailures["fixture-alpha-prove"]}\n${at}FAIL trade-prove`]]);
twoSteps.jobs[2].steps.splice(2, 0, { name: "Run npm run trade-prove", conclusion: "failure" });
check("one job, two failed steps, only one a known flake", twoSteps, false);

// Each real entry, through the same decide(), re-runs a job that prints its failure.
for (const f of flakes) check(`real ${f.id} is a known flake`, { ...run([["browser-a (a3)", f.id, failures[f.id]]]), flakes }, true);

// The workflow never runs PR code: it checks out the default branch only, and has no head ref anywhere.
assert.match(workflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
assert.equal(/head_(branch|repository)|pull_request\.head|refs\/pull/.test(workflow), false);
assert.match(workflow, /workflows: \[CI\]/);
const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
assert.match(ci, /^name: CI$/m, "flake-rerun listens for the workflow named CI");
assert.match(ci, /^ {2}checks:$/m, "the aggregate job is still called checks");

console.log("flake-rerun-prove: ok");
