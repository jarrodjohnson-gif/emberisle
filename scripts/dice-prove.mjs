// Run: node --import ./server/register.mjs scripts/dice-prove.mjs
// Sampling detects some bias and dependence; it cannot prove cryptographic randomness.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { performance } from "node:perf_hooks";

const started = performance.now();
const samples = 600_000;
const rulesURL = new URL("../src/lib/game/rules.ts", import.meta.url).href;
// Expose the private function in memory only. Keep its implementation and the
// normal applyAction module intact; no extracted/reimplemented RNG or disk edits.
const hook = registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (url !== rulesURL) return loaded;
    return { ...loaded, source: `${readFileSync(new URL(url), "utf8")}\nexport { rollDie as proofRollDie };\n` };
  },
});
const { applyAction, legalRoads, legalSettle, proofRollDie: rollDie } = await import(rulesURL);
hook.deregister();
const { createGame } = await import("../src/lib/game/board.ts");
assert.equal(typeof rollDie, "function");

function act(state, action) {
  const result = applyAction(state, state.current, action);
  assert.equal(result.error, undefined, JSON.stringify(action));
  return result.state;
}

// Settle a real board once. Reusing the same input resets phase, goods, bank,
// log and roll count without bypassing applyAction's clone or production code.
let fixture = createGame({ humans: [{ name: "A" }, { name: "B" }, { name: "C" }], bots: 0, seed: 687 });
for (let steps = 0; fixture.phase !== "roll"; steps++) {
  assert.ok(steps < 1000, "setup must terminate");
  const action = fixture.phase === "rollOff" ? { type: "roll" }
    : fixture.phase === "setupSettle" ? { type: "setupSettle", vertexId: legalSettle(fixture, fixture.current, true)[0] }
    : { type: "setupRoad", edgeId: legalRoads(fixture, fixture.current, true)[0] };
  fixture = act(fixture, action);
}
const baseline = structuredClone(fixture);

function withWords(words, check) {
  const original = crypto.getRandomValues;
  let used = 0;
  try {
    crypto.getRandomValues = (buffer) => {
      assert.ok(buffer instanceof Uint32Array && buffer.length === 1);
      assert.ok(used < words.length, "unexpected extra entropy request");
      buffer[0] = words[used++];
      return buffer;
    };
    check();
    assert.equal(used, words.length, "entropy words must be consumed");
  } finally {
    crypto.getRandomValues = original;
  }
  assert.equal(crypto.getRandomValues, original);
}

// 2^32 = 6 * 715827882 + 4. Accept 0..4294967291; reject all four tails.
withWords([0, 1, 2, 3, 4, 5, 4294967291], () => {
  for (const face of [1, 2, 3, 4, 5, 6, 6]) assert.equal(rollDie(), face);
});
withWords([4294967292, 4294967293, 4294967294, 4294967295, 6], () => assert.equal(rollDie(), 1));
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
  withWords([a - 1, b - 1], () => {
    const next = act(fixture, { type: "roll", dice: [6, 6] });
    assert.deepEqual(next.dice, [a, b], "action must use two entropy draws, ignoring supplied dice");
    assert.equal(next.rolls, (fixture.rolls ?? 0) + 1);
    assert.equal(next.rng, fixture.rng, "board seed must not drive dice");
    assert.equal(next.phase, a + b === 7 ? "robber" : "main");
  });
}
const rollOff = createGame({ humans: [{ name: "A" }, { name: "B" }, { name: "C" }], bots: 0, seed: 687 });
withWords([4294967295, 4], () => {
  const next = act(rollOff, { type: "roll" });
  assert.equal(next.rollOff.rolls[rollOff.current], 5);
  assert.equal(next.rng, rollOff.rng);
});
console.log("PASS boundaries: six faces, accepted upper edge, four rejected tails, 36 action pairs, roll-off, forged dice ignored; crypto restored");

class Correlation {
  n = 0; x = 0; y = 0; xx = 0; yy = 0; xy = 0;
  add(x, y) { this.n++; this.x += x; this.y += y; this.xx += x * x; this.yy += y * y; this.xy += x * y; }
  value() {
    const variance = (this.n * this.xx - this.x ** 2) * (this.n * this.yy - this.y ** 2);
    return variance > 0 ? (this.n * this.xy - this.x * this.y) / Math.sqrt(variance) : NaN;
  }
}
const chiSquare = (observed, expected) => observed.reduce((sum, count, i) => sum + (count - expected[i]) ** 2 / expected[i], 0);
// Laurent-Massart's chi-square bound: P(X >= df + 2sqrt(df*t) + 2t) <= exp(-t).
// With t=ln(10^12), each asymptotic chi-square tail is <= 10^-12.
// Expected cells exceed 16k. These are conservative diagnostics, not exact p-values.
const chiLimit = (df) => df + 2 * Math.sqrt(df * Math.log(1e12)) + 2 * Math.log(1e12);
const uniform = (n, bins) => Array(bins).fill(n / bins);

class Series {
  n = 0; faces = Array(6).fill(0); second = Array(6).fill(0); sums = Array(11).fill(0); pairs = Array(36).fill(0);
  serial = new Correlation(); serialSecond = new Correlation(); serialSum = new Correlation(); cross = new Correlation(); previous = null;
  add(a, b) {
    assert.ok(Number.isInteger(a) && a >= 1 && a <= 6, `invalid die: ${a}`);
    this.n++; this.faces[a - 1]++;
    if (b !== undefined) {
      assert.ok(Number.isInteger(b) && b >= 1 && b <= 6, `invalid second die: ${b}`);
      this.second[b - 1]++; this.sums[a + b - 2]++; this.pairs[(a - 1) * 6 + b - 1]++; this.cross.add(a, b);
    }
    if (this.previous) {
      this.serial.add(this.previous[0], a);
      if (b !== undefined) { this.serialSecond.add(this.previous[1], b); this.serialSum.add(this.previous[0] + this.previous[1], a + b); }
    }
    this.previous = [a, b];
  }
  checks(paired) {
    const checks = [{ name: "first faces chi2(df=5)", value: chiSquare(this.faces, uniform(this.n, 6)), limit: chiLimit(5) }];
    const corr = (name, data) => ({ name, value: Math.abs(data.value()), limit: 8 / Math.sqrt(data.n) });
    checks.push(corr("first lag-1 |r|", this.serial));
    if (paired) {
      checks.push(
        { name: "second faces chi2(df=5)", value: chiSquare(this.second, uniform(this.n, 6)), limit: chiLimit(5) },
        { name: "sums chi2(df=10)", value: chiSquare(this.sums, [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1].map((weight) => this.n * weight / 36)), limit: chiLimit(10) },
        { name: "joint pairs chi2(df=35)", value: chiSquare(this.pairs, uniform(this.n, 36)), limit: chiLimit(35) },
        corr("between dice |r|", this.cross), corr("second lag-1 |r|", this.serialSecond), corr("sum lag-1 |r|", this.serialSum),
      );
    }
    return checks.map((check) => ({ ...check, pass: Number.isFinite(check.value) && check.value < check.limit }));
  }
}

// The same analyzer must reject known defects. The serial control has exactly
// uniform faces, joint pairs and triangular sums, but repeats each pair in blocks.
const biased = new Series(), coupled = new Series(), serial = new Series();
for (let i = 0; i < 36_000; i++) {
  biased.add(i % 2 ? 6 : i % 6 + 1);
  coupled.add(i % 6 + 1, i % 6 + 1);
  const pair = Math.floor(i / 100) % 36;
  serial.add(Math.floor(pair / 6) + 1, pair % 6 + 1);
}
assert.equal(biased.checks(false).find((c) => c.name.startsWith("first faces")).pass, false);
assert.equal(coupled.checks(true).find((c) => c.name.startsWith("between dice")).pass, false);
assert.ok(serial.checks(true).filter((c) => c.name.includes("chi2")).every((c) => c.pass));
assert.equal(serial.checks(true).find((c) => c.name.startsWith("sum lag-1")).pass, false);
console.log("PASS negative controls: biased faces, coupled dice, serial dependence with correct marginals and sums rejected");

function report(label, series, paired) {
  console.log(`${label}: ${series.n} samples; faces=${series.faces.join(",")}${paired ? `; second=${series.second.join(",")}; sums(2..12)=${series.sums.join(",")}` : ""}`);
  for (const check of series.checks(paired)) {
    console.log(`${check.pass ? "PASS" : "FAIL"} ${label} ${check.name}: ${check.value.toFixed(6)} < ${check.limit.toFixed(6)}`);
    assert.ok(check.pass, `${label}: ${check.name}`);
  }
}
const direct = new Series();
for (let i = 0; i < samples; i++) direct.add(rollDie());
report("rollDie", direct, false);
const actions = new Series();
for (let i = 0; i < samples; i++) {
  const next = act(fixture, { type: "roll" });
  assert.equal(next.rng, fixture.rng);
  assert.equal(next.rolls, (fixture.rolls ?? 0) + 1);
  actions.add(...next.dice);
  if ((i + 1) % 100_000 === 0) console.log(`roll action progress: ${i + 1}/${samples}`);
}
report("roll action", actions, true);
assert.deepEqual(fixture, baseline, "sampling must not mutate its valid input fixture");
console.log(`PASS dice proof: ${samples} direct draws + ${samples} full roll actions; ${((performance.now() - started) / 1000).toFixed(2)}s`);
console.log("Scope: sampled frequencies and linear lag-1 dependence; not a proof of randomness or a live WebSocket/browser test.");
